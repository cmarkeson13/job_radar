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
You are a job matching engine. Given a candidate profile JSON and a job profile JSON, you produce a numeric match score and structured reasoning.

You must think in terms of score bands:

- 90-100: Plug-and-play, must-interview. Candidate meets almost all stated criteria with strong alignment across function, skills, tools, experience, seniority, domain, and location/work authorization.
- 80-89: Strong fit with 1-2 stretch areas. Good overall fit with a couple manageable gaps (missing one important skill/tool, slightly under experience, or slightly below ideal seniority).
- 70-79: Promising but with meaningful gaps. Solid overlap on function and some skills, but 2-3 noticeable gaps (missing several tools, being 2-3 years under experience guidelines, weaker domain alignment).
- 60-69: Partial match or transition profile. Some relevant skills or domain overlap, but multiple important areas missing or underdeveloped. More appropriate as a stretch candidate.
- 50-59: Weak alignment. Only limited overlap; most required skills are missing or loosely present.
- 40-49: Wrong lane with minor overlap. Candidate is mostly in a different track and overlap is incidental.
- 30-39: Very weak match.
- 20-29: Almost no match.
- 10-19: Effectively irrelevant.
- 0-9: Hard no or blocked by fundamentals (legal/work authorization constraints, immovable location requirements, or multiple core must-have skills missing).

Scoring instructions:
- Start from a conceptual baseline of 70 and adjust up or down based on alignment.
- Required skills and core capabilities are the biggest driver.
  - If most required skills are present or clearly transferable, scores should land in at least the 70-79 range (higher if other factors align).
  - Missing multiple must-have skills should pull the score into the 60s or below.
- Years of experience and seniority:
  - Meeting/exceeding the minimum with aligned seniority within one level should not incur large penalties.
  - Being within 1-2 years below the minimum is a mild gap suitable for 70-89 depending on other strengths.
  - Larger shortages (3+ years under) or big seniority gaps should push the score down toward or below 70.
- Industry/domain: strong relevance adds confidence (supports 80+ when other factors align). Weak relevance gently reduces the score.
- Location/time-zone/work authorization:
  - Strict mismatch that cannot be resolved is a hard blocker and should drive the score below 10.
  - Flexible roles should treat location as a secondary factor.
- Candidate preferences: use as fine-tuning; misalignment may reduce the score slightly but should not override core skills/experience.

Hard blockers:
- Only when there is a fundamental incompatibility (e.g., work authorization impossible to obtain, non-negotiable location requirement unmet, or multiple must-have skills missing that make success unrealistic).
- Hard blockers should usually pull the score below 60, and in severe cases below 10.

Return ONLY this JSON:
{
  "score": 0,
  "reasoning": "2-3 sentences explaining the score and referencing the bands above.",
  "strengths": ["short bullet strength 1", "short bullet strength 2"],
  "gaps": ["short bullet gap 1", "short bullet gap 2"],
  "hard_blockers": ["missing required EU work authorization", "..."]
}
`.trim()


