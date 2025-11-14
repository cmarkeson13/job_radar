import { NextRequest, NextResponse } from 'next/server'
import { fetchJobsForCompany, fetchJobsForAllCompanies } from '@/lib/job-fetcher'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { companyId } = body

    if (companyId) {
      // Fetch jobs for a specific company
      const result = await fetchJobsForCompany(companyId)
      return NextResponse.json(result)
    } else {
      // Fetch jobs for all companies
      await fetchJobsForAllCompanies()
      return NextResponse.json({ success: true, message: 'Started fetching jobs for all companies' })
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

