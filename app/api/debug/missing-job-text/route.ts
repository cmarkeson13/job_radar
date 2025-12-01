import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('jobs')
      .select('id, source_platform, job_url, company:companies(name)')
      .is('full_description', null)
      .is('description_snippet', null)

    if (error) {
      throw error
    }

    const total = data?.length || 0

    const byPlatform = (data || []).reduce<Record<string, number>>((acc, job) => {
      const key = job.source_platform || 'unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    const byCompany = (data || []).reduce<Record<string, number>>((acc, job) => {
      const key = job.company?.name || 'Unknown company'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    const topCompanies = Object.entries(byCompany)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count }))

    const sample = (data || [])
      .slice(0, 25)
      .map(job => ({
        id: job.id,
        company: job.company?.name || 'Unknown company',
        platform: job.source_platform,
        job_url: job.job_url,
      }))

    return NextResponse.json({
      total,
      byPlatform,
      topCompanies,
      sample,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


