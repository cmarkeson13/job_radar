import OpenAI from 'openai'
import { JOB_ANALYZER_PROMPT, JobProfile } from './profile-schema'

const JOB_ANALYZER_MODEL = process.env.OPENAI_JOB_ANALYZER_MODEL || process.env.NEXT_PUBLIC_OPENAI_MODEL || 'gpt-4o-mini'

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

function extractJson(content: string | null | undefined) {
  if (!content) return null
  try {
    return JSON.parse(content)
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch {
        return null
      }
    }
    return null
  }
}

export async function analyzeJobProfile(input: {
  title: string
  company: string
  description?: string | null
  location?: string | null
  seniority?: string | null
  remoteFlag?: boolean | null
}): Promise<JobProfile | null> {
  const description = (input.description || '').trim()
  const descriptionPayload =
    description || 'No formal job description provided. Use the metadata above (title, team, location, company) to infer requirements and keep fields conservative.'

  try {
    const client = getClient()
    const truncatedDescription = descriptionPayload.slice(0, 8000)

    const completion = await client.chat.completions.create({
      model: JOB_ANALYZER_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: JOB_ANALYZER_PROMPT },
        {
          role: 'user',
          content: [
            `Company: ${input.company}`,
            `Job Title: ${input.title}`,
            `Location: ${input.location || 'Not specified'}${input.remoteFlag ? ' (Remote mentioned)' : ''}`,
            input.seniority ? `Seniority hints: ${input.seniority}` : null,
            '---',
            truncatedDescription,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    })

    const payload = completion.choices[0]?.message?.content?.trim()
    const parsed = extractJson(payload)
    if (!parsed) {
      console.warn('[job-analyzer] Failed to parse job profile JSON', { payload })
      return null
    }
    return parsed as JobProfile
  } catch (error) {
    console.error('[job-analyzer] Error analyzing job profile', error)
    return null
  }
}


