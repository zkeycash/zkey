import { createFileRoute } from '@tanstack/react-router'

// Builds ONE atomic transaction: burn ZKEY (Token-2022) + mint fungible KEY
// tokens to the user's wallet. Server partially signs with the KEY mint
// authority; the user signs in Phantom as fee payer.
//
// SECURITY: KEY_MINT_AUTHORITY_JSON (raw 64-byte keypair JSON array) is read
// inside the handler only. Never logged, never returned, never VITE_-prefixed.

const ZKEY_MINT = '2QjuLTP2BqEZozJagNQazSTB3LsZ6mhkijHiQ5vGLkUw'
const ZKEY_DECIMALS = 6
/** Fungible KEY pool mint (decimals 0, classic SPL Token program). */
const KEY_MINT = '6KnZsn8Ej9w7LuyGm9y1eA4Q8T6VSoKBLPSSgq6vjVcx'
const BURN_PROD = 1_000_000
const BURN_TEST = 10_000
const MAX_KEYS = 100
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

function rpcUrl(): string {
  // api.mainnet-beta.solana.com blocks cloud egress (403) — default to
  // publicnode, overridable with the SOLANA_RPC secret for production.
  return process.env['SOLANA_RPC'] || 'https://solana-rpc.publicnode.com'
}

async function buildMintTx(body: { wallet: string; keys: number; mode: 'test' | 'prod' }) {
  const secret = process.env['KEY_MINT_AUTHORITY_JSON'] ?? ''
  if (!secret) {
    return Response.json({ error: 'mint_authority_not_configured' }, { status: 503 })
  }

  const [
    { Connection, PublicKey, Transaction, Keypair },
    {
      createBurnCheckedInstruction,
      createAssociatedTokenAccountIdempotentInstruction,
      createMintToInstruction,
      getAssociatedTokenAddressSync,
      TOKEN_2022_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
    },
  ] = await Promise.all([import('@solana/web3.js'), import('@solana/spl-token')])

  let authorityKeypair
  try {
    const bytes = Uint8Array.from(JSON.parse(secret) as Array<number>)
    authorityKeypair = Keypair.fromSecretKey(bytes)
  } catch {
    return Response.json({ error: 'mint_authority_invalid' }, { status: 503 })
  }

  const burnPerKey = body.mode === 'test' ? BURN_TEST : BURN_PROD
  const burnUi = body.keys * burnPerKey
  const burnRaw = BigInt(burnUi) * BigInt(10 ** ZKEY_DECIMALS)

  const userPk = new PublicKey(body.wallet)
  const zkeyPk = new PublicKey(ZKEY_MINT)
  const keyPk = new PublicKey(KEY_MINT)

  const zkeyAta = getAssociatedTokenAddressSync(zkeyPk, userPk, false, TOKEN_2022_PROGRAM_ID)
  const keyAta = getAssociatedTokenAddressSync(keyPk, userPk, false, TOKEN_PROGRAM_ID)

  const burnIx = createBurnCheckedInstruction(
    zkeyAta,
    zkeyPk,
    userPk,
    burnRaw,
    ZKEY_DECIMALS,
    [],
    TOKEN_2022_PROGRAM_ID,
  )
  const ataIx = createAssociatedTokenAccountIdempotentInstruction(
    userPk, // payer
    keyAta,
    userPk,
    keyPk,
    TOKEN_PROGRAM_ID,
  )
  const mintIx = createMintToInstruction(
    keyPk,
    keyAta,
    authorityKeypair.publicKey,
    BigInt(body.keys), // decimals 0 → 1 KEY = 1 unit
    [],
    TOKEN_PROGRAM_ID,
  )

  const connection = new Connection(rpcUrl(), 'confirmed')
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

  const tx = new Transaction({ feePayer: userPk, blockhash, lastValidBlockHeight })
  tx.add(burnIx, ataIx, mintIx)
  tx.partialSign(authorityKeypair)

  const serialized = tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString('base64')

  try {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
    await supabaseAdmin.from('key_mints').insert({
      sol_wallet: body.wallet,
      keys_minted: body.keys,
      status: 'awaiting_signature',
      nft_mints: [KEY_MINT],
    })
  } catch {
    // tx is still valid without the tracking row
  }

  return Response.json({
    ok: true,
    transaction: serialized,
    keyMint: KEY_MINT,
    keysMinted: body.keys,
    burnAmount: burnUi,
    burnPerKey,
    mode: body.mode,
  })
}

export const Route = createFileRoute('/api/public/mint-key')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { wallet?: unknown; keys?: unknown; mode?: unknown }
        try {
          body = (await request.json()) as typeof body
        } catch {
          return Response.json({ error: 'bad_json' }, { status: 400 })
        }
        const wallet = typeof body.wallet === 'string' ? body.wallet : ''
        const keys = Number(body.keys)
        const mode = body.mode === 'test' ? 'test' : 'prod'
        if (!BASE58.test(wallet)) {
          return Response.json({ error: 'bad_wallet' }, { status: 400 })
        }
        if (!Number.isInteger(keys) || keys < 1 || keys > MAX_KEYS) {
          return Response.json({ error: 'bad_keys' }, { status: 400 })
        }
        try {
          return await buildMintTx({ wallet, keys, mode })
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err)
          console.error('mint-key build failed:', detail)
          return Response.json({ error: 'build_failed', detail }, { status: 500 })
        }
      },
    },
  },
})
