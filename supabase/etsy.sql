-- Conexión con Etsy. Correr una sola vez en Supabase → SQL Editor.
--
-- Estas dos tablas NO tienen políticas: con RLS activado y sin políticas,
-- nadie las puede leer desde el navegador. Solo las toca el servidor
-- (las funciones de Vercel, con la service role key).

create table if not exists public.etsy_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  etsy_user_id text,
  shop_id text,
  shop_name text,
  scopes text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.etsy_accounts enable row level security;
revoke all on public.etsy_accounts from anon, authenticated;

-- Guarda el código de verificación mientras el usuario está en la pantalla de Etsy
create table if not exists public.etsy_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  code_verifier text not null,
  created_at timestamptz not null default now()
);

alter table public.etsy_oauth_states enable row level security;
revoke all on public.etsy_oauth_states from anon, authenticated;
