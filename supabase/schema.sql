  create extension if not exists "pgcrypto";

  create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    nickname text not null,
    title text,
    avatar_url text,
    appearance_settings jsonb not null default '{"density":"airy","motion":"soft","glass":"luminous"}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  alter table public.profiles
    add column if not exists appearance_settings jsonb not null default '{"density":"airy","motion":"soft","glass":"luminous"}'::jsonb;

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
    coin_reward integer not null check (coin_reward >= 0),
    due_at date,
    status text not null check (status in ('open', 'accepted', 'submitted', 'approved', 'rejected', 'cancelled')),
    rejection_note text,
    is_recurring boolean not null default false,
    submitted_at timestamptz,
    approved_at timestamptz,
    cancelled_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  alter table public.tasks
    add column if not exists is_recurring boolean not null default false;

  alter table public.tasks
    drop constraint if exists tasks_status_check;

  alter table public.tasks
    add constraint tasks_status_check
    check (status in ('open', 'accepted', 'submitted', 'approved', 'rejected', 'cancelled'));

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
    price integer not null check (price >= 0),
    is_product boolean not null default false,
    real_price numeric,
    category text,
    is_active boolean not null default true,
    is_hidden boolean not null default false,
    image_url text,
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

  -- 為求快速驗證，先開放給所有已登入使用者 (Authenticated) 讀寫權限
  -- 正式上線前可依 couple_id 進一步限縮
  create policy "Allow all for authenticated on profiles" on public.profiles for all using (auth.role() = 'authenticated');
  create policy "Allow all for authenticated on couples" on public.couples for all using (auth.role() = 'authenticated');
  create policy "Allow all for authenticated on couple_members" on public.couple_members for all using (auth.role() = 'authenticated');
  create policy "Allow all for authenticated on invite_codes" on public.invite_codes for all using (auth.role() = 'authenticated');
  create policy "Allow all for authenticated on tasks" on public.tasks for all using (auth.role() = 'authenticated');
  create policy "Allow all for authenticated on ledger_entries" on public.ledger_entries for all using (auth.role() = 'authenticated');
  create policy "Allow all for authenticated on shop_items" on public.shop_items for all using (auth.role() = 'authenticated');
  create policy "Allow all for authenticated on redemptions" on public.redemptions for all using (auth.role() = 'authenticated');

  -- 自動建立 Profile 的 Trigger
  create or replace function public.handle_new_user()
  returns trigger as $$
  begin
    insert into public.profiles (id, nickname)
    values (new.id, coalesce(new.raw_user_meta_data->>'nickname', '新用戶'));
    return new;
  end;
  $$ language plpgsql security definer;

  drop trigger if exists on_auth_user_created on auth.users;
  create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

  -- 註銷帳號用的 RPC
  create or replace function public.delete_account()
  returns void as $$
  begin
    -- 刪除 auth.users 內的自己，因為有 on delete cascade，
    -- 其他在 public 的相關紀錄（profiles, couples 等）都會自動刪除
    delete from auth.users where id = auth.uid();
  end;
  $$ language plpgsql security definer;
