-- Hangar Cloud Backend
-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

-- Profiles mirror auth.users. Do not store passwords here; Supabase Auth owns that.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  github_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  template text,
  description text,
  github_owner text,
  github_repo text,
  github_repo_url text,
  github_default_branch text not null default 'main',
  github_installation_id text,
  local_rel text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  content text not null default '',
  language text,
  size_bytes integer not null default 0,
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, path)
);

create table if not exists public.ai_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  base_url text,
  model text,
  -- Placeholder for future server-side encryption.
  -- For MVP, keep provider keys local in the desktop SQLCipher vault.
  encrypted_api_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commits (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  commit_sha text,
  commit_message text,
  source text not null default 'hangar',
  created_at timestamptz not null default now()
);

create table if not exists public.sync_events (
  id bigint generated always as identity primary key,
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  event_type text not null,
  owner text,
  repo text,
  branch text,
  commit_sha text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_user_updated
  on public.projects(user_id, updated_at desc);

create index if not exists idx_project_files_project_path
  on public.project_files(project_id, path);

create index if not exists idx_commits_project_created
  on public.commits(project_id, created_at desc);

create index if not exists idx_sync_events_repo
  on public.sync_events(owner, repo, id desc);

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists project_files_set_updated_at on public.project_files;
create trigger project_files_set_updated_at
before update on public.project_files
for each row execute function public.set_updated_at();

drop trigger if exists ai_connections_set_updated_at on public.ai_connections;
create trigger ai_connections_set_updated_at
before update on public.ai_connections
for each row execute function public.set_updated_at();

-- Create profile after Supabase Auth signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_files enable row level security;
alter table public.ai_connections enable row level security;
alter table public.commits enable row level security;
alter table public.sync_events enable row level security;

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

-- projects
drop policy if exists "projects_crud_own" on public.projects;
create policy "projects_crud_own"
on public.projects for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- project_files
drop policy if exists "project_files_crud_own" on public.project_files;
create policy "project_files_crud_own"
on public.project_files for all
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.projects p
    where p.id = project_id and p.user_id = auth.uid()
  )
);

-- ai_connections
drop policy if exists "ai_connections_crud_own" on public.ai_connections;
create policy "ai_connections_crud_own"
on public.ai_connections for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- commits
drop policy if exists "commits_crud_own" on public.commits;
create policy "commits_crud_own"
on public.commits for all
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.projects p
    where p.id = project_id and p.user_id = auth.uid()
  )
);

-- sync_events: users can read events for their projects. Writes should come from
-- server-side service-role functions later.
drop policy if exists "sync_events_select_own" on public.sync_events;
create policy "sync_events_select_own"
on public.sync_events for select
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.projects p
    where p.id = project_id and p.user_id = auth.uid()
  )
);
