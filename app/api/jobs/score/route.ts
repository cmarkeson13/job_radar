import { NextRequest, NextResponse } from 'next/server'
import { scoreJobForUser } from '@/lib/job-matching'
import { ModelQuality } from '@/lib/model-selection'

export async function POST(request: NextRequest) {
  try {
    const { userId, jobId, modelQuality } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 })
    }

    const result = await scoreJobForUser(userId, jobId, {
      modelQuality: modelQuality as ModelQuality | undefined,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      jobId,
      score: result.score,
      reasoning: result.reasoning,
      strengths: result.strengths,
      gaps: result.gaps,
      hard_blockers: result.hard_blockers,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

