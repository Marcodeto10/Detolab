-- Detolab: galería online por usuario + registro de uso.
-- Se corre en Supabase → SQL Editor. Se puede volver a correr sin romper nada.
--
-- Seguridad: todas las tablas tienen RLS y cada usuario solo ve y toca sus filas.
-- Las imágenes van a un bucket privado, en una carpeta con el id del usuario.

-- Carpetas propias (las de sistema "all", "mockups" y "products" no se guardan)
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);

-- Imágenes generadas: el archivo vive en Storage, acá va la ficha
create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id text not null default 'all',
  prompt text not null default '',
  tool text,
  model text,
  path text not null,
  thumb_path text,
  bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists images_user_created_idx on public.images (user_id, created_at desc);

-- Registro de uso: una fila por pedido a Gemini
create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tool text not null,
  model text not null,
  image_size text,
  aspect_ratio text,
  status text not null check (status in ('success', 'error', 'cancelled')),
  images integer not null default 0,
  prompt_tokens integer,
  output_tokens integer,
  total_tokens integer,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists usage_user_created_idx on public.usage_events (user_id, created_at desc);

-- Permisos explícitos: el proyecto no expone tablas nuevas automáticamente.
-- Solo usuarios logueados; los visitantes anónimos no ven nada.
revoke all on public.folders, public.images, public.usage_events from anon;
grant select, insert, update, delete on public.folders to authenticated;
grant select, insert, update, delete on public.images to authenticated;
grant select, insert on public.usage_events to authenticated;

alter table public.folders enable row level security;
alter table public.images enable row level security;
alter table public.usage_events enable row level security;

drop policy if exists "folders: own rows" on public.folders;
create policy "folders: own rows" on public.folders
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "images: own rows" on public.images;
create policy "images: own rows" on public.images
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "usage: read own" on public.usage_events;
create policy "usage: read own" on public.usage_events
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "usage: insert own" on public.usage_events;
create policy "usage: insert own" on public.usage_events
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Storage: bucket privado "gallery", cada usuario solo en su carpeta <user_id>/...
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', false)
on conflict (id) do nothing;

drop policy if exists "gallery: read own" on storage.objects;
create policy "gallery: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'gallery' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "gallery: upload own" on storage.objects;
create policy "gallery: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gallery' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "gallery: update own" on storage.objects;
create policy "gallery: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'gallery' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "gallery: delete own" on storage.objects;
create policy "gallery: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'gallery' and (storage.foldername(name))[1] = (select auth.uid())::text);
