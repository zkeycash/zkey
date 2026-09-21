#!/usr/bin/env bash
# ZKEY treasury ZEC payout (t1 BIP44 -> quickshield Ironwood -> quicksend zs1)
# Secrets stay in zec-treasury-key.txt / ZINGO_SEED; never echoed.
#
#   ./send-zec-payout.sh --to zs1... --sol-amount 0.96 [--memo "ZKEY redeem <id>"]
#   ./send-zec-payout.sh --to zs1... --zat 7102491 [--memo "..."]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ZINGO_BIN="${ZINGO_BIN:-zingo-cli}"
DATA="${ZINGO_DATA_DIR:-$ROOT/zec-payout-wallet}"
SERVER="${ZINGO_SERVER:-https://zec.rocks:443}"
KEYFILE="${TREASURY_KEY_FILE:-$ROOT/zec-treasury-key.txt}"
export HOME="${HOME:-/home/box}"

TO=""; SOL_AMOUNT=""; ZAT=""; MEMO="ZKEY redeem"
BIRTHDAY="${WALLET_BIRTHDAY:-3490500}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --to) TO="$2"; shift 2 ;;
    --sol-amount) SOL_AMOUNT="$2"; shift 2 ;;
    --zat) ZAT="$2"; shift 2 ;;
    --memo) MEMO="$2"; shift 2 ;;
    --birthday) BIRTHDAY="$2"; shift 2 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$TO" ]] || { echo "--to required" >&2; exit 2; }
[[ -x "$ZINGO_BIN" ]] || { echo "build zingo-cli first" >&2; exit 1; }
[[ -f "$KEYFILE" ]] || { echo "missing $KEYFILE" >&2; exit 1; }

zingo() { "$ZINGO_BIN" --data-dir "$DATA" "$@"; }
spendable() { zingo --offline --nosync spendable_balance 2>/dev/null | python3 -c 'import sys,re;t=sys.stdin.read();m=re.search(r"([0-9_]+)\s*$",t.strip().split(":")[-1]) or re.search(r"spendable_balance\"?\s*:\s*([0-9_]+)",t);print((m.group(1) if m else "0").replace("_",""))'; }
tbal() { zingo --offline --nosync balance 2>/dev/null | python3 -c 'import sys,re;t=sys.stdin.read();m=re.search(r"confirmed_transparent_balance:\s*([0-9_]+)",t);print((m.group(1) if m else "0").replace("_",""))'; }
txid_of() { python3 -c 'import sys,json,re;t=sys.stdin.read();
try:
 i=t.index("{");d=json.loads(t[i:t.rindex("}")+1]);print(d["txids"][0])
except Exception:
 m=re.search(r"[0-9a-f]{64}",t);print(m.group(0) if m else "")'; }

mkdir -p "$DATA"
if [[ ! -f "$DATA/zingo-wallet.dat" ]]; then
  export ZINGO_SEED
  ZINGO_SEED="$(python3 -c 'import pathlib;f=pathlib.Path("'"$KEYFILE"'");
print(next(l.split("=",1)[1].strip() for l in f.read_text().splitlines() if l.startswith("MNEMONIC=")))')"
  zingo --offline --birthday "$BIRTHDAY" wallet_kind >/dev/null
  unset ZINGO_SEED
fi

if [[ -z "$ZAT" ]]; then
  [[ -n "$SOL_AMOUNT" ]] || { echo "need --sol-amount or --zat" >&2; exit 2; }
  SOL_USD="${SOL_USD:-$(curl -fsS https://api.coinbase.com/v2/prices/SOL-USD/spot | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["amount"])')}"
  ZEC_USD="${ZEC_USD:-$(curl -fsS https://api.coinbase.com/v2/prices/ZEC-USD/spot | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["amount"])')}"
  ZAT="$(python3 -c 'print(int(round(float("'"$SOL_AMOUNT"'")*float("'"$SOL_USD"'")/float("'"$ZEC_USD"'")*1e8)))')"
fi

echo "Payout to=$TO zat=$ZAT sol=${SOL_AMOUNT:-n/a} SOLUSD=${SOL_USD:-n/a} ZECUSD=${ZEC_USD:-n/a}" >&2
zingo --server "$SERVER" --online --waitsync sync run >/dev/null

if [[ "$(tbal)" -gt 0 ]]; then
  echo "quickshield..." >&2
  zingo --server "$SERVER" --online --nosync quickshield >/dev/null
  for _ in $(seq 1 40); do
    zingo --server "$SERVER" --online --waitsync sync run >/dev/null || true
    [[ "$(spendable)" -gt 0 ]] && break
    sleep 15
  done
fi

sp="$(spendable)"
[[ "$sp" -ge "$ZAT" ]] || { echo "insufficient spendable have=$sp need=$ZAT" >&2; exit 1; }

OUT="$(zingo --server "$SERVER" --online --nosync quicksend "$TO" "$ZAT" "$MEMO")"
echo "$OUT"
TXID="$(printf '%s' "$OUT" | txid_of)"
[[ -n "$TXID" ]] || { echo "no txid" >&2; exit 1; }
echo "ZEC_TXID=$TXID"
echo "Then: UPDATE redeem_requests SET status='fulfilled', zec_txid='$TXID' WHERE id='...' AND status='pending';" >&2
