-- ============================================================================
-- ZapKitt — accounts, profile, usage, saved resumes  (Supabase / PostgreSQL)
--
-- Run once in the Supabase SQL editor, after enabling Email and Google
-- providers under Authentication > Providers.
--
-- ARCHITECTURE NOTE — read before adding a serverless route for any of this.
--
--   The browser talks to Supabase directly with the signed-in user's JWT. No
--   ZapKitt API route sits in the middle. That is deliberate:
--
--     1. Vercel Hobby caps this project at 12 serverless functions and it is
--        at 11. Routing profile/usage/resume reads through our own API would
--        have spent the last slot on something Postgres already does.
--     2. Row Level Security below is the access control. Every policy is
--        `auth.uid() = user_id`, so a user can only ever see or write their
--        own rows -- enforced by the database, not by application code we
--        could forget to add to a new endpoint.
--
--   Consequence: the anon key ships in client JavaScript. That is what it is
--   designed for. It grants nothing on its own -- every table below denies by
--   default and only the policies open anything up. NEVER put the service_role
--   key in client code; it bypasses RLS entirely.
-- ============================================================================

-- ── Profile ─────────────────────────────────────────────────────────────────
-- One row per user, created automatically on signup by the trigger below.
create table if not exists profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text,
  full_name        text,

  -- Education. graduation_date drives the OPT timeline.
  university       text,
  degree           text,
  major            text,
  graduation_date  date,

  -- Visa. This is the whole reason the product exists, so it is first-class
  -- rather than a preference blob.
  visa_status      text check (visa_status in ('F1','OPT','STEM-OPT','H1B','CPT','other')),
  stem_eligible    boolean,
  opt_start_date   date,
  employed         boolean not null default false,

  -- Career
  target_role      text,
  target_location  text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── Usage ───────────────────────────────────────────────────────────────────
-- One row per tool run. Kept as raw events rather than counters so the daily
-- limit, the dashboard history and any later analytics all read the same
-- source of truth.
create table if not exists usage_events (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  tool        text not null,          -- 'ats' | 'resume' | 'interview' | 'referral'
  created_at  timestamptz not null default now()
);

create index if not exists usage_events_user_day_idx
  on usage_events (user_id, created_at desc);

-- ── Saved resumes ───────────────────────────────────────────────────────────
create table if not exists saved_resumes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default 'Untitled resume',
  content     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists saved_resumes_user_idx
  on saved_resumes (user_id, updated_at desc);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Deny by default, then allow each user exactly their own rows. This is the
-- only thing standing between the public anon key and everyone's data, so do
-- not disable it and do not add a policy with `using (true)`.
alter table profiles      enable row level security;
alter table usage_events  enable row level security;
alter table saved_resumes enable row level security;

drop policy if exists "profiles: read own"   on profiles;
drop policy if exists "profiles: write own"  on profiles;
create policy "profiles: read own"  on profiles for select using (auth.uid() = id);
create policy "profiles: write own" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "usage: read own"   on usage_events;
drop policy if exists "usage: insert own" on usage_events;
create policy "usage: read own"   on usage_events for select using (auth.uid() = user_id);
create policy "usage: insert own" on usage_events for insert with check (auth.uid() = user_id);
-- No update or delete policy on purpose: a usage record must not be editable
-- by the person it limits.

drop policy if exists "resumes: read own"   on saved_resumes;
drop policy if exists "resumes: insert own" on saved_resumes;
drop policy if exists "resumes: update own" on saved_resumes;
drop policy if exists "resumes: delete own" on saved_resumes;
create policy "resumes: read own"   on saved_resumes for select using (auth.uid() = user_id);
create policy "resumes: insert own" on saved_resumes for insert with check (auth.uid() = user_id);
create policy "resumes: update own" on saved_resumes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "resumes: delete own" on saved_resumes for delete using (auth.uid() = user_id);

-- ── Signup trigger ──────────────────────────────────────────────────────────
-- Create the profile row on signup, so the app never has to handle "signed in
-- but no profile exists". SECURITY DEFINER because auth.users is not writable
-- from a user session.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── updated_at ──────────────────────────────────────────────────────────────
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_touch on profiles;
create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();

drop trigger if exists saved_resumes_touch on saved_resumes;
create trigger saved_resumes_touch before update on saved_resumes
  for each row execute function touch_updated_at();

-- ── Today's usage ───────────────────────────────────────────────────────────
-- Used for the free daily limit. A function rather than a view so it can be
-- called with one round trip and cannot be read for another user: it filters
-- on auth.uid() internally and ignores any argument.
create or replace function usage_today()
returns table (tool text, uses bigint)
language sql stable security invoker
as $$
  select tool, count(*)::bigint
  from usage_events
  where user_id = auth.uid()
    and created_at >= date_trunc('day', now() at time zone 'utc')
  group by tool;
$$;

grant execute on function usage_today() to authenticated;

-- ============================================================================
-- Plan (added with ZapKitt Pro)
-- ============================================================================

alter table profiles add column if not exists plan text not null default 'free'
  check (plan in ('free', 'pro'));

-- Someone can pay before they have an account -- Dodo only knows their email.
-- The webhook parks the plan here and the signup trigger below claims it, so
-- paying first and signing up second still gets Pro.
create table if not exists pending_plans (
  email       text primary key,
  plan        text not null default 'pro' check (plan in ('free','pro')),
  created_at  timestamptz not null default now()
);

-- No policies at all: only the service key (the Dodo webhook) touches this.
-- RLS on with zero policies means every anonymous request is denied.
alter table pending_plans enable row level security;

-- IMPORTANT: profiles has a read policy and an update policy scoped to
-- auth.uid(), which means a signed-in user could otherwise PATCH their own
-- plan to 'pro'. Lock the column so only the service key can change it.
create or replace function guard_plan_column()
returns trigger language plpgsql as $$
begin
  if new.plan is distinct from old.plan then
    raise exception 'plan is set by the payment webhook, not by the client';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_plan on profiles;
create trigger profiles_guard_plan
  before update on profiles
  for each row
  when (current_setting('request.jwt.claim.role', true) is distinct from 'service_role')
  execute function guard_plan_column();

-- Extend the signup trigger so a pre-paid plan is applied on account creation.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  parked text;
begin
  select p.plan into parked from public.pending_plans p where p.email = new.email;

  insert into public.profiles (id, email, full_name, plan)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(parked, 'free')
  )
  on conflict (id) do nothing;

  if parked is not null then
    delete from public.pending_plans where email = new.email;
  end if;
  return new;
end;
$$;
