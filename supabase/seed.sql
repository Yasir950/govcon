-- Local/dev seed data, applied by `supabase db reset`.
-- Mirrors the data seeded into the remote project so local development
-- matches production content. Keep this in sync when content changes.

insert into public.companies (id, slug, name, type, location, capabilities, certifications, summary, logo_initials, verified, tags) values
('11111111-1111-1111-1111-111111111111','meridian-federal-builders','Meridian Federal Builders','Prime Contractor','Norfolk, VA','Federal construction, facility modernization, design-build, and construction management','SBA Small Business · ISO 9001','Federal construction and facilities partner delivering renovation, modernization, and mission-critical building programs.','MFB',true, '{Construction,Facilities,"Small Business"}'),
('22222222-2222-2222-2222-222222222222','apex-digital-systems','Apex Digital Systems','Technology Contractor','Arlington, VA','Cybersecurity, cloud migration, systems integration, data analytics, and IT modernization','8(a) · CMMI Level 3','Secure digital transformation and mission technology services for civilian, defense, and intelligence customers.','ADS',true, '{Cybersecurity,Cloud,"8(a)"}'),
('33333333-3333-3333-3333-333333333333','horizon-aerospace-partners','Horizon Aerospace Partners','Engineering Firm','Washington, DC','Aerospace engineering, systems engineering, testing, program management, and technical advisory','Veteran-Owned Small Business · AS9100','Engineering and technical advisory firm supporting complex aerospace, defense, and federal systems programs.','HAP',false, '{Engineering,Aerospace,VOSB}'),
('44444444-4444-4444-4444-444444444444','keystone-facility-solutions','Keystone Facility Solutions','Facilities Contractor','Philadelphia, PA','Janitorial services, facility maintenance, grounds care, quality control, and workforce management','WOSB · Pennsylvania Small Business','Commercial and public-sector facility services company focused on reliable operations, quality, and compliance.','KFS',false, '{Janitorial,Maintenance,WOSB}');

insert into public.opportunities (slug, company_id, title, location, due_date, naics_code, description, tags) values
('facility-renovation-modernization','11111111-1111-1111-1111-111111111111','Facility Renovation & Modernization Services','Norfolk, VA','2026-09-24','236220','Seeking qualified small-business subcontractors for interior renovations, mechanical upgrades, finish work, and facility modernization support.','{Subcontracting,"Small Business","NAICS 236220"}'),
('it-modernization-cybersecurity','22222222-2222-2222-2222-222222222222','IT Modernization and Cybersecurity Support','Nationwide / Remote','2026-09-28','541512','Apex Digital Systems is building a team of cybersecurity, cloud migration, and systems-integration subcontractors for a nationwide IT modernization pursuit.','{"Teaming Partner","8(a) Preferred","Due Sep 28"}'),
('engineering-technical-support','33333333-3333-3333-3333-333333333333','Engineering & Technical Support Services','Washington, DC','2026-10-03','541330','Seeking engineering firms and technical subject-matter experts with aerospace, systems engineering, testing, and federal past-performance experience.','{Subcontracting,"Technical Services","Due Oct 3"}'),
('regional-janitorial-support','44444444-4444-4444-4444-444444444444','Regional Janitorial & Facility Support','Pennsylvania','2026-10-12','561720','Seeking Pennsylvania-based janitorial and facility-maintenance subcontractors with trained personnel, quality-control procedures, and relevant commercial or public-sector experience.','{Subcontracting,"WOSB Preferred","Due Oct 12"}');

insert into public.jobs (slug, company_id, title, location, employment_type, compensation, description, tags) values
('senior-proposal-manager','11111111-1111-1111-1111-111111111111','Senior Proposal Manager','Washington, DC · Hybrid','Full-time','$105,000–$135,000','Lead compliant, persuasive proposal development for federal construction and facilities pursuits, coordinating capture teams, subject-matter experts, schedules, and final production.','{"Full-time",Hybrid,Proposals}'),
('cybersecurity-program-manager','22222222-2222-2222-2222-222222222222','Cybersecurity Program Manager','Remote','Full-time','$125,000–$160,000','Manage cybersecurity delivery teams supporting federal customers, including program performance, risk management, client communications, staffing, and contract requirements.','{"Full-time",Remote,Cybersecurity}'),
('federal-contracts-administrator','33333333-3333-3333-3333-333333333333','Federal Contracts Administrator','Arlington, VA','Full-time','$82,000–$108,000','Support federal contract administration, modifications, compliance tracking, subcontractor documentation, invoicing coordination, and communication with internal program teams.','{"Full-time",Contracts,"Mid-level"}'),
('business-development-specialist','44444444-4444-4444-4444-444444444444','Government Business Development Specialist','Philadelphia, PA','Full-time','$70,000–$90,000 + commission','Identify public-sector growth opportunities, build teaming relationships, maintain the capture pipeline, and support outreach to government and prime-contractor customers.','{"Full-time",Hybrid,"Business Development"}');

-- job_count is not seeded here — it's computed live from a real join count
-- on jobs.category_id (20260918030000_job_category_real_counts.sql),
-- never a hardcoded marketing number.
insert into public.job_categories (title, description, sort_order) values
('Proposal & Capture Management','Proposal writers, capture managers, coordinators, and pricing professionals',1),
('Contracts & Compliance','Contract administrators, compliance analysts, and procurement specialists',2),
('Technical & Program Delivery','Program managers, engineers, cybersecurity experts, and consultants',3);

update public.jobs set category_id = (
  select id from public.job_categories where title = 'Proposal & Capture Management'
) where slug in ('senior-proposal-manager', 'business-development-specialist');
update public.jobs set category_id = (
  select id from public.job_categories where title = 'Contracts & Compliance'
) where slug = 'federal-contracts-administrator';
update public.jobs set category_id = (
  select id from public.job_categories where title = 'Technical & Program Delivery'
) where slug = 'cybersecurity-program-manager';

-- cred_points starts at 0 — there is no real points-earning mechanism yet,
-- so this is not seeded with a fake starting number.
insert into public.members (id, slug, name, role, avatar_url, cred_points, verified, mutual_connections, sort_order) values
('a1111111-1111-1111-1111-111111111111','angela-morris','Angela Morris','Proposal Consultant','/images/avatars/angela-morris.svg',0,true,12,1),
('a2222222-2222-2222-2222-222222222222','marcus-lee','Marcus Lee','Prime Contractor','/images/avatars/marcus-lee.svg',0,true,8,2),
('a3333333-3333-3333-3333-333333333333','nina-patel','Nina Patel','GovCon Advisor','/images/avatars/nina-patel.svg',0,false,6,3),
('a4444444-4444-4444-4444-444444444444','james-davis','James Davis','Cybersecurity SME','/images/avatars/james-davis.svg',0,false,5,4),
('a5555555-5555-5555-5555-555555555555','sophia-williams','Sophia Williams','Supplier Diversity Lead','/images/avatars/sophia-williams.svg',0,false,null,5);

insert into public.events (slug, title, format, starts_at, timezone_label, location, description, cta_label) values
('proposal-strategy-webinar','Winning Federal Contracts: Proposal Strategy','webinar','2026-09-24 13:00:00-04','ET',null,'Learn how to develop compliant, persuasive proposals that connect past performance to evaluation criteria.','Register Free'),
('8a-program-qa','8(a) Business Development Program Q&A','qa','2026-10-02 11:00:00-04','ET',null,'Get practical guidance on eligibility, certification, annual reviews, sole-source awards, and program strategy.','Register Free'),
('prime-sub-exchange','Prime–Sub Teaming Exchange','in_person','2026-10-15 17:30:00-04','ET','Washington, DC','Meet prime contractors, subcontractors, suppliers, and consultants pursuing compatible federal opportunities.','Reserve My Spot');

-- votes and comment_count both start at 0 — real votes are tracked in
-- post_votes (see 20260916000000_community_post_votes.sql) and
-- posts.votes is kept in sync by its trigger; there is no real comment
-- feature yet (see MemberProfilePageClient's honest "Comment threads
-- aren't available yet" empty state), so comment_count is never seeded
-- with a fabricated number either.
insert into public.posts (slug, author_id, category, title, body, votes, comment_count, posted_at) values
('capability-statements','a1111111-1111-1111-1111-111111111111','Proposal Strategy','What makes a subcontracting capability statement actually stand out?','We reviewed 40 capability statements this month. The strongest versions connected specific past performance to the opportunity instead of listing every service the company offers.',0,0, now() - interval '2 hours'),
('pennsylvania-electrical-partner','a2222222-2222-2222-2222-222222222222','Teaming','Looking for a verified electrical subcontractor for a Pennsylvania facilities bid','Prime contractor seeking an experienced electrical partner with documented federal or state past performance. Responses close Friday.',0,0, now() - interval '5 hours'),
('sam-renewal-checklist','a3333333-3333-3333-3333-333333333333','Certifications','SAM.gov renewal checklist: three items people still miss','Confirm points of contact, representations and certifications, and the banking information well before renewal day. Build in time for validation.',0,0, now() - interval '8 hours');

insert into public.testimonials (quote, name, role, initials, verified, sort_order) values
('GovConUnited helped us find a qualified teaming partner for a facilities opportunity in less than a week. The verified profiles made our first conversation much more productive.','Tanya Brooks','President · Brooks Federal Solutions','TB',false,1),
('The opportunity tools cut through the noise. I can save targeted searches, follow relevant agencies, and focus our capture meetings on contracts that actually fit our capabilities.','David Mitchell','Director of Capture Management','DM',true,2),
('It feels like the first professional network designed around how government contractors really work—from capability statements and NAICS codes to teaming and past performance.','Carla Washington','Founder · CW Strategic Consulting','CW',false,3),
('Our company page gives primes a clear view of our certifications, service areas, and past performance. We have already made connections that would have taken months through cold outreach.','Robert Jackson','CEO · Jackson Technical Group','RJ',true,4),
('The community is practical and generous. I have received useful proposal feedback, learned from experienced operators, and built relationships with people I now trust.','Simone Price','Government Contracts Consultant','SP',false,5),
('GovConUnited brings opportunities, events, conversations, and credible partners into one place. It has become part of our weekly business-development routine.','Andre Harris','Managing Partner · Harris Infrastructure','AH',false,6);
