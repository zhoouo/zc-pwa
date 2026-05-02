alter table public.profiles
  add column if not exists appearance_settings jsonb not null default '{"density":"airy","motion":"soft","glass":"luminous"}'::jsonb;

alter table public.tasks
  add column if not exists is_recurring boolean not null default false;

alter table public.tasks
  drop constraint if exists tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check
  check (status in ('open', 'accepted', 'submitted', 'approved', 'rejected', 'cancelled'));
