-- 任務評分與獎勵快照
-- 在「送出批准」時由執行者填寫三項 1-5 分，並計算 coin_reward（最終金幣）

alter table public.tasks
  add column if not exists reward_base integer not null default 15;

alter table public.tasks
  add column if not exists rating_time smallint;

alter table public.tasks
  add column if not exists rating_difficulty smallint;

alter table public.tasks
  add column if not exists rating_avoidance smallint;

alter table public.tasks
  add column if not exists reward_multiplier numeric;

