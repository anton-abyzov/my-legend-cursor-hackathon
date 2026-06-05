-- Legend side-quest catalog.
-- The catalog is the database of quests surfaced at the start of the web and
-- desktop flows. Data is seeded from data/side-quests.json via
-- scripts/seedSupabase.js. Public anon can read active catalog rows; progress
-- writes/reads stay server-owned through SUPABASE_SERVICE_ROLE_KEY.

create extension if not exists "pgcrypto";

create table if not exists public.side_quests (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  title         text not null,
  description   text not null default '',
  category      text not null default 'misc',
  difficulty    text not null default 'medium'
                  check (difficulty in ('easy', 'medium', 'hard', 'extreme')),
  base_xp       integer not null default 300,
  bonus_xp      integer not null default 0,
  total_xp      integer not null default 300,
  social        text not null default 'either'
                  check (social in ('solo', 'group', 'either')),
  setting       text not null default 'anywhere'
                  check (setting in ('indoor', 'outdoor', 'anywhere')),
  cost          text not null default 'free'
                  check (cost in ('free', 'cheap', 'paid')),
  tags          text[] not null default '{}',
  source        text not null default 'community-sidequests',
  source_number integer,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists side_quests_category_idx   on public.side_quests (category);
create index if not exists side_quests_difficulty_idx on public.side_quests (difficulty);
create index if not exists side_quests_cost_idx       on public.side_quests (cost);
create index if not exists side_quests_social_idx     on public.side_quests (social);
create index if not exists side_quests_active_idx     on public.side_quests (is_active);
create index if not exists side_quests_tags_idx       on public.side_quests using gin (tags);

alter table public.side_quests enable row level security;

-- Anyone (anon key) can read the active catalog.
drop policy if exists "side_quests_public_read" on public.side_quests;
create policy "side_quests_public_read"
  on public.side_quests for select
  using (is_active = true);

-- Optional: log which quest a user picked, for analytics / "expanding" the set
-- by surfacing popular and under-attempted quests later.
create table if not exists public.quest_picks (
  id          uuid primary key default gen_random_uuid(),
  quest_slug  text not null references public.side_quests (slug) on delete cascade,
  surface     text not null default 'web' check (surface in ('web', 'desktop')),
  picked_at   timestamptz not null default now()
);

create index if not exists quest_picks_slug_idx on public.quest_picks (quest_slug);

alter table public.quest_picks enable row level security;

drop policy if exists "quest_picks_public_insert" on public.quest_picks;
drop policy if exists "quest_picks_public_select" on public.quest_picks;

-- Completions: the "answers" — a finished quest links its proof video (job_id)
-- and the grade back to the quest ("question"). Powers XP/level, progress, and
-- the smart recommender.
create table if not exists public.quest_completions (
  id          uuid primary key default gen_random_uuid(),
  quest_slug  text not null references public.side_quests (slug) on delete cascade,
  job_id      text,
  grade_score numeric,
  xp_earned   integer not null default 0,
  surface     text not null default 'web' check (surface in ('web', 'desktop')),
  created_at  timestamptz not null default now()
);

create index if not exists quest_completions_slug_idx    on public.quest_completions (quest_slug);
create index if not exists quest_completions_created_idx  on public.quest_completions (created_at desc);

alter table public.quest_completions enable row level security;

drop policy if exists "quest_completions_public_insert" on public.quest_completions;
drop policy if exists "quest_completions_public_select" on public.quest_completions;
