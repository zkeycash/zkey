import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const inputSchema = z.object({
  solWallet: z.string(),
  zecAddress: z.string(),
  keysBurned: z.number(),
  keyValueSol: z.number().nullable(),
})

/**
 * Wake the payout bot instantly after a redeem row is queued.
 * Server-side so ZKEY_PAYOUT_WEBHOOK_KEY never ships to the browser.
 * If ZKEY_PAYOUT_WEBHOOK_URL is unset, this is a quiet no-op — the bot
 * polls redeem_requests on its own schedule (~5 min).
 */
export const notifyPayoutBot = createServerFn({ method: 'POST' })
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const url = process.env['ZKEY_PAYOUT_WEBHOOK_URL']
    const key = process.env['ZKEY_PAYOUT_WEBHOOK_KEY']
    if (!url) return { notified: false }
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (key) headers['Authorization'] = `Bearer ${key}`
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          sol_wallet: data.solWallet,
          zec_address: data.zecAddress,
          keys_burned: data.keysBurned,
          key_value_sol: data.keyValueSol,
          status: 'pending',
        }),
      })
      return { notified: res.ok }
    } catch {
      // Webhook down — the queue row is the source of truth anyway.
      return { notified: false }
    }
  })
