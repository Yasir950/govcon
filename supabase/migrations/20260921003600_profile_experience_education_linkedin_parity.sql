-- LinkedIn-parity fields for the Add Experience / Add Education forms:
-- a real company reference (for the autocomplete + logo display, nullable
-- since a typed-but-unmatched organization name stays plain text in
-- `company`), an "I currently work here" flag (replaces inferring
-- "current" from end_label === 'Present'), and education's missing
-- grade/description/skills fields to match work_experiences' shape.
alter table public.work_experiences
  add column company_id uuid references public.companies(id) on delete set null,
  add column is_current boolean not null default false;

alter table public.education_records
  add column grade text,
  add column description text,
  add column skills text[] not null default '{}';
