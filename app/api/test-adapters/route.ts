import { NextResponse } from 'next/server'
import { LeverAdapter, AshbyAdapter } from '@/lib/adapters'
import { Company } from '@/lib/database.types'

// Test endpoint - remove after testing
export async function GET() {
  const results: any[] = []

  // Test Lever
  const leverCompany: Company = {
    id: 'test',
    slug: 'test-lever',
    name: 'Lever (Test)',
    careers_url: 'https://jobs.lever.co/lever',
    linkedin_jobs_url: null,
    platform_key: 'lever',
    work_model: null,
    hq: null,
    tags: null,
    priority: null,
    relevant_for: null,
    last_checked_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  try {
    const leverAdapter = new LeverAdapter()
    const leverJobs = await leverAdapter.fetchJobs(leverCompany)
    results.push({
      platform: 'Lever',
      success: true,
      jobCount: leverJobs.length,
      sampleJob: leverJobs[0] || null,
    })
  } catch (error) {
    results.push({
      platform: 'Lever',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }

  // Test Ashby
  const ashbyCompany: Company = {
    id: 'test',
    slug: 'test-ashby',
    name: 'Ashby (Test)',
    careers_url: 'https://jobs.ashbyhq.com/ashby',
    linkedin_jobs_url: null,
    platform_key: 'ashby',
    work_model: null,
    hq: null,
    tags: null,
    priority: null,
    relevant_for: null,
    last_checked_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  try {
    const ashbyAdapter = new AshbyAdapter()
    const ashbyJobs = await ashbyAdapter.fetchJobs(ashbyCompany)
    results.push({
      platform: 'Ashby',
      success: true,
      jobCount: ashbyJobs.length,
      sampleJob: ashbyJobs[0] || null,
    })
  } catch (error) {
    results.push({
      platform: 'Ashby',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }

  return NextResponse.json({ results })
}

