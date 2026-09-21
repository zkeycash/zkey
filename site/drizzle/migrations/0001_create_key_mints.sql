CREATE TABLE public.key_mints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  sol_wallet text NOT NULL,
  keys_minted integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  nft_mints text[] NOT NULL DEFAULT '{}',
  burn_tx text,
  error text,
  minted_at timestamptz
);

GRANT INSERT ON public.key_mints TO anon;
GRANT INSERT ON public.key_mints TO authenticated;
GRANT ALL ON public.key_mints TO service_role;

ALTER TABLE public.key_mints ENABLE ROW LEVEL SECURITY;

-- Anyone may queue a pending mint request; nobody public may read or update it
-- (wallet addresses stay private). The vault-backed minter uses service role.
CREATE POLICY "key_mints insert pending"
ON public.key_mints
FOR INSERT
TO anon, authenticated
WITH CHECK (
  status = 'pending'
  AND burn_tx IS NULL
  AND error IS NULL
  AND minted_at IS NULL
  AND nft_mints = '{}'::text[]
  AND keys_minted > 0
  AND length(sol_wallet) BETWEEN 32 AND 64
);
