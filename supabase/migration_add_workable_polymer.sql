-- Add workable and polymer to platform_key enum
ALTER TABLE companies 
DROP CONSTRAINT IF EXISTS companies_platform_key_check;

ALTER TABLE companies 
ADD CONSTRAINT companies_platform_key_check 
CHECK (platform_key IN ('greenhouse', 'lever', 'ashby', 'workable', 'polymer', 'generic_html', 'linkedin', 'unknown'));

-- Also update jobs table
ALTER TABLE jobs 
DROP CONSTRAINT IF EXISTS jobs_source_platform_check;

ALTER TABLE jobs 
ADD CONSTRAINT jobs_source_platform_check 
CHECK (source_platform IN ('greenhouse', 'lever', 'ashby', 'workable', 'polymer', 'generic_html', 'linkedin', 'unknown'));

