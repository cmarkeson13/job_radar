// Quick test script for job adapters
// Run with: npx tsx test-adapters.ts

import { LeverAdapter, AshbyAdapter } from './lib/adapters'
import { Company } from './lib/database.types'

// Test companies (using real public examples)
const testCompanies: { name: string; url: string; platform: 'lever' | 'ashby' }[] = [
  {
    name: 'Test Lever Company',
    url: 'https://jobs.lever.co/lever',
    platform: 'lever'
  },
  {
    name: 'Test Ashby Company',
    url: 'https://jobs.ashbyhq.com/ashby',
    platform: 'ashby'
  }
]

async function testAdapter() {
  console.log('Testing job adapters...\n')

  for (const test of testCompanies) {
    console.log(`\n=== Testing ${test.platform.toUpperCase()} ===`)
    console.log(`Company: ${test.name}`)
    console.log(`URL: ${test.url}`)

    const company: Company = {
      id: 'test-id',
      slug: 'test',
      name: test.name,
      careers_url: test.url,
      linkedin_jobs_url: null,
      platform_key: test.platform,
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
      let adapter
      if (test.platform === 'lever') {
        adapter = new LeverAdapter()
      } else {
        adapter = new AshbyAdapter()
      }

      const jobs = await adapter.fetchJobs(company)
      console.log(`✅ Success! Found ${jobs.length} jobs`)
      
      if (jobs.length > 0) {
        console.log('\nFirst job sample:')
        console.log(`  Title: ${jobs[0].title}`)
        console.log(`  Location: ${jobs[0].location_raw || 'N/A'}`)
        console.log(`  Remote: ${jobs[0].remote_flag ?? 'N/A'}`)
        console.log(`  URL: ${jobs[0].job_url || 'N/A'}`)
      }
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

testAdapter().catch(console.error)

