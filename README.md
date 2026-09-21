# ZKEY

Open-source package for **ZKEY → KEY → private ZEC**.

Burn `$ZKEY` on Solana to mint fungible **KEY**, then burn KEY to redeem private **ZEC** to a shielded address. `site/` is the TanStack Start frontend. `ops/` covers KEY mint creation and ZEC treasury payouts.

## Architecture (short)

```
$ZKEY (Token-2022)  --burn-->  KEY (fungible SPL, decimals 0)  --burn-->  redeem queue  --bot-->  shielded ZEC
```

1. **Burn ZKEY → mint KEY** — one Phantom popup. Server builds an atomic tx (burn ZKEY + mint KEY), partially signed by the KEY mint authority. User signs as fee payer.
2. **Burn KEY → ZEC** — user burns KEY in Phantom, then a redeem row is queued. A payout bot sends ZEC from the treasury to the user's shielded address.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for Mermaid flow diagrams.

## Economics

| Parameter | Value |
|---|---|
| Burn rate | **1,000,000 $ZKEY → 1 KEY** |
| Base KEY value | **0.01% of $ZKEY market cap** (`KEY_MC_SHARE = 0.0001`, independent of burn amount) |
| Fee rate | **0.03%** of trading volume (`FEE_RATE = 0.0003`) |
| Fee share to KEY holders | **80%** of fees (`FEE_SHARE_TO_KEYS = 0.8`), split across outstanding KEY |
| KEY value (SOL) | `baseKeySol(mc) + feePerKeySol(feesVault, keysOutstanding)` |

## Public addresses

| What | Address |
|---|---|
| **$ZKEY mint** | `` |
| **KEY mint** (fungible, decimals 0) | `6KnZsn8Ej9w7LuyGm9y1eA4Q8T6VSoKBLPSSgq6vjVcx` |
| **KEY collection** (legacy NFT era) | `63auqENdyHBqshgfJ3pEfXQgHR6UXiHWhcDoLfVxcbg5` |
| **Mint authority** (pubkey only) | `4iYg5WpaWyjSJLg5gGPNaKmFwj78JS1sLxNunCboS1nW` |
| **ZEC treasury** (transparent t1) | `t1YmzzPRrdCeCniYm1naneUozLhoWf5shWi` |

Solscan: [KEY](https://solscan.io/token/6KnZsn8Ej9w7LuyGm9y1eA4Q8T6VSoKBLPSSgq6vjVcx) · [collection](https://solscan.io/token/63auqENdyHBqshgfJ3pEfXQgHR6UXiHWhcDoLfVxcbg5)

## Repo layout

```
zkey-oss/
  site/             # TanStack Start frontend
  ops/              # Mint scripts + ZEC payout tooling
  README.md
  ARCHITECTURE.md
  .gitignore
```

## Run the site

```bash
cd site
cp .env.example .env   # fill placeholders — never commit .env
npm install            # or: bun install
npm run dev
```

Required secret **names** are listed below and in `site/.env.example` (values never belong in git).

## Run KEY mint ops

```bash
cd ops
npm install
# Provide the mint-authority keypair via env (path or JSON array) — DO NOT commit it
export KEY_MINT_AUTHORITY_JSON=./key-mint-authority.json   # gitignored
export SOLANA_RPC=https://api.mainnet-beta.solana.com
node create-fungible-key.mjs
node create-collection.mjs
```

Public outputs already included: `fungible-key-mint.json`, `collection-mint.json`, `key-mint-authority.pubkey.txt`.

## Run ZEC payout

See [ops/ZEC-PAYOUT.md](./ops/ZEC-PAYOUT.md).

```bash
cd ops
# TREASURY_KEY_FILE must contain MNEMONIC=... (never commit)
./send-zec-payout.sh --to zs1... --sol-amount 0.96 --memo "ZKEY redeem <id>"
# or: ./send-zec-payout.sh --to zs1... --zat 7102491 --memo "..."
```

After broadcast, mark the redeem row fulfilled with the real `zec_txid`.

## Required secrets (names only — no values)

| Name | Where | Purpose |
|---|---|---|
| `KEY_MINT_AUTHORITY_JSON` | site server / ops | Solana keypair JSON array or path to that file (mint authority) |
| `SOLANA_RPC` | site server / ops | Solana JSON-RPC URL |
| `HELIUS_API_KEY` | site server (optional) | Paid RPC / DAS |
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | site | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | site | Publishable anon key |
| `SUPABASE_PROJECT_ID` / `VITE_SUPABASE_PROJECT_ID` | site | Project ref |
| `ZKEY_PAYOUT_WEBHOOK_URL` | site server | Optional instant wake-up for payout bot |
| `ZKEY_PAYOUT_WEBHOOK_KEY` | site server | Shared secret for webhook |
| `TREASURY_KEY_FILE` / `zec-treasury-key.txt` | ops | File with `MNEMONIC=` for ZEC treasury (never commit) |
| `ZINGO_BIN` / `ZINGO_DATA_DIR` / `ZINGO_SERVER` | ops | zingo-cli path, wallet dir, lightwalletd |

## What is NOT in this repo

- Mint-authority **secret** keypair JSON (`key-mint-authority.json`)
- ZEC treasury mnemonic / WIF / `zingo-wallet.dat`
- `zec-payout-wallet/`
- Real `.env` values
- Any mnemonic, WIF, private key hex, or secret JSON arrays

## License

Add your preferred license before publishing.
