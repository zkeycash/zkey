ALTER TABLE public.key_metrics
  ADD COLUMN IF NOT EXISTS volume_usd numeric,
  ADD COLUMN IF NOT EXISTS volume_basis text DEFAULT '24h',
  ADD COLUMN IF NOT EXISTS fees_to_keys_sol numeric;
