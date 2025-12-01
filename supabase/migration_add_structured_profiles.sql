-- Structured candidate and job profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS candidate_profile JSONB;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS job_profile JSONB;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS score_hard_blockers TEXT;


