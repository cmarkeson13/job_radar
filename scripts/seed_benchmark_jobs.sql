-- Seed TEST Benchmarks company
insert into companies (id, name, slug, platform_key, careers_url, created_at, updated_at)
values (
  '11111111-1111-4111-b111-111111111111',
  'TEST Benchmarks',
  'test-benchmarks',
  'generic_html',
  'https://example.com/test-benchmarks',
  now(),
  now()
)
on conflict (id) do nothing;

delete from jobs
where job_uid like 'bench_%';

insert into jobs (
  id,
  job_uid,
  company_id,
  title,
  team,
  location_raw,
  remote_flag,
  job_url,
  source_platform,
  posted_at,
  description_snippet,
  full_description,
  job_profile,
  seniority_label,
  function_label,
  status,
  closed_flag,
  created_at,
  updated_at
)
select
  gen_random_uuid(),
  jd.job_uid,
  '11111111-1111-4111-b111-111111111111',
  jd.title,
  jd.team,
  jd.location_raw,
  jd.remote_flag,
  jd.job_url,
  'generic_html',
  now(),
  jd.description_snippet,
  jd.full_description,
  jd.job_profile_text::jsonb,
  case lower(jd.seniority_label)
    when 'junior' then 'junior'
    when 'entry' then 'junior'
    when 'associate' then 'junior'
    when 'mid' then 'mid'
    when 'mid-level' then 'mid'
    when 'midlevel' then 'mid'
    when 'senior' then 'senior'
    when 'lead' then 'lead'
    when 'director' then 'lead'
    when 'principal' then 'lead'
    else 'senior'
  end,
  case
    when jd.function_label in ('product','growth','ops','engineering','design','other') then jd.function_label
    when jd.function_label in ('marketing','lifecycle') then 'growth'
    when jd.function_label in ('operations','manufacturing','industrial planning') then 'ops'
    when jd.function_label in ('strategy','analytics','research','defense','regulatory') then 'product'
    when jd.function_label in ('systems','core systems') then 'engineering'
    else 'other'
  end,
  'New',
  false,
  now(),
  now()
from (
  values
  -- 90-100
  (
    'bench_100a',
    'Senior Experimentation Product Manager',
    'Growth',
    'Remote - United States',
    true,
    'https://example.com/test/bench_100a',
    'Own experimentation strategy across email and lifecycle journeys.',
    $$Lead cross channel experiments, build lifecycle roadmaps, and partner with design, engineering, and analytics to increase conversion and retention for a consumer subscription product.$$,
    'senior',
    'product',
    $${
      "job_title":"Senior Experimentation Product Manager",
      "seniority_level":"senior",
      "role_type":"Product Manager",
      "required_skills":["experimentation","lifecycle_management","roadmap_ownership","cross_functional_leadership"],
      "nice_to_have_skills":["sql","lookml","segmentation"],
      "tools_technologies":["figma","amplitude","braze"],
      "industries":["saas","consumer"],
      "location":{"type":"remote","cities":["Remote - United States"],"time_zones":["ET","CT","PT"]},
      "years_experience_min":4,
      "years_experience_max":6,
      "company_size":"scaleup",
      "work_authorization_required":["US work authorization"],
      "summary":"Drive experimentation strategy across lifecycle journeys for a consumer subscription product"
    }$$
  ),
  (
    'bench_100b',
    'Growth PM – Email & Funnel Optimization',
    'Growth',
    'New York, NY',
    false,
    'https://example.com/test/bench_100b',
    'Run experimentation roadmap across lifecycle touchpoints.',
    $$Own the growth roadmap across email, push, and onsite flows, partnering with lifecycle marketing, design, and analytics to lift conversion and retention for a commerce marketplace.$$,
    'senior',
    'product',
    $${
      "job_title":"Growth PM – Email & Funnel Optimization",
      "seniority_level":"senior",
      "role_type":"Product Manager",
      "required_skills":["growth_strategy","experimentation","data_insights","stakeholder_management"],
      "nice_to_have_skills":["sql","segment","retention_strategy"],
      "tools_technologies":["figma","braze","google_analytics"],
      "industries":["marketplace","commerce"],
      "location":{"type":"hybrid","cities":["New York, NY"],"time_zones":["ET"]},
      "years_experience_min":4,
      "years_experience_max":6,
      "company_size":"scaleup",
      "work_authorization_required":["US work authorization"],
      "summary":"Lead lifecycle funnel optimization and experimentation for a commerce marketplace"
    }$$
  ),
  -- 80-89
  (
    'bench_90a',
    'Product Analyst / PM Hybrid',
    'Product',
    'Remote - United States',
    true,
    'https://example.com/test/bench_90a',
    'Blend analytics and product ownership for SMB commerce suite.',
    $$Translate analytics insights into roadmap bets, partner with marketing on experiments, and ensure reporting clarity for an SMB commerce platform.$$,
    'mid',
    'product',
    $${
      "job_title":"Product Analyst / PM Hybrid",
      "seniority_level":"mid",
      "role_type":"Product Manager",
      "required_skills":["analytics_storytelling","experimentation","roadmap_planning","stakeholder_management"],
      "nice_to_have_skills":["sql","mode","crm_integration"],
      "tools_technologies":["figma","tableau","salesforce"],
      "industries":["commerce","smb_saas"],
      "location":{"type":"remote","cities":["Remote - United States"],"time_zones":["ET","CT"]},
      "years_experience_min":3,
      "years_experience_max":5,
      "company_size":"scaleup",
      "work_authorization_required":["US work authorization"],
      "summary":"Connect analytics to roadmap execution for an SMB commerce suite"
    }$$
  ),
  (
    'bench_90b',
    'Lifecycle Product Manager',
    'Lifecycle',
    'Chicago, IL',
    false,
    'https://example.com/test/bench_90b',
    'Own lifecycle messaging and experimentation for consumer subscription service.',
    $$Plan lifecycle campaigns across email and push, collaborate with design and analytics, and drive activation plus retention for a consumer subscription business.$$,
    'mid',
    'product',
    $${
      "job_title":"Lifecycle Product Manager",
      "seniority_level":"mid",
      "role_type":"Product Manager",
      "required_skills":["lifecycle_management","experimentation","campaign_management","stakeholder_management"],
      "nice_to_have_skills":["sql","segmentation","braze"],
      "tools_technologies":["figma","braze","amplitude"],
      "industries":["consumer","subscription"],
      "location":{"type":"hybrid","cities":["Chicago, IL"],"time_zones":["CT"]},
      "years_experience_min":3,
      "years_experience_max":5,
      "company_size":"scaleup",
      "work_authorization_required":["US work authorization"],
      "summary":"Manage lifecycle journeys for a consumer subscription company"
    }$$
  ),
  -- 70-79
  (
    'bench_80a',
    'Customer Insights Product Strategist',
    'Strategy',
    'Remote - United States',
    true,
    'https://example.com/test/bench_80a',
    'Synthesize research and quantitative signals for SMB invoicing roadmap.',
    $$Partner with marketing and design to collect research, analyze adoption, and translate findings into prioritization guidance for an SMB invoicing platform.$$,
    'mid',
    'strategy',
    $${
      "job_title":"Customer Insights Product Strategist",
      "seniority_level":"mid",
      "role_type":"Product Strategist",
      "required_skills":["customer_research","data_insights","storytelling","cross_functional_alignment"],
      "nice_to_have_skills":["surveys","journey_mapping","sql_basics"],
      "tools_technologies":["qualtrics","tableau"],
      "industries":["smb_saas"],
      "location":{"type":"remote","cities":["Remote - United States"],"time_zones":["ET","CT"]},
      "years_experience_min":3,
      "years_experience_max":5,
      "company_size":"scaleup",
      "work_authorization_required":["US work authorization"],
      "summary":"Translate research signals into roadmap decisions for an SMB invoicing suite"
    }$$
  ),
  (
    'bench_80b',
    'Marketing Tech Product Lead',
    'Marketing Operations',
    'Atlanta, GA',
    false,
    'https://example.com/test/bench_80b',
    'Own martech stack integrations for B2B communications platform.',
    $$Collaborate with marketing ops, engineering, and analytics to integrate tools, automate campaigns, and improve dashboards for a B2B communications platform.$$,
    'mid',
    'product',
    $${
      "job_title":"Marketing Tech Product Lead",
      "seniority_level":"mid",
      "role_type":"Product Manager",
      "required_skills":["marketing_operations","automation","roadmap_planning","stakeholder_management"],
      "nice_to_have_skills":["sql","zapier","etl_processes"],
      "tools_technologies":["hubspot","marketo","tableau"],
      "industries":["b2b_saas"],
      "location":{"type":"hybrid","cities":["Atlanta, GA"],"time_zones":["ET"]},
      "years_experience_min":3,
      "years_experience_max":5,
      "company_size":"enterprise",
      "work_authorization_required":["US work authorization"],
      "summary":"Lead martech tooling and automation for a B2B communications company"
    }$$
  ),
  -- 60-69
  (
    'bench_70a',
    'Associate Product Manager – Analytics Platform',
    'Product',
    'Dallas, TX',
    false,
    'https://example.com/test/bench_70a',
    'Support senior PMs with requirements, QA, and dashboard reviews.',
    $$Coordinate backlog grooming, testing, and stakeholder updates for the internal analytics platform powering enterprise reporting.$$,
    'junior',
    'product',
    $${
      "job_title":"Associate Product Manager – Analytics Platform",
      "seniority_level":"junior",
      "role_type":"Product Manager",
      "required_skills":["requirements_gathering","analytics_coordination","communication"],
      "nice_to_have_skills":["sql","dashboarding","jira"],
      "tools_technologies":["tableau","jira"],
      "industries":["enterprise"],
      "location":{"type":"onsite","cities":["Dallas, TX"],"time_zones":["CT"]},
      "years_experience_min":2,
      "years_experience_max":3,
      "company_size":"enterprise",
      "work_authorization_required":["US work authorization"],
      "summary":"Coordinate enhancements to an internal analytics platform"
    }$$
  ),
  (
    'bench_70b',
    'Product Marketing Manager – Enterprise SaaS',
    'Marketing',
    'Remote - United States',
    true,
    'https://example.com/test/bench_70b',
    'Drive positioning, launches, and sales enablement for workflow suite.',
    $$Create messaging, run launch plans, and partner with sales plus customer success to enable an enterprise workflow platform.$$,
    'mid',
    'marketing',
    $${
      "job_title":"Product Marketing Manager – Enterprise SaaS",
      "seniority_level":"mid",
      "role_type":"Product Marketing",
      "required_skills":["positioning","sales_enablement","cross_functional_alignment"],
      "nice_to_have_skills":["analytics_storytelling","campaign_management"],
      "tools_technologies":["salesforce","hubspot"],
      "industries":["enterprise","workflow"],
      "location":{"type":"remote","cities":["Remote - United States"],"time_zones":["ET","CT"]},
      "years_experience_min":3,
      "years_experience_max":4,
      "company_size":"enterprise",
      "work_authorization_required":["US work authorization"],
      "summary":"Own go to market and enablement motions for an enterprise workflow suite"
    }$$
  ),
  -- 50-59
  (
    'bench_60a',
    'BI Analyst – SQL Heavy',
    'Analytics',
    'Salt Lake City, UT',
    false,
    'https://example.com/test/bench_60a',
    'Write SQL, maintain dashboards, and support finance analytics.',
    $$Support finance stakeholders with SQL development, Looker models, and dashboard maintenance for a fintech reporting stack.$$,
    'mid',
    'analytics',
    $${
      "job_title":"BI Analyst – SQL Heavy",
      "seniority_level":"mid",
      "role_type":"Business Intelligence",
      "required_skills":["sql","financial_reporting","dashboard_development"],
      "nice_to_have_skills":["python","product_metrics"],
      "tools_technologies":["sql","looker","dbt"],
      "industries":["fintech"],
      "location":{"type":"onsite","cities":["Salt Lake City, UT"],"time_zones":["MT"]},
      "years_experience_min":4,
      "years_experience_max":5,
      "company_size":"enterprise",
      "work_authorization_required":["US work authorization"],
      "summary":"Handle SQL development and dashboards for finance reporting"
    }$$
  ),
  (
    'bench_60b',
    'Product Specialist – Payments Compliance',
    'Operations',
    'Denver, CO',
    false,
    'https://example.com/test/bench_60b',
    'Translate compliance requirements into product backlog items.',
    $$Partner with compliance and banking teams to interpret regulations, capture requirements, and coordinate delivery for core payments systems.$$,
    'mid',
    'operations',
    $${
      "job_title":"Product Specialist – Payments Compliance",
      "seniority_level":"mid",
      "role_type":"Product Specialist",
      "required_skills":["regulatory_translation","stakeholder_management"],
      "nice_to_have_skills":["product_documentation","sql_basics"],
      "tools_technologies":["jira","confluence"],
      "industries":["fintech","compliance"],
      "location":{"type":"onsite","cities":["Denver, CO"],"time_zones":["MT"]},
      "years_experience_min":3,
      "years_experience_max":5,
      "company_size":"enterprise",
      "work_authorization_required":["US work authorization"],
      "summary":"Act as liaison between compliance and core banking product teams"
    }$$
  ),
  -- 40-49
  (
    'bench_50a',
    'Hardware Product Coordinator',
    'Operations',
    'San Jose, CA',
    false,
    'https://example.com/test/bench_50a',
    'Coordinate suppliers, timelines, and logistics for hardware accessories.',
    $$Manage vendor communication, schedule reviews, and physical logistics for a hardware accessories program.$$,
    'mid',
    'operations',
    $${
      "job_title":"Hardware Product Coordinator",
      "seniority_level":"mid",
      "role_type":"Product Coordinator",
      "required_skills":["supply_chain_coordination","project_management"],
      "nice_to_have_skills":["hardware_manufacturing"],
      "tools_technologies":["microsoft_project"],
      "industries":["hardware"],
      "location":{"type":"onsite","cities":["San Jose, CA"],"time_zones":["PT"]},
      "years_experience_min":3,
      "years_experience_max":4,
      "company_size":"enterprise",
      "work_authorization_required":["US work authorization"],
      "summary":"Oversee hardware accessory timelines and supplier coordination"
    }$$
  ),
  (
    'bench_50b',
    'Field Sales Product Enablement',
    'Sales Enablement',
    'Houston, TX',
    false,
    'https://example.com/test/bench_50b',
    'Create enablement materials and onsite trainings for industrial field reps.',
    $$Build product demos, deliver onsite training, and manage collateral for field reps selling industrial equipment.$$,
    'mid',
    'operations',
    $${
      "job_title":"Field Sales Product Enablement",
      "seniority_level":"mid",
      "role_type":"Product Enablement",
      "required_skills":["sales_training","field_operations"],
      "nice_to_have_skills":["crm_management"],
      "tools_technologies":["salesforce"],
      "industries":["industrial"],
      "location":{"type":"onsite","cities":["Houston, TX"],"time_zones":["CT"]},
      "years_experience_min":4,
      "years_experience_max":6,
      "company_size":"enterprise",
      "work_authorization_required":["US work authorization"],
      "summary":"Deliver enablement programs for industrial field sales teams"
    }$$
  ),
  -- 30-39
  (
    'bench_40a',
    'Manufacturing Operations Product Manager',
    'Manufacturing',
    'Detroit, MI',
    false,
    'https://example.com/test/bench_40a',
    'Lead MES roadmap for manufacturing plants.',
    $$Design and deliver manufacturing execution capabilities, partner with plant leadership, and optimize production workflows.$$,
    'senior',
    'product',
    $${
      "job_title":"Manufacturing Operations Product Manager",
      "seniority_level":"senior",
      "role_type":"Product Manager",
      "required_skills":["manufacturing_systems","plant_operations"],
      "nice_to_have_skills":["lean_six_sigma"],
      "tools_technologies":["sap","mes"],
      "industries":["manufacturing"],
      "location":{"type":"onsite","cities":["Detroit, MI"],"time_zones":["ET"]},
      "years_experience_min":5,
      "years_experience_max":7,
      "company_size":"enterprise",
      "work_authorization_required":["US work authorization"],
      "summary":"Own MES roadmap for large scale manufacturing operations"
    }$$
  ),
  (
    'bench_40b',
    'Clinical Research Product Analyst',
    'Research',
    'Boston, MA',
    false,
    'https://example.com/test/bench_40b',
    'Analyze clinical workflows and support healthcare product requirements.',
    $$Document research workflows, interpret regulatory constraints, and support product teams building clinical trial software.$$,
    'mid',
    'product',
    $${
      "job_title":"Clinical Research Product Analyst",
      "seniority_level":"mid",
      "role_type":"Product Analyst",
      "required_skills":["clinical_research","regulatory_knowledge"],
      "nice_to_have_skills":["gcp","hipaa_compliance"],
      "tools_technologies":["microsoft_excel"],
      "industries":["healthcare"],
      "location":{"type":"hybrid","cities":["Boston, MA"],"time_zones":["ET"]},
      "years_experience_min":4,
      "years_experience_max":6,
      "company_size":"enterprise",
      "work_authorization_required":["US work authorization"],
      "summary":"Support healthcare product requirements informed by clinical research"
    }$$
  ),
  -- 20-29
  (
    'bench_30a',
    'Aerospace Systems Product Lead',
    'Systems',
    'Seattle, WA',
    false,
    'https://example.com/test/bench_30a',
    'Plan avionics roadmaps for aerospace programs.',
    $$Guide avionics product strategy, coordinate with aerospace clients, and align deliverables with government program milestones.$$,
    'director',
    'product',
    $${
      "job_title":"Aerospace Systems Product Lead",
      "seniority_level":"director",
      "role_type":"Product Manager",
      "required_skills":["aerospace_engineering","dod_programs"],
      "nice_to_have_skills":["system_safety"],
      "tools_technologies":["matlab"],
      "industries":["aerospace"],
      "location":{"type":"onsite","cities":["Seattle, WA"],"time_zones":["PT"]},
      "years_experience_min":7,
      "years_experience_max":9,
      "company_size":"enterprise",
      "work_authorization_required":["US citizen"],
      "summary":"Drive avionics product planning for aerospace customers"
    }$$
  ),
  (
    'bench_30b',
    'Oil & Gas Digital Product Manager',
    'Operations',
    'Midland, TX',
    false,
    'https://example.com/test/bench_30b',
    'Lead digital products for upstream oil and gas operations.',
    $$Deliver drilling optimization and SCADA integrations, working closely with field engineers and control room teams.$$,
    'senior',
    'product',
    $${
      "job_title":"Oil & Gas Digital Product Manager",
      "seniority_level":"senior",
      "role_type":"Product Manager",
      "required_skills":["oil_gas_operations","scada_systems"],
      "nice_to_have_skills":["reservoir_engineering"],
      "tools_technologies":["osisoft_pi"],
      "industries":["oil_gas"],
      "location":{"type":"onsite","cities":["Midland, TX"],"time_zones":["CT"]},
      "years_experience_min":6,
      "years_experience_max":8,
      "company_size":"enterprise",
      "work_authorization_required":["US work authorization"],
      "summary":"Build digital tools for upstream drilling operations"
    }$$
  ),
  -- 10-19
  (
    'bench_20a',
    'Government Defense Product Officer',
    'Defense',
    'Arlington, VA',
    false,
    'https://example.com/test/bench_20a',
    'Manage secure communications product line for defense programs.',
    $$Oversee secure communications requirements, coordinate with government stakeholders, and support TS SCI programs.$$,
    'senior',
    'product',
    $${
      "job_title":"Government Defense Product Officer",
      "seniority_level":"senior",
      "role_type":"Product Manager",
      "required_skills":["defense_communications","security_clearance"],
      "nice_to_have_skills":["satcom"],
      "tools_technologies":["classified_systems"],
      "industries":["defense"],
      "location":{"type":"onsite","cities":["Arlington, VA"],"time_zones":["ET"]},
      "years_experience_min":8,
      "years_experience_max":10,
      "company_size":"enterprise",
      "work_authorization_required":["US citizen TS/SCI"],
      "summary":"Lead secure communications products for defense customers"
    }$$
  ),
  (
    'bench_20b',
    'Heavy Industrial Product Planner',
    'Industrial Planning',
    'Peoria, IL',
    false,
    'https://example.com/test/bench_20b',
    'Plan long horizon product roadmaps for heavy equipment lines.',
    $$Coordinate multi year equipment planning, align supply chain, and manage logistics for heavy industrial machinery.$$,
    'senior',
    'product',
    $${
      "job_title":"Heavy Industrial Product Planner",
      "seniority_level":"senior",
      "role_type":"Product Planner",
      "required_skills":["industrial_engineering","supply_chain_planning"],
      "nice_to_have_skills":["materials_management"],
      "tools_technologies":["sap"],
      "industries":["industrial"],
      "location":{"type":"onsite","cities":["Peoria, IL"],"time_zones":["CT"]},
      "years_experience_min":7,
      "years_experience_max":9,
      "company_size":"enterprise",
      "work_authorization_required":["US work authorization"],
      "summary":"Plan heavy equipment product lines with supply chain alignment"
    }$$
  ),
  -- 0-9
  (
    'bench_10a',
    'Nuclear Regulatory Product Manager',
    'Regulatory',
    'Knoxville, TN',
    false,
    'https://example.com/test/bench_10a',
    'Drive nuclear regulatory software requirements.',
    $$Manage requirements for nuclear regulatory software, ensure NRC compliance, and partner with reactor operators.$$,
    'senior',
    'product',
    $${
      "job_title":"Nuclear Regulatory Product Manager",
      "seniority_level":"senior",
      "role_type":"Product Manager",
      "required_skills":["nuclear_engineering","nrc_regulations"],
      "nice_to_have_skills":["reactor_operations"],
      "tools_technologies":["ansys"],
      "industries":["nuclear"],
      "location":{"type":"onsite","cities":["Knoxville, TN"],"time_zones":["ET"]},
      "years_experience_min":8,
      "years_experience_max":10,
      "company_size":"enterprise",
      "work_authorization_required":["US citizen"],
      "summary":"Lead regulatory software for nuclear plant operators"
    }$$
  ),
  (
    'bench_10b',
    'On-Prem Banking Core Architect',
    'Core Systems',
    'Charlotte, NC',
    false,
    'https://example.com/test/bench_10b',
    'Architect on prem banking core systems with Fed compliance.',
    $$Modernize core banking platforms, manage COBOL and mainframe workloads, and ensure compliance with Fed regulations for regional banks.$$,
    'director',
    'product',
    $${
      "job_title":"On-Prem Banking Core Architect",
      "seniority_level":"director",
      "role_type":"Product Architect",
      "required_skills":["cobol","core_banking","fed_compliance"],
      "nice_to_have_skills":["mainframe_modernization"],
      "tools_technologies":["cobol","db2"],
      "industries":["financial_services"],
      "location":{"type":"onsite","cities":["Charlotte, NC"],"time_zones":["ET"]},
      "years_experience_min":10,
      "years_experience_max":12,
      "company_size":"enterprise",
      "work_authorization_required":["US work authorization"],
      "summary":"Architect and modernize on prem core banking systems"
    }$$
  )
) as jd (
  job_uid,
  title,
  team,
  location_raw,
  remote_flag,
  job_url,
  description_snippet,
  full_description,
  seniority_label,
  function_label,
  job_profile_text
);