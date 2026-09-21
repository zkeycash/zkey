/**
 * Create the fungible KEY pool mint (decimals 0, classic SPL Token).
 *
 * Auth: set KEY_MINT_AUTHORITY_JSON to either:
 *   - path to a JSON keypair file (Solana CLI array format), or
 *   - the raw JSON array string itself
 * Never hardcode secrets in this file.
 *
 *   KEY_MINT_AUTHORITY_JSON=./key-mint-authority.json SOLANA_RPC=... node create-fungible-key.mjs
 */
import { Connection, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createInitializeMint2Instruction,
  getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token'
import {
  createV1,
  mplTokenMetadata,
  TokenStandard,
} from '@metaplex-foundation/mpl-token-metadata'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { createSignerFromKeypair, percentAmount, publicKey, signerIdentity } from '@metaplex-foundation/umi'
import { toWeb3JsInstruction } from '@metaplex-foundation/umi-web3js-adapters'
import fs from 'fs'
import path from 'path'

function loadAuthoritySecret() {
  const raw =
    process.env.KEY_MINT_AUTHORITY_JSON ||
    process.env.KEY_MINT_AUTHORITY_PATH ||
    ''
  if (!raw) {
    throw new Error(
      'Set KEY_MINT_AUTHORITY_JSON (JSON array or path) or KEY_MINT_AUTHORITY_PATH (keypair file). Do not commit the key.',
    )
  }
  const trimmed = raw.trim()
  if (trimmed.startsWith('[')) {
    return JSON.parse(trimmed)
  }
  const filePath = path.resolve(trimmed)
  if (!fs.existsSync(filePath)) {
    throw new Error(`KEY_MINT_AUTHORITY_JSON file not found: ${filePath}`)
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

const secret = loadAuthoritySecret()
const authority = Keypair.fromSecretKey(Uint8Array.from(secret))
const rpc = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com'
const connection = new Connection(rpc, 'confirmed')

const mintKp = Keypair.generate()
const decimals = 0 // whole KEY units

const lamports = await getMinimumBalanceForRentExemptMint(connection)
const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

const tx = new Transaction({ feePayer: authority.publicKey, blockhash, lastValidBlockHeight })
tx.add(
  SystemProgram.createAccount({
    fromPubkey: authority.publicKey,
    newAccountPubkey: mintKp.publicKey,
    space: MINT_SIZE,
    lamports,
    programId: TOKEN_PROGRAM_ID,
  }),
  createInitializeMint2Instruction(
    mintKp.publicKey,
    decimals,
    authority.publicKey, // mint authority
    null, // no freeze
    TOKEN_PROGRAM_ID,
  ),
)

const umi = createUmi(rpc).use(mplTokenMetadata())
const umiAuth = createSignerFromKeypair(umi, {
  publicKey: publicKey(authority.publicKey.toBase58()),
  // secretKey omitted from public output
})
umi.use(signerIdentity(umiAuth))

const metaBuilder = createV1(umi, {
  mint: publicKey(mintKp.publicKey.toBase58()),
  authority: umiAuth,
  payer: umiAuth,
  updateAuthority: umiAuth,
  name: 'ZKEY KEY',
  symbol: 'KEY',
  uri: process.env.KEY_METADATA_URI || 'https://zkey.cash/docs',
  sellerFeeBasisPoints: percentAmount(0),
  tokenStandard: TokenStandard.Fungible,
  decimals,
})
for (const ix of metaBuilder.getInstructions()) tx.add(toWeb3JsInstruction(ix))

tx.partialSign(authority, mintKp)
const sig = await sendAndConfirmTransaction(connection, tx, [authority, mintKp], {
  commitment: 'confirmed',
})

const out = {
  keyMint: mintKp.publicKey.toBase58(),
  decimals,
  mintAuthority: authority.publicKey.toBase58(),
  freezeAuthority: null,
  signature: sig,
  solscan: `https://solscan.io/token/${mintKp.publicKey.toBase58()}`,
  tx: `https://solscan.io/tx/${sig}`,
  note: 'Fungible KEY pool — burn ZKEY mints +1 KEY from this mint; redeem burns KEY.',
}
fs.writeFileSync('./fungible-key-mint.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
