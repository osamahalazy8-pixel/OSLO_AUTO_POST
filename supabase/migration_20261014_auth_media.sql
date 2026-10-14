create table if not exists public.workspace_state (
  id boolean primary key default true check (id),
  owner_id uuid references auth.users(id) on delete set null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null default 'viewer'
    check (role in ('owner', 'admin', 'editor', 'viewer')),
  status text not null default 'pending'
    check (status in ('active', 'pending', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.scheduled_posts
  add column if not exists media_items jsonb not null default '[]'::jsonb;

alter table public.scheduled_posts
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists scheduled_posts_created_by_idx
  on public.scheduled_posts (created_by);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'scheduled_posts_media_items_array'
      and conrelid = 'public.scheduled_posts'::regclass
  ) then
    alter table public.scheduled_posts
      add constraint scheduled_posts_media_items_array
      check (jsonb_typeof(media_items) = 'array');
  end if;
end;
$$;

create or replace function public.create_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_role text := 'viewer';
  profile_status text := 'pending';
  profile_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'User'
  );
begin
  insert into public.workspace_state (id, owner_id)
  values (true, new.id)
  on conflict (id) do update
    set owner_id = excluded.owner_id
    where public.workspace_state.owner_id is null;

  if exists (
    select 1 from public.workspace_state
    where id = true and owner_id = new.id
  ) then
    profile_role := 'owner';
    profile_status := 'active';
  end if;

  insert into public.user_profiles (id, email, display_name, role, status)
  values (new.id, coalesce(new.email, ''), profile_name, profile_role, profile_status);
  return new;
end;
$$;

drop trigger if exists create_user_profile_after_signup on auth.users;
create trigger create_user_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_user_profile();

alter table public.workspace_state enable row level security;
alter table public.user_profiles enable row level security;

revoke all on public.workspace_state from anon, authenticated;
revoke all on public.user_profiles from anon, authenticated;
revoke all on public.workspace_state from public;
revoke all on public.user_profiles from public;
revoke all on function public.create_user_profile() from public, anon, authenticated;

comment on table public.workspace_state is
  'Single-workspace owner bootstrap and workspace-level settings.';
comment on table public.user_profiles is
  'Server-managed roles and account approval state for Supabase Auth users.';
comment on column public.scheduled_posts.media_items is
  'Ordered media files with platform-specific transformed storage paths.';
