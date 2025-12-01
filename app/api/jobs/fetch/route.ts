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
      // Create a session id upfront so the progress endpoint knows where to look
      const fetchSessionId = `fetch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      // Kick off the job in the background
      fetchJobsForAllCompanies(true, fetchSessionId).catch(error => {
        console.error('[Bulk Fetch] Unhandled error', error)
      })

      // Return immediately so the UI can start polling
      return NextResponse.json({
        success: true,
        sessionId: fetchSessionId,
      })
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

