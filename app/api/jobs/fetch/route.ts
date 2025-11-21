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
      // Fetch jobs for all companies and return summary
      // forceAll=true means fetch ALL companies, not just those not checked in 7 days
      // Start the fetch in the background and return immediately with sessionId
      const summary = await fetchJobsForAllCompanies(true)
      
      return NextResponse.json({ 
        success: true, 
        total: summary.total,
        succeeded: summary.success, // Renamed to avoid conflict with top-level success
        failed: summary.failed,
        errors: summary.errors,
        sessionId: summary.sessionId // Return sessionId for progress polling
      })
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

