-- Resource library backing the public /resources page (guides, templates,
-- checklists, workbooks, and videos for government contractors). Follows
-- the same pattern as companies/opportunities/jobs in 20260915143000:
-- public-read content table, no per-user ownership yet.
-- Depends on set_updated_at() from 20260915000000_init.sql.

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  -- Guide | Template | Checklist | Workbook | Video
  type text not null,
  -- PDF | DOCX | XLSX | PPTX | Video
  format text not null,
  description text not null,
  -- Real external link the resource opens (a genuine public government or
  -- reference resource), not a fake local download — there is no uploaded
  -- file behind these rows.
  url text not null,
  is_pro boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.resources
  for each row execute function public.set_updated_at();

alter table public.resources enable row level security;
create policy "resources are publicly readable"
  on public.resources for select
  to anon, authenticated
  using (true);

-- Seed data: dummy resource-library entries. Descriptions are original
-- copy; each url points to a real, genuinely useful public resource
-- (SBA.gov, SAM.gov, acquisition.gov, GSA) rather than a fabricated
-- download link.
insert into public.resources (slug, title, type, format, description, url, is_pro, sort_order) values
('sba-8a-certification-guide','SBA 8(a) Business Development Certification Guide','Guide','PDF','Step-by-step overview of 8(a) program eligibility, the application process, and required documentation.','https://www.sba.gov/federal-contracting/contracting-assistance-programs/8a-business-development-program',false,1),
('sam-gov-registration-checklist','SAM.gov Registration Checklist','Checklist','PDF','Everything you need on hand before starting a new entity registration or renewal in SAM.gov.','https://sam.gov/content/entity-registration',false,2),
('capability-statement-template','Capability Statement Template','Template','DOCX','A clean one-page capability statement layout covering core competencies, differentiators, and past performance.','https://www.sba.gov/business-guide/grow-your-business/prepare-government-contracting',false,3),
('far-part-15-negotiated-procurement-guide','Understanding FAR Part 15: Contracting by Negotiation','Guide','PDF','A practical walkthrough of the negotiated-procurement process, from solicitation to award.','https://www.acquisition.gov/far/part-15',false,4),
('teaming-agreement-workbook','Teaming Agreement Planning Workbook','Workbook','XLSX','A working template for mapping workshare, pricing, and responsibilities before you sign a teaming agreement.','https://www.gsa.gov/small-business/what-gsa-can-do-for-you/help-for-small-businesses/teaming-and-joint-ventures',true,5),
('proposal-compliance-matrix-template','Proposal Compliance Matrix Template','Template','XLSX','Track every solicitation requirement against your response so nothing gets missed before submission.','https://www.sba.gov/business-guide/grow-your-business/prepare-government-contracting',true,6),
('wosb-certification-checklist','Woman-Owned Small Business (WOSB) Certification Checklist','Checklist','PDF','Confirm eligibility and gather the documentation needed for WOSB and EDWOSB certification.','https://www.sba.gov/federal-contracting/contracting-assistance-programs/women-owned-small-business-federal-contracting-program',false,7),
('gsa-schedule-overview-video','What Is a GSA Schedule? (Official SBA Overview)','Video','Video','A short video primer on GSA Multiple Award Schedules and how contractors get on one.','https://www.youtube.com/watch?v=2x2gv9wo6nA',false,8),
('past-performance-narrative-guide','Writing Strong Past Performance Narratives','Guide','PDF','Guidance on turning delivered contract work into evaluator-ready past performance write-ups.','https://www.acquisition.gov/far/part-15',true,9),
('small-business-subcontracting-plan-template','Small Business Subcontracting Plan Template','Template','DOCX','A starting template for the subcontracting plan required on qualifying prime contracts.','https://www.sba.gov/federal-contracting/contracting-assistance-programs/subcontracting-assistance-programs',false,10);
