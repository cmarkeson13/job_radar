import { BaseAdapter, NormalizedJob } from './base'
import { Company } from '../database.types'

interface LeverJob {
  id: string
  text: string
  categories: {
    location?: string
    team?: string
    commitment?: string
  }
  createdAt: number
  description: string
  descriptionPlain: string
  applyUrl?: string
  hostedUrl?: string
  lists: Array<{
    text: string
    content: string
  }>
}

export class LeverAdapter extends BaseAdapter {
  async fetchJobs(company: Company): Promise<NormalizedJob[]> {
    if (!company.careers_url) {
      throw new Error(`No careers_url for company ${company.name}`)
    }

    // Extract company identifier from Lever URL
    // Examples:
    // https://jobs.lever.co/company -> company
    // https://company.lever.co -> company
    // https://lever.co/company -> company
    // https://jobs.lever.co -> use company slug from database
    let companySlug: string | null = null
    
    const patterns = [
      /jobs\.lever\.co\/([^\/\?]+)/,  // https://jobs.lever.co/company
      /lever\.co\/([^\/\?]+)/,        // https://lever.co/company
      /([^\.]+)\.lever\.co/,          // https://company.lever.co
    ]

    for (const pattern of patterns) {
      const match = company.careers_url.match(pattern)
      if (match) {
        companySlug = match[1]
        break
      }
    }

    // If no slug found in URL, try to extract from the page or use database slug
    if (!companySlug) {
      // Check if URL is just the base Lever domain
      if (company.careers_url.includes('jobs.lever.co') && !company.careers_url.match(/jobs\.lever\.co\/[^\/]/)) {
        // Try to extract company identifier from the HTML page
        try {
          const pageResponse = await fetch(company.careers_url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          })
          const html = await pageResponse.text()
          
          // Look for Lever API calls in the page source
          const apiMatch = html.match(/api\.lever\.co\/v0\/postings\/([^"'\s]+)/)
          if (apiMatch) {
            companySlug = apiMatch[1]
          } else {
            // Try using company slug from database, but normalize it
            // Lever slugs are usually lowercase, no spaces, no special chars
            companySlug = company.slug.toLowerCase().replace(/[^a-z0-9]+/g, '')
          }
        } catch {
          // Fallback to normalized database slug
          companySlug = company.slug.toLowerCase().replace(/[^a-z0-9]+/g, '')
        }
      } else {
        throw new Error(`Invalid Lever URL format: ${company.careers_url}. Expected format: https://jobs.lever.co/companyname`)
      }
    }

    const apiUrl = `https://api.lever.co/v0/postings/${companySlug}`

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Lever API error: ${response.status} ${response.statusText}`)
      }

      const data: LeverJob[] = await response.json()
      
      return data.map(job => {
        const location = job.categories?.location || null
        const team = job.categories?.team || null
        let description = job.description || job.descriptionPlain || null
        
        // Clean HTML from description
        if (description) {
          description = this.stripHtml(description)
        }
        
        const descriptionSnippet = description ? description.substring(0, 500) : null
        const jobUrl = job.hostedUrl || job.applyUrl || `https://jobs.lever.co/${companySlug}/${job.id}`

        // Convert createdAt timestamp to ISO string
        const postedAt = job.createdAt ? new Date(job.createdAt).toISOString() : null

        return {
          job_uid: `lever_${job.id}`,
          title: job.text || 'Untitled',
          team,
          location_raw: location,
          remote_flag: this.extractRemoteFlag(location, job.text, description),
          job_url: jobUrl,
          posted_at: postedAt,
          description_snippet: descriptionSnippet,
          full_description: description,
        }
      })
    } catch (error) {
      throw new Error(`Failed to fetch Lever jobs: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private stripHtml(html: string): string {
    // Remove HTML tags but preserve line breaks
    return html
      .replace(/<br\s*\/?>/gi, '\n')  // Convert <br> to newlines
      .replace(/<\/p>/gi, '\n\n')     // Convert </p> to double newlines
      .replace(/<\/div>/gi, '\n')     // Convert </div> to newlines
      .replace(/<[^>]+>/g, '')        // Remove all other HTML tags
      .replace(/&nbsp;/g, ' ')        // Convert &nbsp; to spaces
      .replace(/&amp;/g, '&')         // Decode HTML entities
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Collapse multiple newlines
      .trim()
  }
}

