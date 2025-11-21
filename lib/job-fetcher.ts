import { createServerClient } from './supabase'
import { getAdapter } from './adapters'
import { Company, Job, Platform } from './database.types'

export async function fetchJobsForCompany(companyId: string): Promise<{ success: boolean; jobsAdded: number; jobsUpdated: number; error?: string }> {
  const supabase = createServerClient()

  // Get company
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single()

  if (companyError || !company) {
    return { success: false, jobsAdded: 0, jobsUpdated: 0, error: `Company not found: ${companyId}` }
  }

  try {
    const adapter = getAdapter(company.platform_key)
    const normalizedJobs = await adapter.fetchJobs(company)

    let jobsAdded = 0
    let jobsUpdated = 0

    for (const normalizedJob of normalizedJobs) {
      // Check if job already exists
      const { data: existingJob } = await supabase
        .from('jobs')
        .select('id')
        .eq('company_id', companyId)
        .eq('job_uid', normalizedJob.job_uid)
        .single()

      const jobData = {
        company_id: companyId,
        job_uid: normalizedJob.job_uid,
        title: normalizedJob.title,
        team: normalizedJob.team,
        location_raw: normalizedJob.location_raw,
        remote_flag: normalizedJob.remote_flag,
        job_url: normalizedJob.job_url,
        source_platform: company.platform_key as Platform,
        posted_at: normalizedJob.posted_at,
        description_snippet: normalizedJob.description_snippet,
        full_description: normalizedJob.full_description,
        last_seen_open_at: new Date().toISOString(),
        closed_flag: false,
      }

      if (existingJob) {
        // Update existing job
        await supabase
          .from('jobs')
          .update(jobData)
          .eq('id', existingJob.id)
        jobsUpdated++
      } else {
        // Insert new job
        await supabase
          .from('jobs')
          .insert({
            ...jobData,
            status: 'New',
            detected_at: new Date().toISOString(),
          })
        jobsAdded++
      }
    }

    // Mark jobs as closed if they're no longer in the fetched list
    const fetchedJobUids = normalizedJobs.map(j => j.job_uid)
    const { data: allCompanyJobs } = await supabase
      .from('jobs')
      .select('id, job_uid')
      .eq('company_id', companyId)
      .eq('closed_flag', false)

    if (allCompanyJobs) {
      for (const job of allCompanyJobs) {
        if (!fetchedJobUids.includes(job.job_uid)) {
          await supabase
            .from('jobs')
            .update({ closed_flag: true })
            .eq('id', job.id)
        }
      }
    }

    // Update company's last_checked_at and clear any previous error
    await supabase
      .from('companies')
      .update({ 
        last_checked_at: new Date().toISOString(),
        last_fetch_error: null, // Clear error on success
      })
      .eq('id', companyId)

    // Log success
    await supabase.from('logs').insert({
      level: 'info',
      company_id: companyId,
      module: 'fetch_jobs',
      message: `Fetched ${normalizedJobs.length} jobs (${jobsAdded} new, ${jobsUpdated} updated)`,
      details_json: { jobsAdded, jobsUpdated, totalJobs: normalizedJobs.length },
    })

    return { success: true, jobsAdded, jobsUpdated }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    // Store error on company record
    await supabase
      .from('companies')
      .update({ 
        last_fetch_error: errorMessage,
        last_checked_at: new Date().toISOString(), // Still update checked time
      })
      .eq('id', companyId)
    
    // Log error
    await supabase.from('logs').insert({
      level: 'error',
      company_id: companyId,
      module: 'fetch_jobs',
      message: `Failed to fetch jobs: ${errorMessage}`,
      details_json: { error: errorMessage },
    })

    return { success: false, jobsAdded: 0, jobsUpdated: 0, error: errorMessage }
  }
}

// In-memory progress store for browser console logging
const progressStore = new Map<string, {
  total: number
  completed: number
  success: number
  failed: number
  current?: string
  logs: Array<{ time: number; message: string }>
  errors: string[]
  finished: boolean
}>()

export function getBulkFetchProgress(sessionId: string) {
  return progressStore.get(sessionId) || null
}

export function clearBulkFetchProgress(sessionId: string) {
  progressStore.delete(sessionId)
}

// Clean up old progress entries (older than 1 hour)
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000
  for (const [sessionId, progress] of progressStore.entries()) {
    if (progress.finished && progress.logs.length > 0) {
      const lastLogTime = progress.logs[progress.logs.length - 1]?.time || 0
      if (lastLogTime < oneHourAgo) {
        progressStore.delete(sessionId)
      }
    }
  }
}, 5 * 60 * 1000) // Check every 5 minutes

function addProgressLog(sessionId: string, message: string) {
  const progress = progressStore.get(sessionId)
  if (progress) {
    progress.logs.push({ time: Date.now(), message })
    // Keep only last 100 logs to prevent memory issues
    if (progress.logs.length > 100) {
      progress.logs.shift()
    }
  }
}

export async function fetchJobsForAllCompanies(
  forceAll: boolean = false,
  sessionId?: string
): Promise<{ total: number; success: number; failed: number; errors?: string[]; sessionId?: string }> {
  const supabase = createServerClient()
  const fetchSessionId = sessionId || `fetch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  let companies
  let error

  if (forceAll) {
    // Fetch ALL companies when explicitly requested
    const result = await supabase
      .from('companies')
      .select('id, name')
    companies = result.data
    error = result.error
  } else {
    // Get all companies that haven't been checked in the last 7 days
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const result = await supabase
      .from('companies')
      .select('id, name')
      .or(`last_checked_at.is.null,last_checked_at.lt.${sevenDaysAgo.toISOString()}`)
    companies = result.data
    error = result.error
  }

  if (error || !companies) {
    console.error('Error fetching companies:', error)
    return { total: 0, success: 0, failed: 0 }
  }

  // Initialize progress
  progressStore.set(fetchSessionId, {
    total: companies.length,
    completed: 0,
    success: 0,
    failed: 0,
    logs: [],
    errors: [],
    finished: false,
  })

  addProgressLog(fetchSessionId, `Starting fetch for ${companies.length} companies...`)

  let success = 0
  let failed = 0
  const startTime = Date.now()
  const errors: string[] = []
  
  // Process companies in parallel batches (5 at a time for rate limiting)
  const BATCH_SIZE = 5
  const DELAY_BETWEEN_BATCHES = 500 // 500ms between batches
  
  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE)
    const batchPromises = batch.map(async (company) => {
      const companyStartTime = Date.now()
      const companyName = company.name || company.id
      
      // Update current company being processed
      const progress = progressStore.get(fetchSessionId)
      if (progress) {
        progress.current = companyName
      }
      const currentIndex = progress ? progress.completed + 1 : i + 1
      addProgressLog(fetchSessionId, `[${currentIndex}/${companies.length}] Fetching: ${companyName}`)
      
      const res = await fetchJobsForCompany(company.id)
      const companyElapsed = ((Date.now() - companyStartTime) / 1000).toFixed(1)
      
      // Update progress after completion
      const progressAfter = progressStore.get(fetchSessionId)
      if (progressAfter) {
        if (res.success) {
          success++
          progressAfter.success++
          progressAfter.completed++
          addProgressLog(fetchSessionId, `✓ ${companyName}: ${res.jobsAdded} new, ${res.jobsUpdated} updated (${companyElapsed}s)`)
        } else {
          failed++
          const errorMsg = res.error || 'Unknown error'
          errors.push(`${companyName}: ${errorMsg}`)
          progressAfter.failed++
          progressAfter.completed++
          progressAfter.errors.push(`${companyName}: ${errorMsg}`)
          addProgressLog(fetchSessionId, `✗ ${companyName}: ${errorMsg} (${companyElapsed}s)`)
        }
        progressAfter.current = undefined // Clear current after completion
      }
    })
    
    // Wait for all companies in this batch to complete
    await Promise.all(batchPromises)
    
    // Small delay between batches to be respectful to servers
    if (i + BATCH_SIZE < companies.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES))
    }
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  addProgressLog(fetchSessionId, `Complete: ${success} succeeded, ${failed} failed in ${totalElapsed}s`)
  
  const progress = progressStore.get(fetchSessionId)
  if (progress) {
    progress.finished = true
    progress.current = undefined
  }

  return { 
    total: companies.length, 
    success, 
    failed, 
    errors: errors.length > 0 ? errors : undefined,
    sessionId: fetchSessionId
  }
}

