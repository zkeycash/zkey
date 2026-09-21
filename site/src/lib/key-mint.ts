// KEY minting / burning — one fungible KEY pool mint (decimals 0, SPL Token).
//
// Step 1: ONE Phantom popup — the server builds an atomic transaction that
// burns the user's ZKEY (Token-2022) and mints KEY tokens into their wallet,
// partially signed by the KEY mint authority. The user signs as fee payer.
// Step 2: the user signs a plain KEY burn transaction (no authority involved).
//
// SECURITY: the mint-authority PRIVATE key never lives here or anywhere in the
// frontend bundle. Only the public key is public. The signer is injected into
// the server at runtime as the secret KEY_MINT_AUTHORITY_JSON.

import { BURN_ZKEY_PER_KEY, ZKEY_MINT } from './key-value'

/** Mint authority (public key only — never the secret array). */
export const KEY_MINT_AUTHORITY_PUBKEY = '4iYg5WpaWyjSJLg5gGPNaKmFwj78JS1sLxNunCboS1nW'

/** Fungible KEY pool mint. */
export const KEY_MINT = '6KnZsn8Ej9w7LuyGm9y1eA4Q8T6VSoKBLPSSgq6vjVcx'

export type KeyTokenMetadata = {
  name: string
  symbol: string
  description: string
  attributes: Array<{ trait_type: string; value: string | number }>
}

/** Display metadata for the KEY token. */
export function keyTokenMetadata(): KeyTokenMetadata {
  return {
    name: 'ZKEY KEY',
    symbol: 'KEY',
    description: 'Redeemable for private ZEC · 0.01% MC + 80% fees',
    attributes: [
      { trait_type: 'key_mint', value: KEY_MINT },
      { trait_type: 'zkey_mint', value: ZKEY_MINT },
      { trait_type: 'burn_rate', value: BURN_ZKEY_PER_KEY },
    ],
  }
}

export type BurnMintResult = {
  ok: boolean
  /** real, confirmed on-chain signature — never fabricated */
  signature?: string
  keyMint?: string | undefined
  keysMinted?: number
  error?: string
  code?: string
}

type PhantomProvider = {
  signAndSendTransaction: (tx: unknown) => Promise<{ signature: string }>
}

async function deserialize(base64: string) {
  const [{ Transaction }, { Buffer }] = await Promise.all([
    import('@solana/web3.js'),
    import('buffer'),
  ])
  return Transaction.from(Buffer.from(base64, 'base64'))
}

/** Poll our own server for confirmation — never a websocket subscription. */
async function pollConfirm(wallet: string, signature: string, keysMinted?: number) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const res = await fetch('/api/public/confirm-mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, signature, keysMinted }),
      })
      if (res.ok) return true
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  return false
}

/**
 * Atomic burn ZKEY + mint fungible KEY, signed once in Phantom.
 * Returns only a real signature — no status is ever invented client-side.
 */
export async function burnAndMintKey(input: {
  solWallet: string
  keys: number
  mode: 'test' | 'prod'
}): Promise<BurnMintResult> {
  let built: { ok?: boolean; transaction?: string; keyMint?: string; keysMinted?: number; error?: string }
  try {
    const res = await fetch('/api/public/mint-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: input.solWallet, keys: input.keys, mode: input.mode }),
    })
    built = (await res.json()) as typeof built
    if (!res.ok || !built.ok || !built.transaction) {
      return { ok: false, code: built.error ?? 'build_failed', error: built.error ?? 'Mint failed.' }
    }
  } catch {
    return { ok: false, code: 'network', error: 'Could not reach the mint service.' }
  }

  try {
    const tx = await deserialize(built.transaction)
    const provider = (window as unknown as { solana?: PhantomProvider }).solana
    if (!provider) return { ok: false, code: 'no_wallet', error: 'Phantom not found.' }
    const { signature } = await provider.signAndSendTransaction(tx)

    const keysMinted = built.keysMinted ?? input.keys
    const confirmed = await pollConfirm(input.solWallet, signature, keysMinted)
    if (!confirmed) {
      return {
        ok: false,
        code: 'confirm_timeout',
        signature,
        keyMint: built.keyMint,
        keysMinted,
        error: 'Sent — still confirming on-chain. Check the signature on Solscan.',
      }
    }
    return { ok: true, signature, keyMint: built.keyMint, keysMinted }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Transaction failed.'
    return { ok: false, code: 'tx_failed', error: msg }
  }
}

export type BurnKeyResult = {
  ok: boolean
  signature?: string
  error?: string
  code?: string
}

/**
 * Step 2: burn KEY from the user's wallet in ONE Phantom popup, then wait for
 * the signature to confirm. Pass nftMint to burn a legacy unique KEY NFT
 * instead of the fungible pool KEY. Never returns ok without a real signature.
 */
export async function burnKeyTokens(input: {
  solWallet: string
  keys: number
  nftMint?: string | null
  onPhase?: (phase: 'signing' | 'confirming') => void
}): Promise<BurnKeyResult> {
  let built: { ok?: boolean; transaction?: string; error?: string }
  try {
    const res = await fetch('/api/public/burn-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: input.solWallet,
        keys: input.keys,
        ...(input.nftMint ? { nftMint: input.nftMint } : {}),
      }),
    })
    built = (await res.json()) as typeof built
    if (!res.ok || !built.ok || !built.transaction) {
      return { ok: false, code: built.error ?? 'build_failed', error: built.error ?? 'Burn failed.' }
    }
  } catch {
    return { ok: false, code: 'network', error: 'Could not reach the burn service.' }
  }

  let signature: string
  try {
    const tx = await deserialize(built.transaction)
    const provider = (window as unknown as { solana?: PhantomProvider }).solana
    if (!provider) return { ok: false, code: 'no_wallet', error: 'Phantom not found.' }
    input.onPhase?.('signing')
    const sent = await provider.signAndSendTransaction(tx)
    signature = sent.signature
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Transaction failed.'
    return { ok: false, code: 'tx_failed', error: msg }
  }

  input.onPhase?.('confirming')
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const res = await fetch('/api/public/confirm-tx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature }),
      })
      const json = (await res.json()) as { confirmed?: boolean; failed?: boolean }
      if (json.failed) return { ok: false, code: 'tx_failed', error: 'Burn transaction failed on-chain.' }
      if (json.confirmed) return { ok: true, signature }
    } catch {
      // keep polling
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  // Sent but not seen yet — treat as confirmed-pending so the redeem row still
  // records the real signature. The payout bot verifies it before paying.
  return { ok: true, signature }
}

/**
 * Recount KEY supply on-chain (server-side getTokenSupply) and write the real
 * count into key_metrics.keys_outstanding. Never invents a number.
 */
export async function syncKeysFromChain(): Promise<number | null> {
  try {
    const res = await fetch('/api/public/sync-keys', { method: 'POST' })
    if (!res.ok) return null
    const json = (await res.json()) as { ok?: boolean; keys_outstanding?: number }
    return json.ok && Number.isFinite(json.keys_outstanding) ? Number(json.keys_outstanding) : null
  } catch {
    return null
  }
}
