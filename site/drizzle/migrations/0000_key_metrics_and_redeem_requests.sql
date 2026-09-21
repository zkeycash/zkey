CREATE TABLE public.key_metrics (
  id integer PRIMARY KEY DEFAULT 1,
  fees_vault_sol numeric NOT NULL DEFAULT 0,
  keys_outstanding integer NOT NULL DEFAULT 0,
  fees_to_keys_sol numeric NOT NULL DEFAULT 0,
  mc_usd numeric,
  mc_sol numeric,
  key_value_sol numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT key_metrics_single_row CHECK (id = 1)
);

GRANT SELECT ON public.key_metrics TO anon;
GRANT SELECT ON public.key_metrics TO authenticated;
GRANT ALL ON public.key_metrics TO service_role;

ALTER TABLE public.key_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "key_metrics public read" ON public.key_metrics FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.key_metrics (id) VALUES (1);

CREATE TABLE public.redeem_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  sol_wallet text NOT NULL,
  zec_address text NOT NULL,
  keys_burned numeric NOT NULL DEFAULT 1,
  key_value_sol numeric,
  est_zec numeric,
  burn_tx text,
  status text NOT NULL DEFAULT 'pending',
  zec_txid text,
  error text,
  paid_at timestamptz,
  CONSTRAINT redeem_requests_status_check CHECK (status IN ('pending','sending','fulfilled','failed'))
);

CREATE INDEX redeem_requests_wallet_idx ON public.redeem_requests (sol_wallet, created_at DESC);

GRANT SELECT, INSERT ON public.redeem_requests TO anon;
GRANT SELECT, INSERT ON public.redeem_requests TO authenticated;
GRANT ALL ON public.redeem_requests TO service_role;

ALTER TABLE public.redeem_requests ENABLE ROW LEVEL SECURITY;

-- Anyone may queue a redeem, but only as a fresh pending row with no bot-owned fields set.
CREATE POLICY "redeem_requests insert pending" ON public.redeem_requests
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'pending'
    AND zec_txid IS NULL
    AND paid_at IS NULL
    AND error IS NULL
    AND est_zec IS NULL
    AND length(sol_wallet) BETWEEN 32 AND 64
    AND length(zec_address) BETWEEN 12 AND 512
    AND keys_burned > 0
  );

-- Queue is public-readable (no PII beyond addresses the user supplied); no UPDATE/DELETE for anon.
CREATE POLICY "redeem_requests public read" ON public.redeem_requests
  FOR SELECT TO anon, authenticated USING (true);
