-- Add preference fields to user_profiles for manual overrides
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS job_preferences TEXT,
  ADD COLUMN IF NOT EXISTS location_preferences TEXT,
  ADD COLUMN IF NOT EXISTS seniority_preference TEXT;


