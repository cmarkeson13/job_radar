-- Add last_fetch_error column to companies table
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS last_fetch_error TEXT;

-- Add index for filtering companies with errors
CREATE INDEX IF NOT EXISTS idx_companies_last_fetch_error ON companies(last_fetch_error) WHERE last_fetch_error IS NOT NULL;

