/**
 * Create the legacy Metaplex KEY collection NFT (no longer minted into for new KEYS).
 *
 * Auth: set KEY_MINT_AUTHORITY_JSON to either a keypair file path or a raw JSON array.
 * Never hardcode secrets in this file.
 *
 *   KEY_MINT_AUTHORITY_JSON=./key-mint-authority.json SOLANA_RPC=... node create-collection.mjs
 */
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import {
  createSignerFromKeypair,
  signerIdentity,
  generateSigner,
  percentAmount,
} from '@metaplex-foundation/umi'
import {
  createNft,
  mplTokenMetadata,
} from '@metaplex-foundation/mpl-token-metadata'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

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
const rpc = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com'
const umi = createUmi(rpc).use(mplTokenMetadata())

const keypair = umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(secret))
const signer = createSignerFromKeypair(umi, keypair)
umi.use(signerIdentity(signer))

const meta = {
  name: 'ZKEY KEYS',
  symbol: 'KEY',
  description:
    'ZKEY KEY collection. Burn 1,000,000 $ZKEY for 1 KEY. Base value = 0.01% of MC + 80% of (0.03% volume fees) ÷ keys. Redeem for private ZEC.',
  image: process.env.KEY_COLLECTION_IMAGE || 'https://zkey.cash/favicon.ico',
  external_url: process.env.KEY_EXTERNAL_URL || 'https://zkey.cash',
  attributes: [
    { trait_type: 'burn_amount', value: '1000000' },
    { trait_type: 'mc_share', value: '0.01%' },
    { trait_type: 'fee_rate', value: '0.03%' },
  ],
}
fs.writeFileSync('./collection-metadata.json', JSON.stringify(meta, null, 2))

let uri
try {
  uri = execSync("curl -sS -F'file=@collection-metadata.json' https://0x0.st", { encoding: 'utf8' }).trim()
} catch {
  uri = process.env.KEY_METADATA_URI || 'https://zkey.cash/docs'
}
console.log('METADATA_URI', uri)

const mint = generateSigner(umi)
console.log('COLLECTION_MINT', mint.publicKey)

const tx = await createNft(umi, {
  mint,
  name: 'ZKEY KEYS',
  symbol: 'KEY',
  uri,
  sellerFeeBasisPoints: percentAmount(0),
  isCollection: true,
  isMutable: true,
}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } })

const out = {
  collectionMint: mint.publicKey.toString(),
  authority: signer.publicKey.toString(),
  signature: Buffer.from(tx.signature).toString('base64'),
  metadataUri: uri,
  solscan: `https://solscan.io/token/${mint.publicKey}`,
}
fs.writeFileSync('./collection-mint.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
