import { BaseAdapter, NormalizedJob } from './base'
import { Company } from '../database.types'

interface PolymerJob {
  id: string
  title: string
  location?: string
  department?: string
  published_at?: string
  description?: string
  url?: string
  remote?: boolean
}

interface PolymerResponse {
  jobs: PolymerJob[]
}

export class PolymerAdapter extends BaseAdapter {
  async fetchJobs(company: Company): Promise<NormalizedJob[]> {
    if (!company.careers_url) {
      throw new Error(`No careers_url for company ${company.name}`)
    }

    // Extract company slug from Polymer URL
    // Examples:
    // https://jobs.polymer.co/company-name -> company-name
    const polymerMatch = company.careers_url.match(/jobs\.polymer\.co\/([^\/\?]+)/)
    const companySlug = polymerMatch ? polymerMatch[1] : null

    if (!companySlug) {
      throw new Error(`Invalid Polymer URL format: ${company.careers_url}. Expected format: https://jobs.polymer.co/company-name`)
    }

    // Try Polymer's API endpoint (if it exists)
    let data: PolymerResponse | null = null

    try {
      // Try API endpoint
      const apiUrl = `https://jobs.polymer.co/api/${companySlug}/jobs`
      
      try {
        const response = await fetch(apiUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        })

        if (response.ok) {
          const contentType = response.headers.get('content-type') || ''
          if (contentType.includes('application/json')) {
            const apiData = await response.json()
            
            // Polymer API format - check common structures
            if (apiData.jobs && Array.isArray(apiData.jobs)) {
              data = { jobs: apiData.jobs }
            } else if (apiData.results && Array.isArray(apiData.results)) {
              data = { jobs: apiData.results }
            } else if (Array.isArray(apiData)) {
              data = { jobs: apiData }
            }
          }
        }
      } catch (apiError) {
        console.log('Polymer API failed, falling back to scraping:', apiError)
      }

      // If API didn't work, try scraping
      if (!data) {
        const pageResponse = await fetch(company.careers_url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        })
        if (!pageResponse.ok) {
          throw new Error(`HTTP ${pageResponse.status}: ${pageResponse.statusText}`)
        }
        const html = await pageResponse.text()
        data = await this.scrapePolymerJobs(html, company.careers_url)
      }
    } catch (error) {
      throw new Error(`Failed to fetch Polymer jobs: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    if (!data || !data.jobs) {
      throw new Error('No job data found from Polymer')
    }

    return data.jobs.map(job => {
      const location = job.location || null
      const team = job.department || null
      const description = job.description || null
      const descriptionSnippet = description ? description.substring(0, 500) : null
      const jobUrl = job.url || `${company.careers_url}/${job.id}`

      // Determine remote flag
      let remoteFlag: boolean | null = null
      if (job.remote !== undefined) {
        remoteFlag = job.remote
      } else {
        remoteFlag = this.extractRemoteFlag(location, job.title, description)
      }

      return {
        job_uid: `polymer_${job.id}`,
        title: job.title || 'Untitled',
        team,
        location_raw: location,
        remote_flag: remoteFlag,
        job_url: jobUrl,
        posted_at: job.published_at || null,
        description_snippet: descriptionSnippet,
        full_description: description,
      }
    })
  }

  private async scrapePolymerJobs(html: string, baseUrl: string): Promise<PolymerResponse> {
    const jobs: PolymerJob[] = []
    const foundJobs = new Set<string>()

    // Try to find JSON-LD structured data
    const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    let jsonLdMatch
    while ((jsonLdMatch = jsonLdPattern.exec(html)) !== null) {
      try {
        const jsonData = JSON.parse(jsonLdMatch[1])
        if (jsonData['@type'] === 'JobPosting' || (Array.isArray(jsonData) && jsonData.some((item: any) => item['@type'] === 'JobPosting'))) {
          const jobPostings = Array.isArray(jsonData) ? jsonData : [jsonData]
          for (const posting of jobPostings) {
            if (posting['@type'] === 'JobPosting') {
              const jobId = posting.identifier?.value || posting.url || this.hashString(posting.title || '')
              if (!foundJobs.has(jobId)) {
                foundJobs.add(jobId)
                jobs.push({
                  id: jobId,
                  title: posting.title || 'Untitled',
                  location: posting.jobLocation?.address?.addressLocality || posting.jobLocation?.name || null,
                  department: posting.department || null,
                  published_at: posting.datePosted || null,
                  description: posting.description || null,
                  url: posting.url || null,
                  remote: posting.jobLocation?.name?.toLowerCase().includes('remote') || null,
                })
              }
            }
          }
        }
      } catch (e) {
        // Invalid JSON, continue
      }
    }

    // Try to find embedded JSON in script tags
    const scriptPattern = /<script[^>]*>(.*?)<\/script>/gs
    let scriptMatch
    while ((scriptMatch = scriptPattern.exec(html)) !== null) {
      const scriptContent = scriptMatch[1]
      
      // Look for job arrays or objects
      const patterns = [
        /(?:jobs|postings|openings)\s*[:=]\s*(\[[\s\S]{10,50000}\])/i,
        /window\.__INITIAL_STATE__\s*=\s*({[\s\S]{10,50000}})/i,
        /"jobs"\s*:\s*(\[[\s\S]{10,50000}\])/i,
        /polymer.*jobs\s*[:=]\s*(\[[\s\S]{10,50000}\])/i,
      ]
      
      for (const pattern of patterns) {
        const jobArrayMatch = scriptContent.match(pattern)
        if (jobArrayMatch) {
          try {
            const parsed = JSON.parse(jobArrayMatch[1])
            let jobArray = Array.isArray(parsed) ? parsed : 
                          parsed.jobs ? parsed.jobs :
                          parsed.postings ? parsed.postings :
                          parsed.data?.jobs ? parsed.data.jobs : null
            
            if (jobArray && Array.isArray(jobArray)) {
              for (const item of jobArray) {
                if (item.title || item.name || item.text) {
                  const jobId = item.id || item.slug || item.key || this.hashString(item.title || item.name || item.text)
                  if (!foundJobs.has(jobId)) {
                    foundJobs.add(jobId)
                    jobs.push({
                      id: jobId,
                      title: item.title || item.name || item.text || 'Untitled',
                      location: item.location || item.locationName || item.locationText || null,
                      department: item.department || item.team || item.departmentName || null,
                      published_at: item.publishedAt || item.createdAt || item.postedAt || null,
                      description: item.description || item.content || item.body || null,
                      url: item.url || item.applyUrl || item.hostedUrl || `${baseUrl}/${jobId}`,
                      remote: item.isRemote || item.remote || item.remoteFlag || null,
                    })
                  }
                }
              }
              break // Found jobs, no need to try other patterns
            }
          } catch (e) {
            // Try next pattern
          }
        }
      }
    }

    // Fallback: Look for Polymer-specific job card structures
    if (jobs.length === 0) {
      // Pattern 1: Look for job cards with data attributes
      const jobCardPattern = /<[^>]*data-job-id=["']([^"']+)["'][^>]*>[\s\S]*?<[^>]*class=["'][^"']*title[^"']*["'][^>]*>([^<]+)<\/[^>]*>/gi
      let match
      while ((match = jobCardPattern.exec(html)) !== null) {
        const jobId = match[1]
        const title = match[2].trim()
        
        if (title && !foundJobs.has(jobId)) {
          foundJobs.add(jobId)
          jobs.push({
            id: jobId,
            title: this.normalizeText(title) || 'Untitled',
            location: null,
            department: null,
            published_at: null,
            description: null,
            url: `${baseUrl}/${jobId}`,
            remote: null,
          })
        }
      }

      // Pattern 2: Look for job links
      const jobLinkPattern = /<a[^>]*href=["']([^"']*\/jobs?\/[^"']+)["'][^>]*>[\s\S]{0,500}?([^<]{10,100})[\s\S]{0,500}?<\/a>/gi
      match = null
      while ((match = jobLinkPattern.exec(html)) !== null) {
        const href = match[1]
        const title = match[2].trim()
        
        if (title && title.length > 10 && title.length < 150) {
          const jobId = this.hashString(href + title)
          if (!foundJobs.has(jobId)) {
            foundJobs.add(jobId)
            const fullUrl = href.startsWith('http') ? href : 
                            href.startsWith('/') ? `${baseUrl.replace(/\/$/, '')}${href}` :
                            `${baseUrl}/${href}`
            
            jobs.push({
              id: jobId,
              title: this.normalizeText(title) || 'Untitled',
              location: null,
              department: null,
              published_at: null,
              description: null,
              url: fullUrl,
              remote: null,
            })
          }
        }
      }
    }

    return { jobs }
  }

  private hashString(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(36)
  }
}

