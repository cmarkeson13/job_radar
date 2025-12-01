import OpenAI from 'openai'
import { createServerClient } from './supabase'
import { analyzeJobProfile } from './job-analyzer'
import {
  CandidateProfile,
  JobProfile,
  MATCHING_SYSTEM_PROMPT,
} from './profile-schema'
import { ModelQuality, resolveModel } from './model-selection'

const MATCH_MODEL_DEFAULT =
  process.env.OPENAI_MATCH_MODEL ||
  process.env.NEXT_PUBLIC_OPENAI_MODEL ||
  'gpt-4o-mini'

let cachedClient: OpenAI | null = null

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured')
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return cachedClient
}

function parseArrayField(value: any): string[] {
  if (Array.isArray(value)) return value.map(item => String(item))
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export async function scoreJobForUser(
  userId: string,
  jobId: string,
  options?: { modelQuality?: ModelQuality }
) {
  const supabase = createServerClient()

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('candidate_profile, resume_summary, job_preferences, location_preferences, seniority_preference, experience_years_override')
    .eq('user_id', userId)
    .single()

  if (profileError || !profile?.candidate_profile) {
    return { success: false, error: 'Resume not analyzed yet. Please run "Analyze with AI" on the Resume page.' }
  }

  const candidateProfile = { ...(profile.candidate_profile as CandidateProfile) }
  if (profile.experience_years_override !== null && profile.experience_years_override !== undefined) {
    candidateProfile.total_years_experience = Number(profile.experience_years_override)
  }

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id, title, job_profile, full_description, description_snippet, location_raw, remote_flag, company_id')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return { success: false, error: 'Job not found' }
  }

  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', job.company_id)
    .single()

  let jobProfile = job.job_profile as JobProfile | null
  let longDescription = job.full_description || job.description_snippet || ''
  if (!longDescription.trim()) {
    longDescription = [
      `Job Title: ${job.title}`,
      company?.name ? `Company: ${company.name}` : null,
      job.location_raw ? `Location: ${job.location_raw}` : null,
      job.remote_flag === true ? 'This role is remote-friendly.' : job.remote_flag === false ? 'This role is on-site.' : null,
      'No job description was provided. Infer requirements conservatively from the metadata above.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (!jobProfile && longDescription) {
    jobProfile = await analyzeJobProfile({
      title: job.title,
      company: company?.name || 'Unknown Company',
      description: longDescription,
      location: job.location_raw || undefined,
      remoteFlag: job.remote_flag,
    })
    if (jobProfile) {
      await supabase.from('jobs').update({ job_profile: jobProfile }).eq('id', job.id)
    }
  }

  if (!jobProfile) {
    return { success: false, error: 'Job profile missing description to analyze.' }
  }

  const userMessage = [
    'Evaluate the match between this candidate and job.',
    '',
    'Candidate (JSON):',
    JSON.stringify(candidateProfile, null, 2),
    '',
    'Job (JSON):',
    JSON.stringify(jobProfile, null, 2),
  ].join('\n')

  try {
    const client = getClient()
    const model = resolveModel(options?.modelQuality, {
      premium: MATCH_MODEL_DEFAULT,
      default: MATCH_MODEL_DEFAULT,
    })
    console.info(
      `[job-matching] Using model ${model} (${options?.modelQuality || 'default'}) for job ${jobId}`
    )
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: MATCHING_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    })

    const payload = completion.choices[0]?.message?.content
    if (!payload) {
      return { success: false, error: 'AI returned an empty response' }
    }

    const result = JSON.parse(payload)
    const score = Math.max(0, Math.min(100, Number(result.score) || 0))

    await supabase
      .from('jobs')
      .update({
        score_you: score,
        score_reasoning: result.reasoning || null,
        score_strengths: result.strengths ? JSON.stringify(result.strengths) : null,
        score_gaps: result.gaps ? JSON.stringify(result.gaps) : null,
        score_hard_blockers: result.hard_blockers ? JSON.stringify(result.hard_blockers) : null,
        score_last_updated: new Date().toISOString(),
      })
      .eq('id', jobId)

    return {
      success: true,
      score,
      reasoning: result.reasoning,
      strengths: parseArrayField(result.strengths),
      gaps: parseArrayField(result.gaps),
      hard_blockers: parseArrayField(result.hard_blockers),
    }
  } catch (error) {
    console.error('[job-matching] scoring failed', error)
    const message = error instanceof Error ? error.message : 'Unknown AI error'
    return { success: false, error: `AI scoring failed: ${message}` }
  }
}


