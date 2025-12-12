export type LocationType = 'remote' | 'hybrid' | 'onsite' | 'flexible' | 'unspecified'
export type SeniorityType = 'junior' | 'mid' | 'senior' | 'lead' | 'manager' | 'director' | 'executive' | 'unspecified'
export type CompanySize = 'startup' | 'scaleup' | 'enterprise' | 'agency' | 'unknown'

export interface CandidateProfile {
  full_name: string
  headline: string
  summary: string
  seniority_level: SeniorityType
  total_years_experience: number
  primary_functions: string[]
  core_skills: string[]
  tools_technologies: string[]
  industries: string[]
  certifications: string[]
  location_preferences: {
    types: LocationType[]
    cities: string[]
    time_zones: string[]
    work_authorizations: string[]
    open_to_relocation: boolean
  }
  job_preferences: {
    role_types: string[]
    industries: string[]
    keywords: string[]
    company_sizes: CompanySize[]
  }
  salary_expectations: string
}

export interface JobProfile {
  job_title: string
  seniority_level: SeniorityType
  role_type: string
  required_skills: string[]
  nice_to_have_skills: string[]
  tools_technologies: string[]
  industries: string[]
  location: {
    type: LocationType
    cities: string[]
    time_zones: string[]
  }
  years_experience_min: number
  years_experience_max: number
  company_size: CompanySize
  work_authorization_required: string[]
  compensation_notes: string
  summary: string
}

const candidateSchemaString = `{
  "full_name": "string",
  "headline": "string",
  "summary": "2-3 sentence professional summary",
  "seniority_level": "junior|mid|senior|lead|manager|director|executive|unspecified",
  "total_years_experience": 0,
  "primary_functions": ["product management", "..."],
  "core_skills": ["roadmapping", "..."],
  "tools_technologies": ["sql", "python", "..."],
  "industries": ["saas", "..."],
  "certifications": ["pmp", "..."],
  "location_preferences": {
    "types": ["remote|hybrid|onsite|flexible|unspecified"],
    "cities": ["San Francisco, CA"],
    "time_zones": ["PT", "ET"],
    "work_authorizations": ["US Citizen", "Eligible for EU work authorization"],
    "open_to_relocation": true
  },
  "job_preferences": {
    "role_types": ["Head of Product", "..."],
    "industries": ["climate tech", "..."],
    "keywords": ["AI infrastructure", "..."],
    "company_sizes": ["startup|scaleup|enterprise|agency|unknown"]
  },
  "salary_expectations": "Optional notes about compensation"
}`

const jobSchemaString = `{
  "job_title": "string",
  "seniority_level": "junior|mid|senior|lead|manager|director|executive|unspecified",
  "role_type": "e.g., Product Manager, Head of GTM",
  "required_skills": ["..."],
  "nice_to_have_skills": ["..."],
  "tools_technologies": ["..."],
  "industries": ["..."],
  "location": {
    "type": "remote|hybrid|onsite|flexible|unspecified",
    "cities": ["San Francisco, CA"],
    "time_zones": ["PT", "ET"]
  },
  "years_experience_min": 0,
  "years_experience_max": 0,
  "company_size": "startup|scaleup|enterprise|agency|unknown",
  "work_authorization_required": ["US work authorization", "..."],
  "compensation_notes": "string",
  "summary": "2-3 sentence summary of what the role demands"
}`

export const RESUME_ANALYZER_PROMPT = `
You are an expert career analyst who interprets resumes with nuance for job matching.

Given a resume, extract a precise structured profile for job matching.

Return ONLY valid JSON that matches this schema (fill every field, use [] for empty arrays):
${candidateSchemaString}

Rules:
- Interpret skills semantically, not literally.
  - Map related phrases to underlying capabilities. For example, A/B testing, experiment design, funnel optimization, conversion lift, campaign performance, and user research should all contribute to experimentation, analytics, and insights oriented skills.
  - Map marketing or growth analytics, KPI reporting, and performance dashboards to data insights skills.
- Estimate total_years_experience based on the full career timeline implied by the resume, not only explicit numbers. If unsure, make a conservative but reasonable estimate.
- Infer seniority_level from scope, ownership, leadership, and complexity of work, not only job titles.
- Do not hallucinate achievements. Only infer capabilities that are clearly implied by responsibilities and outcomes.
- Use lowercase snake_case for entries in core_skills and tools_technologies when possible.
- Keep summary to 2-3 concise sentences in plain text (no markdown).
- location_preferences.types must only include the allowed enumerations.
- company_sizes must only include the allowed enumerations.
`.trim()

export const JOB_ANALYZER_PROMPT = `
You read job postings and convert them into normalized JSON used for matching.

Return ONLY valid JSON that matches this schema:
${jobSchemaString}

Rules:
- seniority_level must be one of the allowed enumerations; use "unspecified" if unclear.
- Populate required_skills ONLY with concrete must-have capabilities that are clearly required for success in the role.
  - Look for language like "must have", "required", "you will need", "core responsibility".
- Populate nice_to_have_skills with differentiators, bonus skills, and items described as "preferred", "nice to have", or "a plus".
- Tools and technologies:
  - Include tools in tools_technologies if they are part of the expected stack.
  - Only treat a specific tool as truly required if the description clearly demands it for day to day work.
- years_experience_min and years_experience_max should be integers:
  - For "4+ years" set years_experience_min to 4 and years_experience_max to 6.
  - For a range like "3-5 years", use 3 and 5.
  - Interpret years of experience as a guideline, not an absolute cutoff.
- Infer seniority_level from the responsibilities and scope, not from marketing language about the company.
- location.type must reflect the strictest requirement mentioned. Include cities and time_zones when present.
- work_authorization_required should capture anything about visas, US work authorization, or specific regions.
- summary should be 2 concise sentences describing what success in the role looks like.
`.trim()

export const MATCHING_SYSTEM_PROMPT = `
You are a job matching analyst. Read the candidate profile and job profile and produce a structured diagnostic JSON.

Do **not** provide a numeric score. Focus on factual alignment signals the engineering team can use downstream.

Return ONLY valid JSON with this schema:
{
  "must_have_skills_present": ["skill"],
  "must_have_skills_missing": ["skill"],
  "nice_to_have_skills_present": ["skill"],
  "tools_present": ["tool"],
  "tools_missing": ["tool"],
  "experience_years_delta": 0,
  "seniority_alignment": "above_expectation|within_one_level|below_by_one_level|below_by_two_or_more|unspecified",
  "domain_alignment": "strong|partial|weak|unspecified",
  "location_fit": "full_match|partial|mismatch|unspecified",
  "work_authorization_fit": "full_match|partial|mismatch|unspecified",
  "preference_alignment": {
    "role_types": "strong|partial|weak|unspecified",
    "company_size": "strong|partial|weak|unspecified",
    "keywords": "strong|partial|weak|unspecified"
  },
  "blocking_issues": ["describe only truly disqualifying blockers"],
  "overall_fit_label": "plug_and_play|strong_fit|stretch|weak_fit|hard_no",
  "notes": "short optional text"
}

Guidelines:
- Pull must-have skills from the job's required skills or obvious requirements and check whether the candidate clearly demonstrates each. Use canonical names (e.g., "experimentation", "sql").
- experience_years_delta = candidate years - job minimum (use 0 if unspecified).
- seniority_alignment compares the candidate's seniority to what the job expects.
- domain_alignment considers industry/client overlap (e.g., e-commerce, SaaS, hardware).
- location_fit/work_authorization_fit should only be "mismatch" when the job is strict and the candidate clearly does not meet it.
- preference_alignment compares the candidate's stated preferences (role types, company size, keywords) against the job.
- blocking_issues should list hard blockers only (e.g., "requires active TS/SCI clearance" when the candidate lacks it).
- overall_fit_label is your qualitative assessment based on all evidence.
- non‑negotiable location or work-authorization mismatch should be labeled as "mismatch" and mentioned in blocking_issues.
- overall_fit_label should reflect your qualitative view: plug_and_play (everything aligns), strong_fit, stretch, weak_fit, or hard_no.
`.trim()

export const MATCHING_EXPLANATION_PROMPT = `
You are a job match commentator. Given a candidate, a job, diagnostics, and the FINAL score chosen by the engineering team, produce JSON with:
{
  "reasoning": "2-3 sentences referencing the final score and the biggest strengths/gaps.",
  "strengths": ["concise bullet strength", "..."],
  "gaps": ["concise bullet gap", "..."],
  "hard_blockers": ["list any blockers mentioned in diagnostics if they truly prevent hiring"]
}

Rules:
- Never change the final score; just explain it.
- Mention the most relevant evidence (skills, experience, location, work authorization, domain).
- If diagnostics list blocking_issues, include them in hard_blockers.
`.trim()

