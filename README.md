# Job Radar

Private job tracking system that continuously pulls open roles from curated company lists, normalizes them, and lets you track which ones to act on.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a new Supabase project at https://supabase.com
2. Go to SQL Editor and run the schema from `supabase/schema.sql`
3. Get your project URL and API keys from Settings > API

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

- **Import Companies**: Upload an Excel file with your company list
- **Job Fetching**: Automatically fetch jobs from Greenhouse and custom company websites
- **Job Tracking**: Track job status (New, Applied, Interviewing, On Hold, Rejected)
- **Simple UI**: Excel-like table interface for easy navigation

## Excel Import Format

Your Excel file should have the following columns (all optional except `name`):

- `name` (required): Company name
- `slug`: URL-friendly identifier (auto-generated from name if not provided)
- `careers_url`: URL to the company's careers page
- `linkedin_jobs_url`: LinkedIn jobs page URL (for future use)
- `platform`: One of: `greenhouse`, `lever`, `ashby`, `generic_html`, `linkedin`, `unknown`
- `work_model`: `remote`, `hybrid`, `onsite`, or `unknown`
- `hq`: Headquarters location
- `tags`: Comma-separated tags
- `priority`: Numeric priority (default: 0)
- `relevant_for`: `alyssa`, `cam`, or `both`

## Usage

1. **Import Companies**: Go to the Companies page and click "Import Excel" to upload your company list
2. **Fetch Jobs**: Click "Fetch Jobs" next to any company to pull current job listings
3. **View Jobs**: Go to the Jobs page to see all fetched jobs, filter by status, and update job status
4. **Weekly Fetching**: Currently manual - click "Fetch Jobs" for each company. Future: automated weekly fetching

## Supported Job Platforms

- **Greenhouse**: Automatically detects and fetches from Greenhouse job boards
- **Generic HTML**: Scrapes custom company websites for job listings
- **Coming Soon**: Lever, Ashby, LinkedIn

## Database Schema

The app uses PostgreSQL with the following main tables:
- `companies`: Company information and job source URLs
- `jobs`: Job listings with details, status, and scores
- `criteria_profiles`: User preferences for job scoring (for future use)
- `logs`: System logs for debugging and monitoring

