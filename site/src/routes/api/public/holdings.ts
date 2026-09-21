import { createFileRoute } from '@tanstack/react-router'

// Wallet holdings for the burn card: $ZKEY (Token-2022) balance + fungible
// KEY token balance. Runs server-side so the browser never hits Solana RPC
// directly (CORS / rate limits).

const ZKEY_MINT = '2QjuLTP2BqEZozJagNQazSTB3LsZ6mhkijHiQ5vGLkUw'
/** Fungible KEY pool mint (decimals 0, classic SPL Token program). */
const KEY_MINT = '6KnZsn8Ej9w7LuyGm9y1eA4Q8T6VSoKBLPSSgq6vjVcx'
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

function rpcCandidates(): string[] {
  const list: string[] = []
  const custom = process.env['SOLANA_RPC']
  if (custom) list.push(custom)
  const key = process.env['HELIUS_API_KEY']
  if (key) list.push(`https://mainnet.helius-rpc.com/?api-key=${key}`)
  list.push('https://solana-rpc.publicnode.com')
  list.push('https://api.mainnet-beta.solana.com')
  return list
}

/** Calls an RPC method against each candidate endpoint until one answers. */
async function rpc<T>(method: string, params: unknown): Promise<T | null> {
  for (const url of rpcCandidates()) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'zkey', method, params }),
      })
      if (!res.ok) continue
      const json = (await res.json()) as { result?: T; error?: unknown }
      if (json.error || json.result === undefined) continue
      return json.result
    } catch {
      /* try next endpoint */
    }
  }
  return null
}

type ParsedAccounts = {
  value?: Array<{
    account?: {
      data?: {
        parsed?: {
          info?: {
            mint?: string
            tokenAmount?: { uiAmount?: number | null; amount?: string; decimals?: number }
          }
        }
      }
    }
  }>
}

function sumAccounts(accs: ParsedAccounts | null, mintFilter?: string): number | null {
  const list = accs?.value
  if (!list) return null
  return list
    .filter((a) => !mintFilter || a.account?.data?.parsed?.info?.mint === mintFilter)
    .reduce((s, a) => s + Number(a.account?.data?.parsed?.info?.tokenAmount?.uiAmount ?? 0), 0)
}

/** Balance of one mint, trying the mint filter first then a program-wide scan. */
async function fetchTokenBalance(
  wallet: string,
  mint: string,
  programId: string,
): Promise<number | null> {
  const byMint = await rpc<ParsedAccounts>('getTokenAccountsByOwner', [
    wallet,
    { mint },
    { encoding: 'jsonParsed' },
  ])
  const direct = sumAccounts(byMint)
  if (direct !== null && direct > 0) return direct

  const byProgram = await rpc<ParsedAccounts>('getTokenAccountsByOwner', [
    wallet,
    { programId },
    { encoding: 'jsonParsed' },
  ])
  const scanned = sumAccounts(byProgram, mint)
  if (scanned !== null) return scanned
  return direct
}

/**
 * Legacy unique KEY NFTs still held by the wallet. Candidates come from the
 * chain (amount 1, decimals 0) and are only accepted when this app recorded
 * minting them (key_mints.nft_mints) — never a guess about random NFTs.
 */
async function fetchLegacyKeyMints(wallet: string): Promise<string[]> {
  const accounts = await rpc<ParsedAccounts>('getTokenAccountsByOwner', [
    wallet,
    { programId: TOKEN_PROGRAM },
    { encoding: 'jsonParsed' },
  ])
  const held = new Set(
    (accounts?.value ?? [])
      .filter((a) => {
        const amt = a.account?.data?.parsed?.info?.tokenAmount
        return amt?.decimals === 0 && amt?.amount === '1'
      })
      .map((a) => a.account?.data?.parsed?.info?.mint)
      .filter((m): m is string => Boolean(m) && m !== KEY_MINT),
  )
  if (held.size === 0) return []

  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    const { data } = await supabaseAdmin
      .from('key_mints')
      .select('nft_mints')
      .eq('sol_wallet', wallet)
    const known = new Set<string>()
    for (const row of data ?? []) {
      for (const m of (row.nft_mints ?? []) as string[]) known.add(m)
    }
    return [...held].filter((m) => known.has(m))
  } catch {
    return []
  }
}

async function holdings(request: Request) {
  const wallet = new URL(request.url).searchParams.get('wallet') ?? ''
  if (!BASE58.test(wallet)) {
    return Response.json({ ok: false, error: 'invalid_wallet' }, { status: 400 })
  }

  const [zkey, keys, legacyMints] = await Promise.all([
    fetchTokenBalance(wallet, ZKEY_MINT, TOKEN_2022),
    fetchTokenBalance(wallet, KEY_MINT, TOKEN_PROGRAM),
    fetchLegacyKeyMints(wallet),
  ])

  return Response.json(
    { ok: true, zkey, keys, legacyMints, legacyKeys: legacyMints.length, source: 'chain' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export const Route = createFileRoute('/api/public/holdings')({
  server: {
    handlers: {
      GET: async ({ request }) => holdings(request),
    },
  },
})
