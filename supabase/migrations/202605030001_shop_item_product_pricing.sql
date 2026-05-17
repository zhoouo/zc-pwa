-- 商品定價模式：可記錄現實價格與是否為商品
-- 注意：price 仍為最終金幣價格（整數），real_price 僅作為計算依據與顯示用

alter table public.shop_items
  add column if not exists is_product boolean not null default false;

alter table public.shop_items
  add column if not exists real_price numeric;

