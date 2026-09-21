ALTER TABLE public.redeem_requests
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'prod';
COMMENT ON COLUMN public.redeem_requests.source IS 'prod = main burner, test = /test page';
