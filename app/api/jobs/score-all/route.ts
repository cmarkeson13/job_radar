import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import OpenAI from 'openai'

// Extract the scoring logic into a reusable function
async function scoreJob(userId: string, jobId: string): Promise<{ success: boolean; score?: number; error?: string }> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { success: false, error: 'OpenAI API key not configured' }
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    const supabase = createServerClient()

    // Get user's resume (including extracted text)
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('resume_file_url, resume_summary, resume_text')
      .eq('user_id', userId)
      .single()

    if (profileError || !profile || !profile.resume_file_url) {
      return { success: false, error: 'Resume not found' }
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, title, description_snippet, full_description, location_raw, remote_flag, company_id, team')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return { success: false, error: 'Job not found' }
    }

    // Get company name
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', job.company_id)
      .single()

    const companyName = company?.name || 'Unknown Company'

    // Build job description
    const jobDescription = `
Job Title: ${job.title}
Company: ${companyName}
Team/Department: ${job.team || 'Not specified'}
Location: ${job.location_raw || 'Not specified'} ${job.remote_flag ? '(Remote)' : ''}

${job.full_description || job.description_snippet || 'No description available'}
`.trim()

    // Get resume content - AI will read the resume directly
    // For PDFs, we need to extract text or use OpenAI's file API
    // For now, we'll extract text from the base64 file
    let resumeContent: string
    
    const isPDF = profile.resume_file_url.includes('application/pdf')
    const isDOCX = profile.resume_file_url.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')

    if (isPDF) {
      // For PDFs, use the extracted text that AI read (stored in resume_text)
      // This text was extracted by AI when user clicked "Analyze with AI"
      const { data: profileWithText } = await supabase
        .from('user_profiles')
        .select('resume_text, resume_summary')
        .eq('user_id', userId)
        .single()

      if (profileWithText?.resume_text && profileWithText.resume_text.length > 50) {
        // Use the extracted text that AI read from the PDF
        resumeContent = profileWithText.resume_text
      } else if (profileWithText?.resume_summary && profileWithText.resume_summary.length > 100) {
        // Fallback to summary if extracted text not available
        resumeContent = profileWithText.resume_summary
      } else {
        return { 
          success: false, 
          error: 'PDF resume detected. Please click "Analyze with AI" on the Resume page first to extract text from your PDF, then try scoring jobs again.' 
        }
      }
    } else if (isDOCX) {
      // For DOCX, try to extract text
      const base64Match = profile.resume_file_url.match(/base64,(.+)/)
      if (base64Match) {
        try {
          // DOCX files are actually ZIP files, so we can't just decode as UTF-8
          // We'd need mammoth or similar
          // For now, use summary if available
          if (profile.resume_summary && profile.resume_summary.length > 100) {
            resumeContent = profile.resume_summary
          } else {
            return { 
              success: false, 
              error: 'DOCX resume detected. Please click "Analyze with AI" first to extract text.' 
            }
          }
        } catch (e) {
          return { success: false, error: 'Could not read DOCX file' }
        }
      } else {
        return { success: false, error: 'Could not read resume file' }
      }
    } else {
      // Text file - extract text directly
      const base64Match = profile.resume_file_url.match(/base64,(.+)/)
      if (base64Match) {
        resumeContent = Buffer.from(base64Match[1], 'base64').toString('utf-8')
      } else {
        return { success: false, error: 'Could not read resume file' }
      }
    }

    // Call OpenAI
    const model = process.env.NEXT_PUBLIC_OPENAI_MODEL || 'gpt-3.5-turbo'
    
    const prompt = `You are a job matching expert. Analyze how well this job matches the candidate's resume.

Rate the match on a scale of 0-100, where:
- 0-39: Poor match (major gaps in skills, experience, or requirements)
- 40-59: Fair match (some relevant skills/experience, but significant gaps)
- 60-79: Good match (strong alignment with most requirements)
- 80-100: Excellent to perfect match (strong alignment with all or most requirements, ideal fit)

Consider:
- Skills match (required vs. candidate's skills)
- Experience level match (years of experience, seniority)
- Industry/domain alignment
- Location preferences (remote vs. on-site)
- Overall fit

Return your response in this exact JSON format:
{
  "score": <number 0-100>,
  "reasoning": "<2-3 sentence explanation of why this score>",
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "gaps": ["<gap 1>", "<gap 2>", ...]
}`

    // Build the user message with resume content
    const userMessage = {
      role: 'user' as const,
      content: `Resume:\n${resumeContent}\n\n---\n\nJob Description:\n${jobDescription}`
    }

    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: prompt },
        userMessage,
      ],
      temperature: parseFloat(process.env.NEXT_PUBLIC_LLM_DEFAULT_TEMPERATURE || '0.7'),
      response_format: { type: 'json_object' },
    })

    const responseText = completion.choices[0]?.message?.content || ''
    if (!responseText) {
      return { success: false, error: 'Failed to generate score' }
    }

    const scoreData = JSON.parse(responseText)
    const score = Math.max(0, Math.min(100, parseInt(scoreData.score) || 0))

    // Update job with score
    await supabase
      .from('jobs')
      .update({ 
        score_you: score,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    return { success: true, score }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: errorMsg }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    // Get all open jobs
    const supabase = createServerClient()
    const { data: jobs, error: jobsError } = await supabase
      .from('jobs')
      .select('id')
      .eq('closed_flag', false)
      .order('detected_at', { ascending: false })
      .limit(100) // Limit to 100 jobs to avoid timeout

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
        const result = await scoreJob(userId, job.id)
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

