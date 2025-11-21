export type Platform = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'polymer' | 'generic_html' | 'linkedin' | 'unknown'

export type WorkModel = 'remote' | 'hybrid' | 'onsite' | 'unknown'

export type RelevantFor = 'alyssa' | 'cam' | 'both'

export type SeniorityLabel = 'junior' | 'mid' | 'senior' | 'lead' | null

export type FunctionLabel = 'product' | 'growth' | 'ops' | 'engineering' | 'design' | 'other' | null

export type JobStatus = 'New' | 'Applied' | 'Interviewing' | 'OnHold' | 'Rejected'

export interface Company {
  id: string
  slug: string
  name: string
  careers_url: string | null
  linkedin_jobs_url: string | null
  platform_key: Platform
  work_model: WorkModel | null
  hq: string | null
  tags: string[] | null
  priority: number | null
  relevant_for: RelevantFor | null
  last_checked_at: string | null
  last_fetch_error: string | null
  created_at: string
  updated_at: string
}

export interface Job {
  id: string
  job_uid: string
  company_id: string
  title: string
  team: string | null
  location_raw: string | null
  remote_flag: boolean | null
  job_url: string | null
  source_platform: Platform
  posted_at: string | null
  detected_at: string
  description_snippet: string | null
  full_description: string | null
  seniority_label: SeniorityLabel
  function_label: FunctionLabel
  score_alyssa: number | null
  score_you: number | null
  status: JobStatus
  notes: string | null
  last_seen_open_at: string | null
  closed_flag: boolean
  created_at: string
  updated_at: string
}

export interface CriteriaProfile {
  id: string
  user_key: 'alyssa' | 'cam'
  include_keywords: string[] | null
  exclude_keywords: string[] | null
  seniority_preference: string[] | null
  location_preference: string[] | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Log {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error'
  company_id: string | null
  module: 'fetch_jobs' | 'score_jobs' | 'sync_sheets'
  message: string
  details_json: Record<string, any> | null
}

export interface UserProfile {
  id: string
  user_id: string
  resume_text: string | null
  resume_summary: string | null
  resume_file_url: string | null
  resume_uploaded_at: string | null
  job_preferences: string | null
  location_preferences: string | null
  seniority_preference: string | null
  created_at: string
  updated_at: string
}

