-- Two new short free-text fields on a company's own profile, distinct from
-- the existing contract_vehicles array (a comma-tag list further down the
-- Overview tab) -- these are a single sentence each, character-capped to
-- keep them scannable in a compact card.
alter table public.companies
  add column contract_vehicles_note text,
  add column core_specialties text;

alter table public.companies
  add constraint contract_vehicles_note_length check (char_length(contract_vehicles_note) <= 250),
  add constraint core_specialties_length check (char_length(core_specialties) <= 150);
