create extension if not exists pgcrypto;

create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('instagram', 'facebook', 'x', 'tiktok')),
  account_id text not null,
  display_name text not null,
  access_token_enc text not null,
  secret_enc text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, account_id)
);

create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  caption text not null default '',
  media_path text,
  media_mime_type text,
  media_size_bytes bigint check (media_size_bytes is null or media_size_bytes >= 0),
  media_width integer check (media_width is null or media_width > 0),
  media_height integer check (media_height is null or media_height > 0),
  scheduled_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'publishing', 'published', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_deliveries (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.scheduled_posts(id) on delete cascade,
  account_id uuid references public.social_accounts(id) on delete set null,
  platform text not null check (platform in ('instagram', 'facebook', 'x', 'tiktok')),
  scheduled_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'publishing', 'processing', 'published', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  claimed_at timestamptz,
  platform_post_id text,
  error_message text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, platform)
);

create index if not exists post_deliveries_due_idx
  on public.post_deliveries (scheduled_at)
  where status = 'scheduled';

create index if not exists scheduled_posts_status_time_idx
  on public.scheduled_posts (status, scheduled_at desc);

alter table public.social_accounts enable row level security;
alter table public.scheduled_posts enable row level security;
alter table public.post_deliveries enable row level security;

revoke all on public.social_accounts from anon, authenticated;
revoke all on public.scheduled_posts from anon, authenticated;
revoke all on public.post_deliveries from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('post-media', 'post-media', false, 104857600)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit;
