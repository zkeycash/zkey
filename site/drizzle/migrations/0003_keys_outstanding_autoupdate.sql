-- Recalculate key_value_sol from the current row values.
create or replace function public.recalc_key_value()
returns void
language sql
security definer
set search_path = public
as $$
  update public.key_metrics
  set key_value_sol = coalesce(mc_sol, 0) * 0.0001
    + case when coalesce(keys_outstanding, 0) > 0
        then coalesce(fees_to_keys_sol, coalesce(fees_vault_sol, 0) * 0.8) / greatest(keys_outstanding, 1)
        else 0 end,
      updated_at = now()
  where id = 1;
$$;

-- Increment keys outstanding by N and recalc value.
create or replace function public.bump_keys_outstanding(n integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare total integer;
begin
  update public.key_metrics
  set keys_outstanding = greatest(coalesce(keys_outstanding, 0) + n, 0),
      updated_at = now()
  where id = 1
  returning keys_outstanding into total;
  perform public.recalc_key_value();
  return coalesce(total, 0);
end;
$$;

-- Set keys outstanding to an authoritative on-chain count.
create or replace function public.set_keys_outstanding(n integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare total integer;
begin
  update public.key_metrics
  set keys_outstanding = greatest(n, 0), updated_at = now()
  where id = 1
  returning keys_outstanding into total;
  perform public.recalc_key_value();
  return coalesce(total, 0);
end;
$$;

revoke all on function public.recalc_key_value() from public, anon, authenticated;
revoke all on function public.bump_keys_outstanding(integer) from public, anon, authenticated;
revoke all on function public.set_keys_outstanding(integer) from public, anon, authenticated;
grant execute on function public.recalc_key_value() to service_role;
grant execute on function public.bump_keys_outstanding(integer) to service_role;
grant execute on function public.set_keys_outstanding(integer) to service_role;

-- Auto-increment keys_outstanding whenever a key_mints row becomes 'minted'.
create or replace function public.on_key_mint_minted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'minted' and coalesce(old.status, '') is distinct from 'minted' then
    perform public.bump_keys_outstanding(coalesce(new.keys_minted, 0));
  end if;
  return new;
end;
$$;

drop trigger if exists key_mints_minted_bump on public.key_mints;
create trigger key_mints_minted_bump
after insert or update of status on public.key_mints
for each row
execute function public.on_key_mint_minted();
