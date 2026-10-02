-- Company-posted (manual) opportunities never set posted_date, so the detail
-- page showed "Posted —". Default it to the insert date and backfill existing
-- rows from created_at. SAM.gov rows keep whatever the sync supplies.
alter table public.opportunities
  alter column posted_date set default current_date;

update public.opportunities
set posted_date = created_at::date
where posted_date is null;
