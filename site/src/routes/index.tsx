import { useEffect, useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowDown, BookOpen, Flame, Github, KeyRound, ShieldAlert, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import {
  BURN_ZKEY_PER_KEY,
  KEYS_OUTSTANDING_FALLBACK,
  KEY_MINT,
  ZKEY_MINT,
  baseKeySol as calcBase,
  feePerKeySol as calcFeePerKey,
  feesFromVolumeSol,
  fetchHoldings,
  fetchKeyMetrics,
  fetchMarketLive,
  fetchRedeemQueue,
  queueRedeem,
  type Holdings,
  type RedeemRequest,
} from '@/lib/key-value'
import { burnAndMintKey, burnKeyTokens, syncKeysFromChain } from '@/lib/key-mint'

import keyAsset from '@/assets/zkey-key.png.asset.json'
import logoKeyAsset from '@/assets/zkey-key-horizontal.png.asset.json'

export const Route = createFileRoute('/')({
  component: ZkeyApp,
  head: () => ({
    meta: [
      { title: 'ZKEY — Burn ZKEY → KEY → private ZEC' },
      {
        name: 'description',
        content:
          'ZKEY is a minimal two-step burner: burn ZKEY for KEY, then burn KEY for private ZEC sent to your shielded address. Sample mode until launch.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: 'ZKEY — Burn ZKEY → KEY → private ZEC' },
      {
        property: 'og:description',
        content: 'Burn ZKEY for KEY, then burn KEY for private ZEC. Live market cap; burns still sample.',
      },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: 'ZKEY — Burn ZKEY → KEY → private ZEC' },
      {
        name: 'twitter:description',
        content: 'Burn ZKEY for KEY, then burn KEY for private ZEC. Live market cap; burns still sample.',
      },
    ],
  }),
})

// Mint address (CA). Empty = SAMPLE sim, no live feeds.
const PENDING_MINT = ZKEY_MINT

type Step = 'burn' | 'mint'

// KEY economics model (shared math lives in @/lib/key-value):
//   BURN_ZKEY_PER_KEY = 1,000,000 $ZKEY burned to mint 1 KEY
//   baseKeySol   = mcSol * KEY_MC_SHARE (0.01% of MC — NOT tied to burn amount)
//   feesGenerated = volumeUsd * FEE_RATE (0.03%); feesToKeys = feesGenerated * 80%
//   feePerKeySol = (feesToKeysSol) / max(keysOutstanding, 1)
//   keyValueSol  = base + fees; claim by burning KEY.
// LIVE when ZKEY_MINT is set: MC from DexScreener every 3s, fees from the
// key_metrics row every 3s (browser-driven, no backend cron). No mint → sim.
const SAMPLE_SOL_PRICE = 150 // display-only conversion for the sample MC random-walk
const POLL_MS = 3_000


function ZkeyApp() {
  const [hasPhantom, setHasPhantom] = useState<boolean | null>(null)
  const [wallet, setWallet] = useState<string | null>(null)
  const [zecAddress, setZecAddress] = useState('')
  const [step, setStep] = useState<Step>('burn')
  const [zkeyAmount, setZkeyAmount] = useState('')
  const [keyAmount, setKeyAmount] = useState('')
  const [holdings, setHoldings] = useState<Holdings>({ zkey: null, keys: null })
  const legacyKeyCount = holdings.legacyMints?.length ?? 0
  const burnableKeyBalance = (holdings.keys ?? 0) > 0
    ? holdings.keys
    : (legacyKeyCount > 0 ? legacyKeyCount : holdings.keys)

  const fmtBal = (n: number | null, unit: string) =>
    n === null ? `— ${unit}` : `${n.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${unit}`

  const detected =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { solana?: { isPhantom?: boolean } }).solana?.isPhantom)

  if (hasPhantom === null && detected) setHasPhantom(true)

  const trimmedAddress = zecAddress.trim()
  const isTransparent = /^t[13][a-zA-Z0-9]{33}$/.test(trimmedAddress)
  const addressLooksShielded = /^(z|ua1)/.test(trimmedAddress) && trimmedAddress.length >= 12

  // Step 1 live calc: floor(zkey / BURN_ZKEY_PER_KEY) KEY
  const parsedZkey = Number.parseFloat(zkeyAmount)
  const keysOut =
    Number.isFinite(parsedZkey) && parsedZkey > 0
      ? Math.floor(parsedZkey / BURN_ZKEY_PER_KEY)
      : 0

  // SAMPLE value sim — only runs when there is no mint. Clearly labeled
  // "sim · pending CA". Random-walks MC, ticks fees, mints/claims keys.
  const [sim, setSim] = useState({ mcSol: 55_000 / SAMPLE_SOL_PRICE, fees: 2.0, keys: 400 })
  useEffect(() => {
    if (ZKEY_MINT) return // real feeds replace the sim at launch
    const id = setInterval(() => {
      setSim((s) => {
        let { mcSol, fees, keys } = s
        const r = Math.random()
        mcSol = Math.max(20, mcSol * (1 + (Math.random() - 0.5) * 0.02)) // MC drift ±1%
        if (r < 0.5) fees += Math.random() * 0.05 // volume → fees accumulate
        else if (r < 0.75) keys += 1 // simulated burn mints a KEY
        else keys = Math.max(1, keys - (Math.random() < 0.5 ? 1 : 2)) // simulated claims
        return { mcSol, fees, keys }
      })
    }, 2000)
    return () => clearInterval(id)
  }, [])

  // LIVE feeds — MC from our server proxy (DexScreener) + fees/keys/MC snapshot
  // from key_metrics, every 3s. key_metrics is the fallback when Dex is blocked.
  const [live, setLive] = useState<{
    mcSol: number | null
    fees: number | null
    keys: number | null
    metricsMcSol: number | null
    metricsKeyValue: number | null
    volumeUsd: number | null
  }>({
    mcSol: null,
    fees: null,
    keys: null,
    metricsMcSol: null,
    metricsKeyValue: null,
    volumeUsd: null,
  })
  useEffect(() => {
    if (!ZKEY_MINT) return
    let cancelled = false
    const tick = async () => {
      const [market, metrics] = await Promise.all([fetchMarketLive(ZKEY_MINT), fetchKeyMetrics()])
      if (cancelled) return
      // fees are derived from trading volume: volumeUsd * 0.03%, converted to SOL
      const volumeUsd = market?.volumeUsd ?? metrics?.volumeUsd ?? null
      const derivedFees =
        volumeUsd !== null && market?.solPriceUsd
          ? feesFromVolumeSol(volumeUsd, market.solPriceUsd)
          : null
      setLive((prev) => ({
        mcSol: market?.mcSol ?? prev.mcSol,
        volumeUsd: volumeUsd ?? prev.volumeUsd,
        fees: derivedFees ?? metrics?.feesVaultSol ?? prev.fees,
        keys: metrics?.keysOutstanding ?? prev.keys,
        metricsMcSol: metrics?.mcSol ?? prev.metricsMcSol,
        metricsKeyValue: metrics?.keyValueSol ?? prev.metricsKeyValue,
      }))
    }
    void tick()
    const id = setInterval(() => void tick(), POLL_MS)
    // Periodically recount the KEY collection on-chain so keys_outstanding
    // never drifts from reality (cheap: once a minute, server-side).
    const syncNow = async () => {
      const total = await syncKeysFromChain()
      if (!cancelled && total !== null) setLive((prev) => ({ ...prev, keys: total }))
    }
    void syncNow()
    const syncId = setInterval(() => void syncNow(), 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
      clearInterval(syncId)
    }
  }, [])

  const isLive = Boolean(ZKEY_MINT)
  // Prefer DexScreener MC; fall back to the last MC stored in key_metrics.
  const mcSol = isLive ? live.mcSol ?? live.metricsMcSol : sim.mcSol
  const feesVault = isLive ? live.fees : sim.fees
  const keysOutstanding = isLive ? live.keys ?? KEYS_OUTSTANDING_FALLBACK : sim.keys

  const baseKeySol = mcSol === null ? null : calcBase(mcSol)
  const feePerKeySol = feesVault === null ? null : calcFeePerKey(feesVault, keysOutstanding)
  const computedKeyValue =
    baseKeySol === null && feePerKeySol === null ? null : (baseKeySol ?? 0) + (feePerKeySol ?? 0)
  // Never show "—" when key_metrics already carries a key value.
  const keyValueSol = computedKeyValue ?? (isLive ? live.metricsKeyValue : null)
  const prevValueRef = useRef<number | null>(null)
  const valueUp = prevValueRef.current === null || (keyValueSol ?? 0) >= prevValueRef.current
  useEffect(() => {
    if (keyValueSol !== null) prevValueRef.current = keyValueSol
  }, [keyValueSol])

  const fmt = (n: number | null, d = 2) => (n === null ? '—' : n.toFixed(d))
  const parsedKeyAmount = Number.parseFloat(keyAmount)
  const estClaimSol =
    keyValueSol !== null && Number.isFinite(parsedKeyAmount) && parsedKeyAmount > 0
      ? keyValueSol * parsedKeyAmount
      : null

  // Quiet value line shown inside the card on both steps
  const valueLine = (
    <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-[#7a6420]/70">
      <KeyRound className="size-3 shrink-0" />
      KEY · {fmt(keyValueSol, 4)} SOL
      {valueUp ? (
        <TrendingUp className="size-3 text-[#b3871a]" />
      ) : (
        <TrendingDown className="size-3 text-[#b3871a]" />
      )}
    </p>
  )



  const connectPhantom = async () => {
    if (!detected) {
      setHasPhantom(false)
      return
    }
    setHasPhantom(true)
    try {
      const provider = (window as unknown as { solana: { connect: () => Promise<{ publicKey: { toString(): string } }> } }).solana
      const res = await provider.connect()
      setWallet(res.publicKey.toString())
    } catch {
      toast.error('Connection rejected in Phantom.')
    }
  }

  const sampleToast = () => toast('Wire mint + burn program after launch')

  // ---- Step 1: atomic burn ZKEY + mint KEY NFT (one Phantom popup) -------
  const [minting, setMinting] = useState(false)
  const [mintPhase, setMintPhase] = useState<'idle' | 'sign' | 'confirm'>('idle')

  const submitKeyMint = async () => {
    if (!wallet) return
    if (keysOut < 1) {
      toast.error(`Enter at least ${BURN_ZKEY_PER_KEY.toLocaleString()} ZKEY (1 KEY).`)
      return
    }
    setMinting(true)
    setMintPhase('sign')
    const res = await burnAndMintKey({ solWallet: wallet, keys: 1, mode: 'prod' })
    setMintPhase('idle')
    setMinting(false)

    if (!res.ok) {
      if (res.code === 'mint_authority_not_configured') {
        toast.error('Mint authority not configured — add KEY_MINT_AUTHORITY_JSON in Lovable secrets')
      } else if (res.code === 'confirm_timeout' && res.signature) {
        const sig = res.signature
        toast('Sent — still confirming on-chain', {
          description: 'Check the transaction on Solscan',
          action: { label: 'Solscan', onClick: () => window.open(`https://solscan.io/tx/${sig}`, '_blank') },
        })
        void refreshHoldings(wallet)
      } else {
        toast.error(res.error ?? 'Mint failed — nothing was burned.')
      }
      return
    }


    toast.success('KEY minted', {
      description: 'View on Solscan',
      action: {
        label: 'Solscan',
        onClick: () => window.open(`https://solscan.io/tx/${res.signature}`, '_blank'),
      },
    })
    // Optimistic: the mint is confirmed on-chain, so reflect it before indexers catch up.
    setHoldings((h) => ({
      zkey: h.zkey == null ? h.zkey : Math.max(0, h.zkey - BURN_ZKEY_PER_KEY),
      keys: (h.keys ?? 0) + 1,
    }))
    setStep('mint')
    void refreshHoldings(wallet)

    if (ZKEY_MINT) {
      const total = await syncKeysFromChain()
      if (total !== null) setLive((prev) => ({ ...prev, keys: total }))
    } else {
      setSim((s) => ({ ...s, keys: s.keys + 1 }))
    }
  }


  // ---- Real redeem queue (bot payout pipeline) -------------------------
  // On-chain KEY burn is still SAMPLE (burn_tx stays null), but the queue row
  // is real: the payout bot picks up pending rows and sends ZEC from treasury.
  const [queue, setQueue] = useState<Array<RedeemRequest>>([])
  const [queueing, setQueueing] = useState(false)
  const [burnPhase, setBurnPhase] = useState<'idle' | 'signing' | 'confirming'>('idle')

  const refreshQueue = async (w: string) => setQueue(await fetchRedeemQueue(w))

  useEffect(() => {
    if (!wallet) {
      setQueue([])
      return
    }
    void refreshQueue(wallet)
  }, [wallet])

  // ---- Wallet holdings (fungible KEY plus burnable legacy KEYs) -----------
  const refreshHoldings = async (w: string) => setHoldings(await fetchHoldings(w))

  useEffect(() => {
    if (!wallet) {
      setHoldings({ zkey: null, keys: null })
      return
    }
    void refreshHoldings(wallet)
    const id = setInterval(() => void refreshHoldings(wallet), 15_000)
    return () => clearInterval(id)
  }, [wallet])

  const submitRedeem = async () => {
    if (!wallet || !addressLooksShielded) return
    const amount = Number.parseFloat(keyAmount)
    let keysBurned = Number.isFinite(amount) && amount > 0 ? amount : 1
    // No fungible KEY but a legacy unique KEY NFT is held → burn that one.
    const legacyMint =
      (holdings.keys ?? 0) < 1 && (holdings.legacyMints?.length ?? 0) > 0
        ? (holdings.legacyMints?.[0] ?? null)
        : null
    if (legacyMint) keysBurned = 1
    setQueueing(true)
    // Real on-chain KEY burn first — the queue row records its signature.
    const burn = await burnKeyTokens({
      solWallet: wallet,
      keys: Math.floor(keysBurned),
      nftMint: legacyMint,
      onPhase: setBurnPhase,
    })
    setBurnPhase('idle')
    if (!burn.ok || !burn.signature) {
      setQueueing(false)
      toast.error(burn.error ?? 'KEY burn failed — nothing was burned.')
      return
    }
    const res = await queueRedeem({
      burnTx: burn.signature,
      solWallet: wallet,
      zecAddress: trimmedAddress,
      keysBurned,
      keyValueSol,
    })
    setQueueing(false)
    if (!res.ok) {
      toast.error(res.error ?? 'Could not queue redeem — try again.')
      return
    }
    // Insert alone is enough — the payout bot polls the table every ~5 min.
    // The webhook POST (res.notified) is optional when configured.
    setHoldings((h) => ({
      ...h,
      keys: h.keys == null ? h.keys : Math.max(0, h.keys - Math.floor(keysBurned)),
      legacyMints: legacyMint
        ? (h.legacyMints ?? []).filter((mint) => mint !== legacyMint)
        : (h.legacyMints ?? []),
    }))
    toast('KEY burned on-chain — ZEC payout bot will process')
    void refreshQueue(wallet)
  }


  const walletChip = wallet ? (
    <span className="flex items-center gap-1.5 rounded-full border border-amber-900/30 bg-[#f3e5b0] px-2.5 py-1 font-mono text-[10px] font-bold text-[#6b5618]">
      <span className="size-1.5 rounded-full bg-[#5cbdb9]" />
      {wallet.slice(0, 4)}…{wallet.slice(-4)}
    </span>
  ) : null

  return (
    <main className="chrome-bg flex min-h-svh flex-col items-center justify-center px-4 py-10">
      {/* Top-left logo — just the key */}
      <a href="/" className="fixed left-4 top-4 z-20" aria-label="ZKEY home">
        <img
          src={logoKeyAsset.url}
          alt="ZKEY key"
          className="h-auto w-20 drop-shadow-[0_3px_8px_rgba(74,58,16,0.35)]"
        />
      </a>

      {/* Top-right wallet control */}
      <div className="fixed right-4 top-4 z-20 flex items-center gap-2">
        <a
          href="/launchpad"
          onClick={(e) => e.preventDefault()}
          aria-label="Launchpad — soon"
          title="soon"
          className="group relative flex cursor-not-allowed items-center rounded-full border border-amber-900/20 bg-[#f6edd2]/60 px-4 py-2 text-xs font-bold tracking-wide text-foreground/40 shadow-[0_10px_24px_-14px_rgba(74,58,16,0.4)]"
        >
          <span className="transition-opacity group-hover:opacity-0">LAUNCH</span>
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            SOON
          </span>
        </a>
        {wallet ? (
          <button
            type="button"
            onClick={connectPhantom}
            title={wallet}
            className="flex items-center gap-2 rounded-full border border-amber-900/30 bg-[#fbf2cd] px-4 py-2 text-xs font-bold text-foreground shadow-[0_10px_24px_-12px_rgba(74,58,16,0.6)] transition-colors hover:bg-[#f3e5b0]"
          >
            <span className="size-2 rounded-full bg-[#5cbdb9]" />
            <span className="font-mono">
              {wallet.slice(0, 4)}…{wallet.slice(-4)}
            </span>
          </button>
        ) : hasPhantom === false ? (
          <a
            href="https://phantom.com/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-amber-900/30 bg-[#fbf2cd] px-4 py-2 text-xs font-bold text-foreground shadow-[0_10px_24px_-12px_rgba(74,58,16,0.6)] transition-colors hover:bg-[#f3e5b0]"
          >
            <Wallet className="size-3.5" />
            Install Phantom
          </a>
        ) : (
          <button
            type="button"
            onClick={connectPhantom}
            className="flex items-center gap-1.5 rounded-full border border-amber-900/30 bg-[#fbf2cd] px-4 py-2 text-xs font-bold text-foreground shadow-[0_10px_24px_-12px_rgba(74,58,16,0.6)] transition-colors hover:bg-[#f3e5b0]"
          >
            <Wallet className="size-3.5" />
            Connect Wallet
          </button>
        )}
      </div>

      {/* Progress strip */}

      <div className="mb-3 flex items-center gap-1.5 rounded-full border border-amber-900/20 bg-[#f3e5b0]/70 px-4 py-1.5 text-[11px] font-bold tracking-wide">
        <span className={cn(step === 'burn' ? 'text-[#b3871a]' : 'text-[#7a6420]/70')}>ZKEY</span>
        <span className="text-[#7a6420]/50">→</span>
        <span className={cn(step === 'mint' ? 'text-[#b3871a]' : 'text-[#7a6420]/70')}>KEY</span>
        <span className="text-[#7a6420]/50">→</span>
        <span className="text-[#7a6420]/70">private ZEC</span>
      </div>

      <div className="w-full max-w-md">
        {/* Attached tabs */}
        <div className="flex gap-1 pl-3">
          {(
            [
              { id: 'burn' as Step, label: '1 · Burn ZKEY → KEY', icon: Flame },
              { id: 'mint' as Step, label: '2 · Burn KEY → ZEC', icon: KeyRound },
            ]
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setStep(id)}
              className={cn(
                'relative -mb-px flex items-center gap-1.5 rounded-t-lg border px-3 py-2.5 text-[13px] font-semibold transition-colors sm:px-4 sm:text-sm',
                step === id
                  ? 'z-10 border-amber-900/30 border-b-[#fbf2cd] bg-[#fbf2cd] text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {/* Card */}
        <section
          className={cn(
            'w-full rounded-xl border border-amber-900/30 bg-[#fbf2cd] p-5 shadow-[0_20px_50px_-24px_rgba(74,58,16,0.5)] sm:p-6',
            step === 'burn' && 'rounded-tl-none',
          )}
        >
          {/* Header row */}
          <div className="mb-1 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <img
                src={keyAsset.url}
                alt="ZKEY key"
                className="h-6 w-auto object-contain drop-shadow-[0_2px_6px_rgba(74,58,16,0.35)]"
              />
              <h1 className="text-lg font-bold tracking-tight text-foreground">ZKEY</h1>
            </div>
            {walletChip}
          </div>

          <p className="text-xs font-medium text-[#7a6420]">
            {step === 'burn'
              ? 'Step 1 of 2 — turn $ZKEY into a KEY'
              : 'Step 2 of 2 — burn KEY, get private ZEC'}
          </p>
          {valueLine}


          {step === 'burn' ? (
            <div className="space-y-3">
              {/* Amount row */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#7a6420]">
                    You burn
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-[#7a6420]">
                    {wallet ? `Balance: ${fmtBal(holdings.zkey, 'ZKEY')}` : 'Connect wallet'}
                  </span>
                </div>
                <div className="flex h-14 items-center gap-2 rounded-lg border border-amber-900/30 bg-[#fdf7dd] px-3">
                  <input
                    value={zkeyAmount}
                    onChange={(e) => setZkeyAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground/60"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      holdings.zkey && holdings.zkey > 0
                        ? setZkeyAmount(String(holdings.zkey))
                        : sampleToast()
                    }
                    className="rounded bg-primary px-2 py-1 text-[10px] font-extrabold tracking-wide text-primary-foreground transition-colors hover:bg-[#e6b800]"
                  >
                    MAX
                  </button>
                  <span className="flex items-center gap-1.5 rounded-md bg-[#2c2410] px-2.5 py-1.5 text-xs font-bold text-[#f5e6a8]">
                    <span className="size-2 rounded-full bg-[#ffd94d]" />
                    ZKEY
                  </span>
                </div>
              </div>

              {/* Receive row */}
              <div className="flex items-center justify-between rounded-lg border border-amber-900/25 bg-[#f3e5b0]/70 px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[#7a6420]">
                  <ArrowDown className="size-3.5" />
                  You get
                </span>
                <span className="flex items-center gap-1.5 font-mono text-sm font-bold text-foreground">
                  {keysOut.toLocaleString()} KEY
                  <KeyRound className="size-3.5 text-[#b3871a]" />
                </span>
              </div>

              {/* Conversion */}
              <p className="border-t border-dashed border-amber-900/25 pt-3 text-center text-xs text-[#7a6420]">
                You receive <span className="font-mono font-semibold text-foreground">1 KEY</span> per{' '}
                <span className="font-mono font-semibold text-foreground">
                  {BURN_ZKEY_PER_KEY.toLocaleString()} ZKEY
                </span>{' '}
                burned
              </p>


              {wallet ? (
                <button
                  type="button"
                  onClick={() => void submitKeyMint()}
                  disabled={minting || keysOut < 1}
                  className="h-12 w-full rounded-lg bg-primary text-base font-bold text-primary-foreground shadow-[0_10px_24px_-10px_rgba(120,90,10,0.7)] transition-colors hover:bg-[#e6b800] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {mintPhase === 'sign'
                    ? 'Confirm in Phantom…'
                    : mintPhase === 'confirm'
                      ? 'Confirming…'
                      : `Burn ZKEY for ${Math.max(keysOut, 1)} KEY NFT`}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={connectPhantom}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-base font-bold text-primary-foreground shadow-[0_10px_24px_-10px_rgba(120,90,10,0.7)] transition-colors hover:bg-[#e6b800] active:translate-y-px"
                >
                  <Wallet className="size-4" />
                  Connect Phantom
                </button>
              )}

            </div>
          ) : (
            <div className="space-y-3">
              {/* Amount row */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#7a6420]">
                    You burn
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-[#7a6420]">
                    {wallet ? `Balance: ${fmtBal(burnableKeyBalance, 'KEY')}` : 'Connect wallet'}
                  </span>
                </div>
                <div className="flex h-14 items-center gap-2 rounded-lg border border-amber-900/30 bg-[#fdf7dd] px-3">
                  <input
                    value={keyAmount}
                    onChange={(e) => setKeyAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground/60"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      burnableKeyBalance && burnableKeyBalance > 0
                        ? setKeyAmount(String(burnableKeyBalance))
                        : sampleToast()
                    }
                    className="rounded bg-primary px-2 py-1 text-[10px] font-extrabold tracking-wide text-primary-foreground transition-colors hover:bg-[#e6b800]"
                  >
                    MAX
                  </button>
                  <span className="flex items-center gap-1.5 rounded-md bg-[#2c2410] px-2.5 py-1.5 text-xs font-bold text-[#f5e6a8]">
                    <span className="size-2 rounded-full bg-[#ffd94d]" />
                    KEY
                  </span>
                </div>
              </div>

              {/* Address row */}
              <div>
                <input
                  value={zecAddress}
                  onChange={(e) => setZecAddress(e.target.value)}
                  placeholder="Shielded ZEC address (zs1… or ua1…)"
                  spellCheck={false}
                  className={cn(
                    'h-12 w-full rounded-lg border bg-[#fdf7dd] px-3 font-mono text-sm text-foreground outline-none placeholder:font-sans placeholder:text-muted-foreground/60',
                    isTransparent ? 'border-red-500' : 'border-amber-900/30',
                  )}
                />
                <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-[#7a6420]">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  Use a shielded address for privacy — t-addrs are public.
                </p>
                {isTransparent && (
                  <p className="mt-1.5 text-xs font-semibold text-red-600">
                    This looks like a transparent t-addr. Burns to it are public.
                  </p>
                )}
              </div>

              {/* Receive row */}
              <div className="flex items-center justify-between rounded-lg border border-amber-900/25 bg-[#f3e5b0]/70 px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[#7a6420]">
                  <ArrowDown className="size-3.5" />
                  You get
                </span>
                <span className="text-xs font-bold text-foreground">
                  ZEC → your shielded address
                </span>
              </div>
              <p className="px-1 font-mono text-[11px] text-[#7a6420]/70">
                Est. claim ≈{' '}
                {estClaimSol === null ? '— SOL' : `${estClaimSol.toFixed(4)} SOL`}{' '}
                · value × your KEY
              </p>


              <p className="border-t border-dashed border-amber-900/25 pt-3 text-center text-xs text-[#7a6420]">
                You receive ZEC privately (SAMPLE — amount wired after launch)
              </p>

              {wallet ? (
                <div>
                  <button
                    type="button"
                    onClick={submitRedeem}
                    disabled={!addressLooksShielded || queueing}
                    className={cn(
                      'h-12 w-full rounded-lg bg-primary text-base font-bold text-primary-foreground shadow-[0_10px_24px_-10px_rgba(120,90,10,0.7)] transition-colors',
                      addressLooksShielded && !queueing
                        ? 'hover:bg-[#e6b800] active:translate-y-px'
                        : 'cursor-not-allowed opacity-50',
                    )}
                  >
                    {burnPhase === 'signing'
                      ? 'Confirm in Phantom…'
                      : burnPhase === 'confirming' || queueing
                        ? 'Confirming…'
                        : 'Burn KEY for ZEC'}
                  </button>
                  {!addressLooksShielded && (
                    <p className="mt-2 text-center text-[11px] font-medium text-[#7a6420]">
                      Enter a shielded z… or ua1… address to enable
                    </p>
                  )}

                  {queue.length > 0 && (
                    <div className="mt-4 border-t border-dashed border-amber-900/25 pt-3">
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#7a6420]">
                        Your redeem queue
                      </p>
                      <ul className="space-y-1.5">
                        {queue.map((r) => (
                          <li
                            key={r.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-amber-900/20 bg-[#f3e5b0]/70 px-3 py-2 font-mono text-[11px] text-[#6b5618]"
                          >
                            <span className="truncate">
                              {r.keys_burned} KEY → {r.zec_address.slice(0, 8)}…
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5 font-sans font-bold">
                              <span
                                className={cn(
                                  'size-1.5 rounded-full',
                                  r.status === 'fulfilled'
                                    ? 'bg-[#5cbdb9]'
                                    : r.status === 'failed'
                                      ? 'bg-red-500'
                                      : 'bg-[#b3871a]',
                                )}
                              />
                              {r.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[10px] text-[#7a6420]/60">
                        Payout bot sends ZEC from treasury · on-chain KEY burn is SAMPLE until launch
                      </p>
                    </div>
                  )}
                </div>
              ) : (

                <button
                  type="button"
                  onClick={connectPhantom}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary text-base font-bold text-primary-foreground shadow-[0_10px_24px_-10px_rgba(120,90,10,0.7)] transition-colors hover:bg-[#e6b800] active:translate-y-px"
                >
                  <Wallet className="size-4" />
                  Connect Phantom
                </button>
              )}
            </div>
          )}
        </section>

        {/* KEY collection link */}
        {KEY_MINT && (
          <a
            href={`https://solscan.io/token/${KEY_MINT}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 inline-flex w-full items-center justify-center gap-1 font-mono text-[11px] font-semibold text-[#b3871a] underline-offset-2 transition-colors hover:text-[#7a6420] hover:underline"
          >
            KEY token ↗
          </a>
        )}
      </div>

      {/* Footer utility links — pinned to the bottom of the page */}
      <div className="fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
        <Link
          to="/docs"
          className="flex items-center gap-1.5 rounded-full border border-amber-900/25 bg-[#f3e5b0]/80 px-3.5 py-1.5 text-xs font-semibold text-[#6b5618] shadow-[0_10px_24px_-14px_rgba(74,58,16,0.6)] backdrop-blur-sm transition-colors hover:bg-[#f3e5b0] hover:text-foreground"
        >
          <BookOpen className="size-3.5" />
          Docs
        </Link>
        <button
          type="button"
          onClick={sampleToast}
          className="flex items-center gap-1.5 rounded-full border border-amber-900/25 bg-[#f3e5b0]/80 px-3.5 py-1.5 text-xs font-semibold text-[#6b5618] shadow-[0_10px_24px_-14px_rgba(74,58,16,0.6)] backdrop-blur-sm transition-colors hover:bg-[#f3e5b0] hover:text-foreground"
        >
          <XIcon className="size-3.5" />
          X
        </button>
        <button
          type="button"
          onClick={sampleToast}
          className="flex items-center gap-1.5 rounded-full border border-amber-900/25 bg-[#f3e5b0]/80 px-3.5 py-1.5 text-xs font-semibold text-[#6b5618] shadow-[0_10px_24px_-14px_rgba(74,58,16,0.6)] backdrop-blur-sm transition-colors hover:bg-[#f3e5b0] hover:text-foreground"
        >
          <Github className="size-3.5" />
          Github
        </button>
      </div>
    </main>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  )
}

