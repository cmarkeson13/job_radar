import { NextRequest, NextResponse } from 'next/server'
import { getBulkFetchProgress } from '@/lib/job-fetcher'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')
    
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
    }
    
    const progress = getBulkFetchProgress(sessionId)
    
    if (!progress) {
      return NextResponse.json({ error: 'Progress not found' }, { status: 404 })
    }
    
    return NextResponse.json(progress)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

