-- Proof-verifier pivot: persist the verification verdict alongside completions.
-- Purely additive — every column is nullable, so this is safe to apply to an
-- existing database without backfilling. The web app works without these
-- columns (it falls back to local JSON); they make the verdict durable and
-- enable a trustworthy, queryable "verified" record per completion.

alter table public.quest_completions
  add column if not exists decision    text,        -- 'pass' | 'flag' | 'reject'
  add column if not exists confidence  numeric,     -- 0..1 averaged across passes
  add column if not exists evidence    text,        -- what the model saw
  add column if not exists verified_at timestamptz, -- when the verdict was rendered
  add column if not exists source_hash text;        -- SHA-1 of the proof file (provenance / reuse detection)

-- Optional sanity constraint on the decision vocabulary. Guarded so re-running
-- the migration does not error if the constraint already exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quest_completions_decision_check'
  ) then
    alter table public.quest_completions
      add constraint quest_completions_decision_check
      check (decision is null or decision in ('pass', 'flag', 'reject'));
  end if;
end $$;

-- Find a previously-used proof file fast (cross-submission reuse detection).
create index if not exists quest_completions_source_hash_idx
  on public.quest_completions (source_hash);
