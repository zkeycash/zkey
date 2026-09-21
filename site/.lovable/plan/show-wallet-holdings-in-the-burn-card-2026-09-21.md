# Show wallet holdings in the burn card

Right now the card never reads your wallet, so it can't show how much $ZKEY you hold and the KEY balance is hard-coded to 0. This adds real holdings for the connected wallet.

## What you'll see

- Step 1: a small line above the amount box — `Balance: 1,234,567 ZKEY` for the connected wallet. MAX fills that amount.
- Step 2: `Balance: N KEY` replacing the fixed 0, plus MAX.
- Not connected: shows `Connect wallet` instead of a number. Never a fake number — if the lookup fails it shows `—`.
- Refreshes when the wallet connects, after a burn, and every ~15 seconds.

## How it works

New server endpoint `src/routes/api/public/holdings.ts`:
- Input: `wallet` query param (validated as a base58 address).
- ZKEY balance: Solana RPC `getTokenAccountsByOwner` for owner + `ZKEY_MINT`, sums UI amounts. Runs server-side so there's no browser CORS issue.
- KEY count: if a `HELIUS_API_KEY` secret is present, use the DAS `getAssetsByOwner` call filtered to `KEY_COLLECTION_MINT` for the exact on-chain count. Without that key, fall back to counting this wallet's `key_mints` rows with status `minted` (read via service role inside the endpoint, since the table isn't publicly readable) and label the value as such.
- Returns `{ zkey: number | null, keys: number | null, source: 'chain' | 'db' }`.

Client:
- `fetchHoldings(wallet)` helper in `src/lib/key-value.ts`.
- `/` and `/test` both use it; the two pages keep their own economics constants unchanged (1,000,000 vs 10,000 burn rate, live vs fixed 0.1 SOL value).
- MAX buttons fill from the fetched balance instead of doing nothing.

## Notes

- Public Solana RPC is rate-limited; if it throttles, holdings show `—` rather than a guess. Adding a Helius key later makes both numbers exact and reliable.
- No changes to burn economics, pricing, the redeem queue, or the visual style.
