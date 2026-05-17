alter table public.profiles
  alter column appearance_settings set default '{"density":"airy","motion":"soft","glass":"luminous","notifications":{"enabled":false,"events":{"partnerTaskAssigned":true,"partnerTaskProgress":true,"partnerTaskReviewed":true,"partnerShopUpdated":true,"partnerRedemption":true,"selfTaskCreated":true,"selfTaskProgress":true,"selfTaskReviewed":true,"selfShopUpdated":true,"selfRedemption":true}}}'::jsonb;

update public.profiles
set appearance_settings = appearance_settings || '{"notifications":{"enabled":false,"events":{"partnerTaskAssigned":true,"partnerTaskProgress":true,"partnerTaskReviewed":true,"partnerShopUpdated":true,"partnerRedemption":true,"selfTaskCreated":true,"selfTaskProgress":true,"selfTaskReviewed":true,"selfShopUpdated":true,"selfRedemption":true}}}'::jsonb
where not (appearance_settings ? 'notifications');
