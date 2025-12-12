alter table public.jobs
  add column if not exists score_diagnostics jsonb;

