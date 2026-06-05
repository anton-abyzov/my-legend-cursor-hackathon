-- Per-user attribution for picks and completions.
-- Optional, additive migration: ties each pick/completion to the Supabase auth
-- user (auth.users.id) so quest progress can be reported per-user. The server
-- (src/web/lib/questStore.js) inserts user_id when present and silently retries
-- without it if this migration has not been applied, so the app works either
-- way. Columns are nullable to keep desktop/anonymous flows working.

alter table public.quest_picks
  add column if not exists user_id uuid references auth.users (id) on delete set null;

alter table public.quest_completions
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists quest_picks_user_idx       on public.quest_picks (user_id);
create index if not exists quest_completions_user_idx on public.quest_completions (user_id);
