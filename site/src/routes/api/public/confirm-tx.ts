import { createFileRoute } from '@tanstack/react-router'

// Generic signature confirmation poll — no DB side effects.
// Used by Step 2 after Phantom sends the KEY burn transaction.

const SIG = /^[1-9A-HJ-NP-Za-km-z]{60,100}$/

function rpcUrl(): string {
  return process.env['SOLANA_RPC'] || 'https://solana-rpc.publicnode.com'
}

export const Route = createFileRoute('/api/public/confirm-tx')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { signature?: unknown }
        try {
          body = (await request.json()) as typeof body
        } catch {
          return Response.json({ error: 'bad_json' }, { status: 400 })
        }
        const signature = typeof body.signature === 'string' ? body.signature : ''
        if (!SIG.test(signature)) return Response.json({ error: 'bad_signature' }, { status: 400 })

        try {
          const { Connection } = await import('@solana/web3.js')
          const connection = new Connection(rpcUrl(), 'confirmed')
          const status = await connection.getSignatureStatus(signature, {
            searchTransactionHistory: true,
          })
          const value = status.value
          if (!value) return Response.json({ ok: true, confirmed: false })
          if (value.err) return Response.json({ ok: true, confirmed: false, failed: true })
          const level = value.confirmationStatus
          return Response.json({
            ok: true,
            confirmed: level === 'confirmed' || level === 'finalized',
          })
        } catch {
          return Response.json({ ok: true, confirmed: false })
        }
      },
    },
  },
})
