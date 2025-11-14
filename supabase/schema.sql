-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Companies table
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  careers_url TEXT,
  linkedin_jobs_url TEXT,
  platform_key TEXT NOT NULL DEFAULT 'unknown' CHECK (platform_key IN ('greenhouse', 'lever', 'ashby', 'generic_html', 'linkedin', 'unknown')),
  work_model TEXT CHECK (work_model IN ('remote', 'hybrid', 'onsite', 'unknown')),
  hq TEXT,
  tags TEXT[],
  priority INTEGER DEFAULT 0,
  relevant_for TEXT CHECK (relevant_for IN ('alyssa', 'cam', 'both')),
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jobs table
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_uid TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  team TEXT,
  location_raw TEXT,
  remote_flag BOOLEAN,
  job_url TEXT,
  source_platform TEXT NOT NULL CHECK (source_platform IN ('greenhouse', 'lever', 'ashby', 'generic_html', 'linkedin', 'unknown')),
  posted_at TIMESTAMPTZ,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  description_snippet TEXT,
  full_description TEXT,
  seniority_label TEXT CHECK (seniority_label IN ('junior', 'mid', 'senior', 'lead')),
  function_label TEXT CHECK (function_label IN ('product', 'growth', 'ops', 'engineering', 'design', 'other')),
  score_alyssa INTEGER CHECK (score_alyssa >= 0 AND score_alyssa <= 100),
  score_you INTEGER CHECK (score_you >= 0 AND score_you <= 100),
  status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Applied', 'Interviewing', 'OnHold', 'Rejected')),
  notes TEXT,
  last_seen_open_at TIMESTAMPTZ,
  closed_flag BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, job_uid)
);

-- Criteria profiles table
CREATE TABLE criteria_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_key TEXT NOT NULL UNIQUE CHECK (user_key IN ('alyssa', 'cam')),
  include_keywords TEXT[],
  exclude_keywords TEXT[],
  seniority_preference TEXT[],
  location_preference TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Logs table
CREATE TABLE logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  module TEXT NOT NULL CHECK (module IN ('fetch_jobs', 'score_jobs', 'sync_sheets')),
  message TEXT NOT NULL,
  details_json JSONB
);

-- Indexes for performance
CREATE INDEX idx_jobs_company_id ON jobs(company_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_closed_flag ON jobs(closed_flag);
CREATE INDEX idx_jobs_detected_at ON jobs(detected_at);
CREATE INDEX idx_companies_platform_key ON companies(platform_key);
CREATE INDEX idx_companies_last_checked_at ON companies(last_checked_at);
CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_module ON logs(module);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_criteria_profiles_updated_at BEFORE UPDATE ON criteria_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

