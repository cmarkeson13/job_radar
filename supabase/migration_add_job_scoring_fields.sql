-- Add extra metadata for AI job scoring
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS score_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS score_strengths TEXT,
  ADD COLUMN IF NOT EXISTS score_gaps TEXT,
  ADD COLUMN IF NOT EXISTS score_last_updated TIMESTAMPTZ;


