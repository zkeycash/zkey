# ZKEY architecture

## High-level flow

```mermaid
flowchart LR
  User([User + Phantom])
  ZKEY[$ZKEY Token-2022]
  KEY[Fungible KEY<br/>decimals 0]
  Queue[(redeem_requests)]
  Bot[Payout bot<br/>zingo-cli]
  ZEC[Shielded ZEC zs1/ua1]

  User -->|1. burn ZKEY + mint KEY<br/>one Phantom popup| ZKEY
  ZKEY -.->|atomic tx| KEY
  User -->|2. burn KEY| KEY
  KEY --> Queue
  Queue -->|webhook or poll| Bot
  Bot -->|quickshield + quicksend| ZEC
```

## Step 1 — Burn ZKEY → mint KEY

```mermaid
sequenceDiagram
  participant U as User / Phantom
  participant S as Site API<br/>/api/public/mint-key
  participant Sol as Solana
  participant DB as Supabase

  U->>S: POST { wallet, keys, mode }
  S->>S: Load KEY_MINT_AUTHORITY_JSON
  S->>Sol: getLatestBlockhash
  S->>S: Build tx: burn ZKEY + create ATA + mint KEY
  S->>S: partialSign(mint authority)
  S-->>U: base64 unsigned-by-user tx
  U->>Sol: signAndSendTransaction (fee payer = user)
  U->>S: POST /api/public/confirm-mint { signature }
  S->>Sol: getSignatureStatuses
  S->>DB: key_mints status = minted
```

- Burn amount: `keys × 250_000` $ZKEY (prod) or `keys × 10_000` (test).
- KEY mint authority secret never leaves the server.

## Step 2 — Burn KEY → queue ZEC redeem

```mermaid
sequenceDiagram
  participant U as User / Phantom
  participant S as Site API
  participant Sol as Solana
  participant DB as Supabase
  participant W as Webhook / bot

  U->>S: POST /api/public/burn-key { wallet, keys [, nftMint] }
  S-->>U: unsigned burn tx
  U->>Sol: signAndSendTransaction
  U->>S: poll /api/public/confirm-tx
  U->>DB: INSERT redeem_requests (pending, burn_tx)
  S->>W: optional ZKEY_PAYOUT_WEBHOOK_* wake-up
```

Legacy unique KEY NFTs can be burned by passing `nftMint` (burn 1 + close ATA).

## Payout bot — KEY burn → ZEC

```mermaid
flowchart TD
  A[Pending redeem_requests] --> B{Verify burn_tx<br/>on Solana}
  B -->|invalid| X[Skip / fail]
  B -->|ok| C[Compute zat from key_value_sol<br/>× SOL/ZEC spot]
  C --> D[zingo-cli sync]
  D --> E{transparent > 0?}
  E -->|yes| F[quickshield]
  E -->|no| G[spendable_balance]
  F --> G
  G --> H[quicksend zs1 zat memo]
  H --> I[UPDATE status=fulfilled<br/>zec_txid=...]
```

Treasury transparent address (public): `t1YmzzPRrdCeCniYm1naneUozLhoWf5shWi`.

## KEY value

```mermaid
flowchart LR
  MC[Market cap SOL] -->|× 0.0001| Base[base KEY SOL]
  Vol[24h volume USD] -->|× 0.0003| Fees[fees generated]
  Fees -->|× 0.8| ToKeys[fees to KEY holders]
  ToKeys -->|÷ keys_outstanding| FeePer[fee per KEY SOL]
  Base --> KV[KEY value SOL]
  FeePer --> KV
```

Live MC via DexScreener (proxied by `/api/public/mc-proxy`); fees/keys snapshot in `key_metrics` (id = 1).

## Trust boundaries

| Secret | Lives in | Never in |
|---|---|---|
| `KEY_MINT_AUTHORITY_JSON` | Server env / ops host | Browser, git, VITE_* |
| `ZKEY_PAYOUT_WEBHOOK_KEY` | Server env | Browser |
| Treasury mnemonic | `TREASURY_KEY_FILE` on ops host | git, site bundle |
| Supabase service role | Bot / server only | VITE_* |

Public: mint addresses, mint-authority **pubkey**, treasury **t1** address.
