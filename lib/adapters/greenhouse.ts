import { BaseAdapter, NormalizedJob } from './base'
import { Company } from '../database.types'

interface GreenhouseJob {
  id: number
  title: string
  location: {
    name: string
  }
  departments: Array<{
    name: string
  }>
  offices: Array<{
    name: string
  }>
  absolute_url: string
  updated_at: string
  content: string
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[]
}

export class GreenhouseAdapter extends BaseAdapter {
  async fetchJobs(company: Company): Promise<NormalizedJob[]> {
    if (!company.careers_url) {
      throw new Error(`No careers_url for company ${company.name}`)
    }

    // Extract board slug from Greenhouse URL
    // Example: https://job-boards.greenhouse.io/daylight -> daylight
    const urlMatch = company.careers_url.match(/greenhouse\.io\/([^\/]+)/)
    if (!urlMatch) {
      throw new Error(`Invalid Greenhouse URL format: ${company.careers_url}`)
    }

    const boardSlug = urlMatch[1]
    const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${boardSlug}/jobs`

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Greenhouse API error: ${response.status} ${response.statusText}`)
      }

      const data: GreenhouseResponse = await response.json()
      
      return data.jobs.map(job => {
        const location = job.location?.name || null
        const team = job.departments?.[0]?.name || null
        const description = job.content || null
        const descriptionSnippet = description ? description.substring(0, 500) : null

        return {
          job_uid: `greenhouse_${job.id}`,
          title: job.title || 'Untitled',
          team,
          location_raw: location,
          remote_flag: this.extractRemoteFlag(location, job.title, description),
          job_url: job.absolute_url || null,
          posted_at: job.updated_at || null,
          description_snippet: descriptionSnippet,
          full_description: description,
        }
      })
    } catch (error) {
      throw new Error(`Failed to fetch Greenhouse jobs: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}

