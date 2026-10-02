-- Not every real federal notice has a response deadline (Sources Sought,
-- Special Notice, and award notices commonly omit one) -- response_deadline
-- was NOT NULL only because every prior admin-authored row always had one.
alter table public.opportunities alter column response_deadline drop not null;
