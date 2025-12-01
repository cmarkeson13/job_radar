import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { scoreJobForUser } from '@/lib/job-matching'
import { ModelQuality } from '@/lib/model-selection'

export async function POST(request: NextRequest) {
  try {
    const { userId, limit: limitParam, modelQuality } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    const limit = Math.min(Number(limitParam) || 500, 1000)

    // Get all open jobs
    const supabase = createServerClient()
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id')
      .eq('closed_flag', false)
      .is('score_you', null)
      .order('detected_at', { ascending: false })
      .limit(limit)

    if (jobsError) {
      return NextResponse.json({ error: `Failed to fetch jobs: ${jobsError.message}` }, { status: 500 })
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ 
        success: true, 
        total: 0, 
        scored: 0, 
        message: 'No jobs to score' 
      })
    }

    // Score jobs in batches
    const BATCH_SIZE = 3 // Smaller batches to avoid rate limits
    let scored = 0
    let failed = 0
    const errors: string[] = []

    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
      const batch = jobs.slice(i, i + BATCH_SIZE)
      
      const batchPromises = batch.map(async (job) => {
        const result = await scoreJobForUser(userId, job.id, {
          modelQuality: modelQuality as ModelQuality | undefined,
        })
        if (result.success) {
          return { success: true, jobId: job.id, score: result.score }
        } else {
          errors.push(`Job ${job.id}: ${result.error}`)
          return { success: false, jobId: job.id, error: result.error }
        }
      })

      const results = await Promise.all(batchPromises)
      
      for (const result of results) {
        if (result.success) {
          scored++
        } else {
          failed++
        }
      }

      // Delay between batches to respect rate limits
      if (i + BATCH_SIZE < jobs.length) {
        await new Promise(resolve => setTimeout(resolve, 2000)) // 2 second delay
      }
    }

    return NextResponse.json({
      success: true,
      total: jobs.length,
      scored,
      failed,
      requested: limit,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
    })
  } catch (error) {
    console.error('Score all jobs error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

