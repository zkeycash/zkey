import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowDown, BookOpen, Flame, Github, KeyRound, ShieldAlert, Wallet } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import {
  fetchHoldings,
  fetchRedeemQueue,
  queueRedeem,
  type Holdings,
  type RedeemRequest,
} from '@/lib/key-value'
import { burnAndMintKey, burnKeyTokens } from '@/lib/key-mint'

import keyAsset from '@/assets/zkey-key.png.asset.json'
import logoKeyAsset from '@/assets/zkey-key-horizontal.png.asset.json'

export const Route = createFileRoute('/test')({
  component: ZkeyTestApp,
  head: () => ({
    meta: [
      { title: 'ZKEY TEST — 10k burn · KEY = 0.1 SOL' },
      {
        name: 'description',
        content:
          'ZKEY test page: burn 10,000 ZKEY for 1 KEY at a fixed 0.1 SOL value. Test economics only — not main.',
      },
      { name: 'robots', content: 'noindex' },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: 'ZKEY TEST — 10k burn · KEY = 0.1 SOL' },
      {
        property: 'og:description',
        content: 'Test burner: 1 KEY per 10,000 ZKEY, fixed 0.1 SOL value. Test only.',
      },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
})

// ---- TEST economics (this page only — homepage untouched) -----------------
const BURN_ZKEY_PER_KEY_TEST = 10_000 // burn 10,000 tokens → 1 KEY
const TEST_KEY_VALUE_SOL = 0.1 // fixed KEY value; no live MC/fees here

type Step = 'burn' | 'mint'

function ZkeyTestApp() {
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

  const parsedZkey = Number.parseFloat(zkeyAmount)
  const keysOut =
    Number.isFinite(parsedZkey) && parsedZkey > 0
      ? Math.floor(parsedZkey / BURN_ZKEY_PER_KEY_TEST)
      : 0

  // Fixed test value — never from live feeds.
  const keyValueSol = TEST_KEY_VALUE_SOL
  const parsedKeyAmount = Number.parseFloat(keyAmount)
  const estClaimSol =
    Number.isFinite(parsedKeyAmount) && parsedKeyAmount > 0
      ? keyValueSol * parsedKeyAmount
      : null

  const valueLine = (
    <p className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-[#7a6420]/70">
      <KeyRound className="size-3 shrink-0" />
      KEY · {keyValueSol.toFixed(4)} SOL
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
      toast.error(`Enter at least ${BURN_ZKEY_PER_KEY_TEST.toLocaleString()} ZKEY (1 KEY).`)
      return
    }
    setMinting(true)
    setMintPhase('sign')
    const res = await burnAndMintKey({ solWallet: wallet, keys: 1, mode: 'test' })
    setMintPhase('idle')
    setMinting(false)

    if (!res.ok) {
      if (res.code === 'mint_authority_not_configured') {
        toast.error('Mint authority not configured — add KEY_MINT_AUTHORITY_JSON in server environment variables')
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
      zkey: h.zkey == null ? h.zkey : Math.max(0, h.zkey - BURN_ZKEY_PER_KEY_TEST),
      keys: (h.keys ?? 0) + 1,
    }))
    setStep('mint')
    void refreshHoldings(wallet)
  }

  // ---- Step 2: redeem queue — snapshot fixed at 0.1 SOL, tagged 'test' ---
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
      keyValueSol: TEST_KEY_VALUE_SOL, // fixed test snapshot
      source: 'test',
    })
    setQueueing(false)
    if (!res.ok) {
      toast.error(res.error ?? 'Could not queue redeem — try again.')
      return
    }
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

      {/* TEST banner */}
      <div className="mb-3 rounded-full border border-amber-900/30 bg-[#2c2410] px-4 py-1.5 font-mono text-[11px] font-bold tracking-wide text-[#ffd94d]">
        TEST MODE · 10k burn · KEY = 0.1 SOL
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
                  {BURN_ZKEY_PER_KEY_TEST.toLocaleString()} ZKEY
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
                You receive ZEC privately (TEST — fixed 0.1 SOL value)
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
                        Payout bot sends ZEC from treasury · test rows are tagged source=test
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

        {/* TEST marker under the card */}
        <p className="mt-1.5 w-full text-center font-mono text-[11px] font-semibold text-[#b3871a]">
          TEST page — main burner lives at /
        </p>
      </div>

      {/* Footer utility links */}
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
