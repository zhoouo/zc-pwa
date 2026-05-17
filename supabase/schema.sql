  create extension if not exists "pgcrypto";

  create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    nickname text not null,
    title text,
    avatar_url text,
    appearance_settings jsonb not null default '{"density":"airy","motion":"soft","glass":"luminous","notifications":{"enabled":false,"events":{"partnerTaskAssigned":true,"partnerTaskProgress":true,"partnerTaskReviewed":true,"partnerShopUpdated":true,"partnerRedemption":true,"selfTaskCreated":true,"selfTaskProgress":true,"selfTaskReviewed":true,"selfShopUpdated":true,"selfRedemption":true}}}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );


  create table if not exists public.couples (
    id uuid primary key default gen_random_uuid(),
    custom_tags text[] default array[]::text[],
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
    reward_base integer not null default 15,
    rating_time smallint,
    rating_difficulty smallint,
    rating_avoidance smallint,
    reward_multiplier numeric,
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

  -- Profiles: 允許讀取所有人的基本資料（否則看不到夥伴），僅限本人修改
  drop policy if exists "Profiles are viewable by authenticated users" on public.profiles;
  drop policy if exists "Users can update own profile" on public.profiles;
  drop policy if exists "Users can manage own profile" on public.profiles;
  
  create policy "Profiles are viewable by authenticated users" on public.profiles
    for select using (auth.role() = 'authenticated');
  create policy "Users can update own profile" on public.profiles
    for update using (auth.uid() = id);

  -- Couples: 僅限成員存取
  drop policy if exists "Members can view/update couple space" on public.couples;
  drop policy if exists "Allow select for members on couples" on public.couples;
  drop policy if exists "Allow update for members on couples" on public.couples;

  create policy "Allow select for members on couples" on public.couples 
    for select using (exists (select 1 from public.couple_members where couple_id = public.couples.id and user_id = auth.uid()));
  create policy "Allow update for members on couples" on public.couples 
    for update using (exists (select 1 from public.couple_members where couple_id = public.couples.id and user_id = auth.uid()));

  -- Couple Members: 允許讀取（為了抓取夥伴資訊），僅限本人管理
  drop policy if exists "Couple members are viewable by authenticated users" on public.couple_members;
  drop policy if exists "Users can manage own membership" on public.couple_members;
  drop policy if exists "Members can view/manage membership" on public.couple_members;
  drop policy if exists "Public select on couple_members" on public.couple_members;

  create policy "Public select on couple_members" on public.couple_members
    for select using (auth.role() = 'authenticated');
  create policy "Users can manage own membership" on public.couple_members
    for all using (user_id = auth.uid());

  -- Invite Codes: 建立者可管理
  drop policy if exists "Creators can manage invite codes" on public.invite_codes;
  create policy "Creators can manage invite codes" on public.invite_codes
    for all using (created_by = auth.uid());

  -- Tasks, Ledger, Shop, Redemptions: 空間成員共用
  drop policy if exists "Members can manage tasks" on public.tasks;
  create policy "Members can manage tasks" on public.tasks 
    for all using (exists (select 1 from public.couple_members cm where cm.couple_id = public.tasks.couple_id and cm.user_id = auth.uid()));

  drop policy if exists "Members can manage ledger entries" on public.ledger_entries;
  create policy "Members can manage ledger entries" on public.ledger_entries
    for all using (exists (select 1 from public.couple_members cm where cm.couple_id = public.ledger_entries.couple_id and cm.user_id = auth.uid()));

  drop policy if exists "Members can manage shop items" on public.shop_items;
  create policy "Members can manage shop items" on public.shop_items
    for all using (exists (select 1 from public.couple_members cm where cm.couple_id = public.shop_items.couple_id and cm.user_id = auth.uid()));

  drop policy if exists "Members can manage redemptions" on public.redemptions;
  create policy "Members can manage redemptions" on public.redemptions
    for all using (exists (select 1 from public.couple_members cm where cm.couple_id = public.redemptions.couple_id and cm.user_id = auth.uid()));

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
