import { NextRequest, NextResponse } from 'next/server'
import { scoreJobForUser } from '@/lib/job-matching'
import { ModelQuality } from '@/lib/model-selection'

export async function POST(request: NextRequest) {
  try {
    const { userId, jobIds, modelQuality } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json({ error: 'jobIds array required' }, { status: 400 })
    }

    const failures: { jobId: string; error: string }[] = []
    let completed = 0

    // Process sequentially to reduce API/model rate-limit risk
    for (const jobId of jobIds) {
      try {
        const result = await scoreJobForUser(userId, jobId, {
          modelQuality: modelQuality as ModelQuality | undefined,
        })
        if (!result.success) {
          failures.push({ jobId, error: result.error || 'Unknown error' })
        } else {
          completed += 1
        }
      } catch (err) {
        failures.push({ jobId, error: err instanceof Error ? err.message : 'Unknown error' })
      }
    }

    return NextResponse.json({
      success: failures.length === 0,
      completed,
      total: jobIds.length,
      failures,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

