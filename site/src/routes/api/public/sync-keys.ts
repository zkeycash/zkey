import { createFileRoute } from '@tanstack/react-router'

// Recount KEY in circulation and write the authoritative keys_outstanding into
// key_metrics (id = 1), then recalc key_value_sol.
//
// Source of truth: on-chain supply of the fungible KEY mint (decimals 0).
// Fallback: sum of keys_minted across key_mints rows with status 'minted'.

const KEY_MINT = '6KnZsn8Ej9w7LuyGm9y1eA4Q8T6VSoKBLPSSgq6vjVcx'

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

async function keySupply(): Promise<number | null> {
  for (const url of rpcCandidates()) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'key-supply',
          method: 'getTokenSupply',
          params: [KEY_MINT],
        }),
      })
      if (!res.ok) continue
      const json = (await res.json()) as {
        result?: { value?: { uiAmount?: number | null; amount?: string } }
      }
      const v = json.result?.value
      if (!v) continue
      const n = v.uiAmount ?? Number(v.amount ?? NaN)
      if (Number.isFinite(n)) return Number(n)
    } catch {
      /* try next endpoint */
    }
  }
  return null
}

async function syncKeys() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

  let count: number | null = await keySupply()
  let source = count === null ? 'db' : 'chain'

  if (count === null) {
    const { data } = await supabaseAdmin
      .from('key_mints')
      .select('keys_minted')
      .eq('status', 'minted')
    count = (data ?? []).reduce((s, r) => s + Number(r.keys_minted ?? 0), 0)
    source = 'db'
  }

  const { data: total, error } = await supabaseAdmin.rpc('set_keys_outstanding', { n: count })
  if (error) return Response.json({ ok: false, error: 'sync_failed' }, { status: 500 })
  return Response.json({ ok: true, source, keys_outstanding: Number(total ?? count) })
}

export const Route = createFileRoute('/api/public/sync-keys')({
  server: {
    handlers: {
      POST: async () => syncKeys(),
      GET: async () => syncKeys(),
    },
  },
})
