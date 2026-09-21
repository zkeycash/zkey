import { createFileRoute } from '@tanstack/react-router'

// Server-side DexScreener proxy — avoids browser CORS/429 on the 3s MC poll.
// Public read-only: no secrets, no writes, only a whitelisted-shape mint param.
const WSOL = 'So11111111111111111111111111111111111111112'

type DexPair = {
  marketCap?: number
  fdv?: number
  priceUsd?: string
  priceNative?: string
  liquidity?: { usd?: number }
  quoteToken?: { symbol?: string }
  volume?: { h24?: number }
}

async function pairsFor(mint: string): Promise<Array<DexPair>> {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`)
  if (!res.ok) return []
  const json = (await res.json()) as { pairs?: Array<DexPair> }
  return json.pairs ?? []
}

function best(pairs: Array<DexPair>): DexPair | null {
  if (pairs.length === 0) return null
  return pairs.reduce((a, b) => ((b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a))
}

export const Route = createFileRoute('/api/public/mc-proxy')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const mint = new URL(request.url).searchParams.get('mint') ?? ''
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
          return Response.json({ error: 'bad mint' }, { status: 400 })
        }
        try {
          const all = await pairsFor(mint)
          const top = best(all)
          // DexScreener exposes 24h volume only (no lifetime) — summed across pairs.
          const volumeUsd = all.reduce((sum, p) => sum + (p.volume?.h24 ?? 0), 0)
          const mcUsd = top?.marketCap ?? top?.fdv
          const priceUsd = Number.parseFloat(top?.priceUsd ?? '')
          if (!mcUsd || !Number.isFinite(priceUsd) || priceUsd <= 0) {
            return Response.json({ market: null }, { headers: { 'cache-control': 'no-store' } })
          }

          let solPriceUsd = 0
          const priceNative = Number.parseFloat(top?.priceNative ?? '')
          if (
            (top?.quoteToken?.symbol ?? '').toUpperCase().includes('SOL') &&
            Number.isFinite(priceNative) &&
            priceNative > 0
          ) {
            solPriceUsd = priceUsd / priceNative
          } else {
            const sol = best((await pairsFor(WSOL)).filter((p) => Number.parseFloat(p.priceUsd ?? '') > 0))
            solPriceUsd = Number.parseFloat(sol?.priceUsd ?? '') || 0
          }
          if (!solPriceUsd) {
            return Response.json({ market: null }, { headers: { 'cache-control': 'no-store' } })
          }

          return Response.json(
            { market: { mcUsd, mcSol: mcUsd / solPriceUsd, solPriceUsd, priceUsd, volumeUsd } },
            { headers: { 'cache-control': 'no-store' } },
          )
        } catch {
          return Response.json({ market: null }, { headers: { 'cache-control': 'no-store' } })
        }
      },
    },
  },
})
