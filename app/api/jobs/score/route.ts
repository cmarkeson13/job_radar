import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import OpenAI from 'openai'

export async function POST(request: NextRequest) {
  try {
    // Initialize OpenAI
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    const { userId, jobId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 })
    }

    // Get user's resume (including extracted text)
    const supabase = createServerClient()
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('resume_file_url, resume_summary, resume_text')
      .eq('user_id', userId)
      .single()

    if (profileError || !profile || !profile.resume_file_url) {
      return NextResponse.json({ error: 'Resume not found. Please upload a resume first.' }, { status: 404 })
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, title, description_snippet, full_description, location_raw, remote_flag, company_id, team')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
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
    // For PDFs/DOCX, we need to extract text or use summary
    let resumeContent: string
    const isPDF = profile.resume_file_url.includes('application/pdf')
    const isDOCX = profile.resume_file_url.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')

    if (isPDF) {
      // For PDFs, use the extracted text that AI read (stored in resume_text)
      // This text was extracted by AI when user clicked "Analyze with AI"
      if (profile.resume_text && profile.resume_text.length > 50) {
        // Use the extracted text that AI read from the PDF
        resumeContent = profile.resume_text
      } else if (profile.resume_summary && profile.resume_summary.length > 100) {
        // Fallback to summary if extracted text not available
        resumeContent = profile.resume_summary
      } else {
        return NextResponse.json({ 
          error: 'PDF resume detected. Please click "Analyze with AI" on the Resume page first to extract text from your PDF, then try scoring jobs again.' 
        }, { status: 400 })
      }
    } else if (isDOCX) {
      // DOCX files are ZIP-based, need special parsing
      // Use summary if available
      if (profile.resume_summary && profile.resume_summary.length > 100) {
        resumeContent = profile.resume_summary
      } else {
        return NextResponse.json({ 
          error: 'DOCX resume detected. Please click "Analyze with AI" first to extract text.' 
        }, { status: 400 })
      }
    } else {
      // Text file - extract directly from base64
      const base64Match = profile.resume_file_url.match(/base64,(.+)/)
      if (base64Match) {
        resumeContent = Buffer.from(base64Match[1], 'base64').toString('utf-8')
      } else {
        return NextResponse.json({ error: 'Could not read resume file' }, { status: 400 })
      }
    }

    // Call OpenAI to score the job match
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

    let completion
    try {
      completion = await openai.chat.completions.create({
        model: model,
        messages: [
          { 
            role: 'system', 
            content: prompt 
          },
          { 
            role: 'user', 
            content: `Resume:\n${resumeContent}\n\n---\n\nJob Description:\n${jobDescription}` 
          },
        ],
        temperature: parseFloat(process.env.NEXT_PUBLIC_LLM_DEFAULT_TEMPERATURE || '0.7'),
        response_format: { type: 'json_object' }, // Force JSON response
      })
    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError)
      const errorMessage = openaiError instanceof Error ? openaiError.message : 'Unknown OpenAI error'
      return NextResponse.json({ 
        error: `AI scoring failed: ${errorMessage}` 
      }, { status: 500 })
    }

    const responseText = completion.choices[0]?.message?.content || ''
    
    if (!responseText) {
      return NextResponse.json({ error: 'Failed to generate score' }, { status: 500 })
    }

    // Parse JSON response
    let scoreData
    try {
      scoreData = JSON.parse(responseText)
    } catch (parseError) {
      console.error('Failed to parse AI response:', responseText)
      return NextResponse.json({ 
        error: 'AI returned invalid response format',
        rawResponse: responseText.substring(0, 200)
      }, { status: 500 })
    }

    // Validate score
    const score = Math.max(0, Math.min(100, parseInt(scoreData.score) || 0))

    // Update job with score
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ 
        score_you: score,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error updating job score:', updateError)
      // Don't fail - return the score even if we can't save it
    }

    return NextResponse.json({
      success: true,
      score,
      reasoning: scoreData.reasoning || 'No reasoning provided',
      strengths: scoreData.strengths || [],
      gaps: scoreData.gaps || [],
      jobId,
    })
  } catch (error) {
    console.error('Job scoring error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

