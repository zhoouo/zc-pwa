create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  title text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.couple_members (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text default 'member',
  joined_at timestamptz not null default now(),
  unique (couple_id, user_id)
);

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  code text not null unique,
  expires_at timestamptz,
  used_at timestamptz
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  creator_id uuid not null references auth.users (id) on delete cascade,
  assignee_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  coin_reward integer not null check (coin_reward > 0),
  due_at date,
  status text not null check (status in ('open', 'submitted', 'approved', 'rejected', 'cancelled')),
  rejection_note text,
  submitted_at timestamptz,
  approved_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_type text not null check (entry_type in ('task_reward', 'shop_redeem', 'manual_adjustment')),
  amount integer not null,
  source_type text not null check (source_type in ('task', 'redemption', 'manual')),
  source_id uuid,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  creator_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  price integer not null check (price > 0),
  category text,
  is_active boolean not null default true,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  shop_item_id uuid not null references public.shop_items (id) on delete cascade,
  redeemer_id uuid not null references auth.users (id) on delete cascade,
  creator_id uuid not null references auth.users (id) on delete cascade,
  price_snapshot integer not null,
  status text not null check (status in ('redeemed', 'in_progress', 'fulfilled', 'cancelled')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.invite_codes enable row level security;
alter table public.tasks enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.shop_items enable row level security;
alter table public.redemptions enable row level security;

create policy "profiles can read own row"
on public.profiles
for select
using (auth.uid() = id);

create policy "profiles can update own row"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);
