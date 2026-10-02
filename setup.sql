-- TAHSIN DAN TADABBUR 2026 MEMORY
-- Run this entire file once in Supabase: SQL Editor -> New query -> Run.
-- Before testing the website, also enable Authentication -> Providers -> Anonymous Sign-Ins.

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  description text check (description is null or char_length(description) <= 220),
  memory_date date,
  photo_path text not null,
  photo_url text not null,
  created_at timestamptz not null default now()
);

alter table public.memories enable row level security;

-- Drop first so this script is safe to rerun.
drop policy if exists "Authenticated users can view memories" on public.memories;
drop policy if exists "Users can create own memories" on public.memories;
drop policy if exists "Users can delete own memories" on public.memories;

create policy "Authenticated users can view memories"
on public.memories
for select
to authenticated
using (true);

create policy "Users can create own memories"
on public.memories
for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "Users can delete own memories"
on public.memories
for delete
to authenticated
using (auth.uid() = owner_id);

-- Create the public image bucket (4 MB max, images only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'memories',
  'memories',
  true,
  4194304,
  array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage permissions: users can upload/delete only inside their own UUID folder.
drop policy if exists "Users upload to own memory folder" on storage.objects;
drop policy if exists "Users delete from own memory folder" on storage.objects;

create policy "Users upload to own memory folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'memories'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users delete from own memory folder"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'memories'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- =========================================================
-- COMMENTS SYSTEM
-- =========================================================

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  commenter_name text not null check (char_length(commenter_name) between 1 and 60),
  comment_text text not null check (char_length(comment_text) between 1 and 300),
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;

drop policy if exists "Authenticated users can view comments" on public.comments;
drop policy if exists "Users can create own comments" on public.comments;
drop policy if exists "Users can delete own comments" on public.comments;

create policy "Authenticated users can view comments"
on public.comments
for select
to authenticated
using (true);

create policy "Users can create own comments"
on public.comments
for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "Users can delete own comments"
on public.comments
for delete
to authenticated
using (auth.uid() = owner_id);

create index if not exists comments_memory_id_created_at_idx
on public.comments(memory_id, created_at);

-- =========================================================
-- SOCIAL MEMORY FEATURES
-- Replies, likes and comment editing
-- =========================================================

-- Allow comment replies and editing
alter table public.comments
add column if not exists parent_comment_id uuid references public.comments(id) on delete cascade;

drop policy if exists "Users can update own comments" on public.comments;
create policy "Users can update own comments"
on public.comments
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create index if not exists comments_parent_comment_id_idx
on public.comments(parent_comment_id);

-- One like per user per memory
create table if not exists public.memory_likes (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(memory_id, owner_id)
);

alter table public.memory_likes enable row level security;

drop policy if exists "Authenticated users can view likes" on public.memory_likes;
drop policy if exists "Users can like as themselves" on public.memory_likes;
drop policy if exists "Users can remove own like" on public.memory_likes;

create policy "Authenticated users can view likes"
on public.memory_likes
for select
to authenticated
using (true);

create policy "Users can like as themselves"
on public.memory_likes
for insert
to authenticated
with check (auth.uid() = owner_id);

create policy "Users can remove own like"
on public.memory_likes
for delete
to authenticated
using (auth.uid() = owner_id);

create index if not exists memory_likes_memory_id_idx
on public.memory_likes(memory_id);
