-- Run this in a Supabase SQL editor for your OWN project before enabling sign-in.
-- The browser may only read/write rows owned by the authenticated user.
create table if not exists public.saved_jobs (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null,
  title text not null,
  company text not null,
  source text not null,
  url text not null,
  location text not null default '',
  posted_at timestamptz,
  status text not null default 'saved' check (status in ('saved', 'applied', 'interview', 'rejected')),
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);
alter table public.saved_jobs enable row level security;
drop policy if exists "read own saved jobs" on public.saved_jobs;
drop policy if exists "insert own saved jobs" on public.saved_jobs;
drop policy if exists "update own saved jobs" on public.saved_jobs;
drop policy if exists "delete own saved jobs" on public.saved_jobs;
create policy "read own saved jobs" on public.saved_jobs for select to authenticated using (auth.uid() = user_id);
create policy "insert own saved jobs" on public.saved_jobs for insert to authenticated with check (auth.uid() = user_id);
create policy "update own saved jobs" on public.saved_jobs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own saved jobs" on public.saved_jobs for delete to authenticated using (auth.uid() = user_id);
create index if not exists saved_jobs_recent on public.saved_jobs(user_id, created_at desc);
