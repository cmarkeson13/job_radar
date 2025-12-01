import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import OpenAI from 'openai'
import { CandidateProfile, RESUME_ANALYZER_PROMPT } from '@/lib/profile-schema'
import { ModelQuality, resolveModel } from '@/lib/model-selection'

const RESUME_MODEL = process.env.OPENAI_RESUME_MODEL || process.env.NEXT_PUBLIC_OPENAI_MODEL || 'gpt-4o-mini'

async function extractResumeText(dataUrl: string): Promise<{ text: string; mime: string }> {
  const base64Match = dataUrl.match(/base64,(.+)/)
  if (!base64Match) {
    throw new Error('Resume file is malformed or missing base64 payload')
  }

  const mimeMatch = dataUrl.match(/^data:([^;]+);/)
  const mime = mimeMatch?.[1] || 'text/plain'
  const buffer = Buffer.from(base64Match[1], 'base64')

  if (mime.includes('application/pdf')) {
    const pdfParseModule = await import('pdf-parse/lib/pdf-parse.js').then(mod => mod.default || mod)
    const parsed = await pdfParseModule(buffer)
    if (!parsed.text || parsed.text.trim().length < 50) {
      throw new Error('PDF extraction returned too little text')
    }
    return { text: parsed.text.trim(), mime }
  }

  if (mime.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')) {
    const mammothModule = await import('mammoth')
    const parsed = await mammothModule.extractRawText({ buffer })
    if (!parsed.value || parsed.value.trim().length < 50) {
      throw new Error('DOCX extraction returned too little text')
    }
    return { text: parsed.value.trim(), mime }
  }

  const text = buffer.toString('utf-8').trim()
  if (!text || text.length < 50) {
    throw new Error('Text resume is too short')
  }
  return { text, mime }
}

function safeParseCandidate(content: string): CandidateProfile {
  try {
    return JSON.parse(content)
  } catch (error) {
    const match = content.match(/\{[\s\S]*\}/)
    if (match) {
      return JSON.parse(match[0])
    }
    throw error
  }
}

function formatPreferences(profile: CandidateProfile) {
  const jobPreferences = [
    profile.job_preferences?.role_types?.length ? `Roles: ${profile.job_preferences.role_types.join(', ')}` : null,
    profile.job_preferences?.industries?.length ? `Industries: ${profile.job_preferences.industries.join(', ')}` : null,
    profile.job_preferences?.company_sizes?.length ? `Company size: ${profile.job_preferences.company_sizes.join(', ')}` : null,
    profile.job_preferences?.keywords?.length ? `Keywords: ${profile.job_preferences.keywords.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join(' • ')

  const locationPreferences = [
    profile.location_preferences?.types?.length ? `Types: ${profile.location_preferences.types.join(', ')}` : null,
    profile.location_preferences?.cities?.length ? `Cities: ${profile.location_preferences.cities.join(', ')}` : null,
    profile.location_preferences?.time_zones?.length ? `Time zones: ${profile.location_preferences.time_zones.join(', ')}` : null,
    profile.location_preferences?.work_authorizations?.length
      ? `Work auth: ${profile.location_preferences.work_authorizations.join(', ')}`
      : null,
    typeof profile.location_preferences?.open_to_relocation === 'boolean'
      ? `Open to relocation: ${profile.location_preferences.open_to_relocation ? 'Yes' : 'No'}`
      : null,
  ]
    .filter(Boolean)
    .join(' • ')

  return {
    jobPreferences: jobPreferences || null,
    locationPreferences: locationPreferences || null,
    seniorityPreference: profile.seniority_level !== 'unspecified' ? profile.seniority_level : null,
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const { userId, modelQuality } = await request.json()
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    const selectedModel = resolveModel(modelQuality as ModelQuality | undefined, {
      premium: RESUME_MODEL,
      default: RESUME_MODEL,
    })

    const supabase = createServerClient()
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('resume_file_url, experience_years_override')
      .eq('user_id', userId)
      .single()

    if (profileError || !profile || !profile.resume_file_url) {
      return NextResponse.json({ error: 'Resume not found. Please upload a resume first.' }, { status: 404 })
    }

    const { text } = await extractResumeText(profile.resume_file_url)
    const truncated = text.slice(0, 8000)

    console.info(`[ANALYZE] Using model ${selectedModel} (${modelQuality || 'default'}) for user ${userId}`)
    const completion = await openai.chat.completions.create({
      model: selectedModel,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: RESUME_ANALYZER_PROMPT },
        { role: 'user', content: truncated },
      ],
    })

    const content = completion.choices[0]?.message?.content || ''
    if (!content) {
      return NextResponse.json({ error: 'AI returned an empty response' }, { status: 500 })
    }

    let structuredProfile: CandidateProfile
    try {
      structuredProfile = safeParseCandidate(content)
    } catch (error) {
      console.error('Failed to parse candidate profile JSON', content)
      return NextResponse.json({ error: 'AI returned invalid JSON for candidate profile' }, { status: 500 })
    }

    const preferences = formatPreferences(structuredProfile)

    const profileUpdate: Record<string, any> = {
      resume_text: text,
      resume_summary: structuredProfile.summary,
      candidate_profile: structuredProfile,
      job_preferences: preferences.jobPreferences,
      location_preferences: preferences.locationPreferences,
      seniority_preference: preferences.seniorityPreference,
    }

    if ((profile.experience_years_override === null || profile.experience_years_override === undefined) && typeof structuredProfile.total_years_experience === 'number') {
      profileUpdate.experience_years_override = structuredProfile.total_years_experience
    }

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update(profileUpdate)
      .eq('user_id', userId)

    if (updateError) {
      return NextResponse.json({ error: `Failed to save analysis: ${updateError.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      summary: structuredProfile.summary,
      jobPreferences: preferences.jobPreferences,
      locationPreferences: preferences.locationPreferences,
      seniorityPreference: preferences.seniorityPreference,
      candidateProfile: structuredProfile,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
