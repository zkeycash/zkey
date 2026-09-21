import { createFileRoute } from '@tanstack/react-router'

// Marks a KEY mint row as minted once the client has a real, confirmed
// signature. The signature is verified against the RPC before anything is
// written — no status is ever taken on trust.

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const SIG58 = /^[1-9A-HJ-NP-Za-km-z]{64,120}$/

export const Route = createFileRoute('/api/public/confirm-mint')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { wallet?: unknown; signature?: unknown }
        try {
          body = (await request.json()) as typeof body
        } catch {
          return Response.json({ error: 'bad_json' }, { status: 400 })
        }
        const wallet = typeof body.wallet === 'string' ? body.wallet : ''
        const signature = typeof body.signature === 'string' ? body.signature : ''
        if (!BASE58.test(wallet) || !SIG58.test(signature)) {
          return Response.json({ error: 'bad_request' }, { status: 400 })
        }

        const rpc = process.env['SOLANA_RPC'] ||
          (process.env['HELIUS_API_KEY']
            ? `https://mainnet.helius-rpc.com/?api-key=${process.env['HELIUS_API_KEY']}`
            : 'https://solana-rpc.publicnode.com')
        try {
          const res = await fetch(rpc, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'confirm',
              method: 'getSignatureStatuses',
              params: [[signature], { searchTransactionHistory: true }],
            }),
          })
          const json = (await res.json()) as {
            result?: { value?: Array<{ err: unknown; confirmationStatus?: string } | null> }
          }
          const status = json.result?.value?.[0]
          if (!status || status.err) {
            return Response.json({ ok: false, error: 'not_confirmed' }, { status: 409 })
          }
        } catch {
          return Response.json({ ok: false, error: 'rpc_unavailable' }, { status: 502 })
        }

        try {
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
          // Settle the wallet's most recent pending mint row.
          const { data: pending } = await supabaseAdmin
            .from('key_mints')
            .select('id')
            .eq('sol_wallet', wallet)
            .eq('status', 'awaiting_signature')
            .order('created_at', { ascending: false })
            .limit(1)
          const rowId = pending?.[0]?.id
          if (rowId) {
            await supabaseAdmin
              .from('key_mints')
              .update({ status: 'minted', burn_tx: signature, minted_at: new Date().toISOString() })
              .eq('id', rowId)
          }
        } catch {
          return Response.json({ ok: false, error: 'db_update_failed' }, { status: 500 })
        }

        return Response.json({ ok: true })
      },
    },
  },
})
