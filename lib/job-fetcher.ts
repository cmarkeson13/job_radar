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

    // Update company's last_checked_at
    await supabase
      .from('companies')
      .update({ last_checked_at: new Date().toISOString() })
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

export async function fetchJobsForAllCompanies(): Promise<void> {
  const supabase = createServerClient()

  // Get all companies that haven't been checked in the last 7 days
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data: companies, error } = await supabase
    .from('companies')
    .select('id')
    .or(`last_checked_at.is.null,last_checked_at.lt.${sevenDaysAgo.toISOString()}`)

  if (error || !companies) {
    console.error('Error fetching companies:', error)
    return
  }

  for (const company of companies) {
    await fetchJobsForCompany(company.id)
    // Small delay between companies to be respectful
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

