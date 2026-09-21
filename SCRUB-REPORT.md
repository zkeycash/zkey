# ZKEY OSS Scrub Report

Generated: 2026-09-20 (America/New_York)

## Package contents

| Area | File count |
|------|------------|
| Total (excl. .git) | 126 |
| site/ | 113 |
| site/src/ | 81 |
| site/src/components/ui/ | 46 |
| site/src/routes/ | 13 |
| ops/ | 8 |
| Binary assets (png/ico) | 4 |

## Success criteria

- [x] `site/src/routes/`: index.tsx, test.tsx, docs.tsx, launchpad.tsx, api/public/*
- [x] `site/src/lib/`: key-value.ts, key-mint.ts
- [x] `site/package.json` present
- [x] Secret scrub clean

## Source

- Lovable project `49f56087-d9d5-467f-a983-c56a8e0784c0`
- Text sources pulled via MCP `list_files` + `read_file` into `site/`
- Binary assets downloaded from published app `https://zkey.lovable.app` (favicon png/ico, zkey-key pngs)
- A few shadcn UI primitives filled from registry new-york with Tailwind v4 class syntax where MCP write batching was incomplete; app routes/lib/config are from Lovable

## Sanitization

- No committed `.env` (only `site/.env.example` with placeholders)
- `supabase/config.toml` project_id placeholder: `YOUR_SUPABASE_PROJECT_ID`
- Ops `create-*.mjs` load authority from `KEY_MINT_AUTHORITY_JSON` or `KEY_MINT_AUTHORITY_PATH` only (no committed key material)
- Removed `_mcp_raw`, `_filelist.json` if present
- Scrub pattern (case-insensitive mnemonic phrase fragments / UUID stump / sample byte array): **CLEAN (0 hits)**
- Docs mentioning `MNEMONIC=` as a *format* example are intentional and allowed

## Public on-chain identifiers (not secrets)

- ZKEY mint, KEY mint, and mint-authority *pubkey* may appear in source — these are public Solana addresses

## Tarball

- `/workspace/zkey-oss.tar.gz` (excludes `.git`)
- Do **not** push to GitHub from this packaging step
