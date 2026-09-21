import { createFileRoute } from '@tanstack/react-router'

// Builds an unsigned transaction that burns KEY from the user's own wallet.
// Only the user signs it — no mint authority is involved.
// Used by Step 2 (burn KEY → private ZEC) before the redeem row is queued.
//
// Two shapes:
//   • fungible pool KEY (decimals 0, classic SPL Token) — BurnChecked N
//   • legacy KEY NFT (pass nftMint) — burn 1 + close the empty token account

const KEY_MINT = '6KnZsn8Ej9w7LuyGm9y1eA4Q8T6VSoKBLPSSgq6vjVcx'
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const MAX_KEYS = 1000

function rpcUrl(): string {
  return process.env['SOLANA_RPC'] || 'https://solana-rpc.publicnode.com'
}

async function buildBurnTx(wallet: string, keys: number, nftMint: string | null) {
  const [
    { Connection, PublicKey, Transaction },
    {
      createBurnCheckedInstruction,
      createCloseAccountInstruction,
      getAssociatedTokenAddressSync,
      TOKEN_PROGRAM_ID,
    },
  ] = await Promise.all([import('@solana/web3.js'), import('@solana/spl-token')])

  const userPk = new PublicKey(wallet)
  const connection = new Connection(rpcUrl(), 'confirmed')
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
  const tx = new Transaction({ feePayer: userPk, blockhash, lastValidBlockHeight })

  if (nftMint) {
    // Legacy unique KEY NFT: burn the single unit, then reclaim the rent.
    const nftPk = new PublicKey(nftMint)
    const nftAta = getAssociatedTokenAddressSync(nftPk, userPk, false, TOKEN_PROGRAM_ID)
    tx.add(
      createBurnCheckedInstruction(nftAta, nftPk, userPk, BigInt(1), 0, [], TOKEN_PROGRAM_ID),
      createCloseAccountInstruction(nftAta, userPk, userPk, [], TOKEN_PROGRAM_ID),
    )
  } else {
    const keyPk = new PublicKey(KEY_MINT)
    const keyAta = getAssociatedTokenAddressSync(keyPk, userPk, false, TOKEN_PROGRAM_ID)
    tx.add(
      createBurnCheckedInstruction(keyAta, keyPk, userPk, BigInt(keys), 0, [], TOKEN_PROGRAM_ID),
    )
  }

  return Response.json({
    ok: true,
    transaction: tx
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString('base64'),
    keyMint: nftMint ?? KEY_MINT,
    keysBurned: nftMint ? 1 : keys,
    legacy: Boolean(nftMint),
  })
}

export const Route = createFileRoute('/api/public/burn-key')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { wallet?: unknown; keys?: unknown; nftMint?: unknown }
        try {
          body = (await request.json()) as typeof body
        } catch {
          return Response.json({ error: 'bad_json' }, { status: 400 })
        }
        const wallet = typeof body.wallet === 'string' ? body.wallet : ''
        const nftMint = typeof body.nftMint === 'string' && BASE58.test(body.nftMint) ? body.nftMint : null
        const keys = nftMint ? 1 : Number(body.keys)
        if (!BASE58.test(wallet)) return Response.json({ error: 'bad_wallet' }, { status: 400 })
        if (!Number.isInteger(keys) || keys < 1 || keys > MAX_KEYS) {
          return Response.json({ error: 'bad_keys' }, { status: 400 })
        }
        try {
          return await buildBurnTx(wallet, keys, nftMint)
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err)
          return Response.json({ error: 'build_failed', detail }, { status: 500 })
        }
      },
    },
  },
})
