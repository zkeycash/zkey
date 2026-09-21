# ZKEY ZEC payout

Treasury transparent address: `t1YmzzPRrdCeCniYm1naneUozLhoWf5shWi` (BIP44 `m/44'/133'/0'/0/0`).

## Tooling

- Binary: `zingo-cli` (build from [zingolib](https://github.com/zingolabs/zingolib) with clearnet features as needed)
- Lightwalletd: `https://zec.rocks:443`
- Wallet dir: set `ZINGO_DATA_DIR` (default: `./zec-payout-wallet/` next to this script — **gitignored**)
- Sapling params: `~/.zcash-params/`
- Key file: set `TREASURY_KEY_FILE` (default: `./zec-treasury-key.txt` — **never commit**; format `MNEMONIC=...`)
- Script: `./send-zec-payout.sh`

## Secrets (names only)

| Env / file | Purpose |
|---|---|
| `TREASURY_KEY_FILE` / `zec-treasury-key.txt` | Contains `MNEMONIC=` for treasury restore |
| `ZINGO_SEED` | Injected by the script from the key file at restore time |
| `ZINGO_BIN` | Path to `zingo-cli` |
| `ZINGO_DATA_DIR` | Wallet data directory (`zingo-wallet.dat` lands here) |
| `ZINGO_SERVER` | Lightwalletd URL (default `https://zec.rocks:443`) |
| `WALLET_BIRTHDAY` | Optional birthday height for restore |

## Flow

1. Restore seed via `ZINGO_SEED` + `--birthday` (offline)
2. `sync run` against lightwalletd
3. If transparent > 0: `quickshield`, wait until `spendable_balance` > 0
4. `quicksend <zs1> <zat> "<memo>"` → capture real txid
5. Update Lovable / DB only after broadcast: set `status='fulfilled'`, `zec_txid=<txid>`

## Amount

```
zat = round(key_value_sol * SOL_USD / ZEC_USD * 1e8)
```

(Coinbase spot by default in the script.)

## Usage

```bash
./send-zec-payout.sh --to zs1... --sol-amount 0.96 --memo "ZKEY redeem <id>"
# or
./send-zec-payout.sh --to zs1... --zat 7102491 --memo "ZKEY redeem <id>"
```

## Example fulfilled payout (public chain data only)

- Amount: `7102491` zat (`0.07102491` ZEC)
- Destination (user shielded): `zs1xz78fgmy86768v8mmkzr3dgk6wuthalfphp8axu4tpfdnkvcpdhekt9xvy3rlcdt40eq5c3xf2q`
- Payout txid: `b4e926443c1cfc5fec83a96a8d23ccb04d3fee411c13cd747168d18502f022ed`
- Shield txid: `0dc56d072c825114c5fc458d73e3d550c7327422038e045e7f32113db8354672`
