import { BaseAdapter, NormalizedJob } from './base'
import { Company } from '../database.types'

interface WorkableJob {
  id: string
  title: string
  location?: string
  department?: string
  published_at?: string
  description?: string
  url?: string
  remote?: boolean
}

interface WorkableResponse {
  jobs: WorkableJob[]
}

export class WorkableAdapter extends BaseAdapter {
  async fetchJobs(company: Company): Promise<NormalizedJob[]> {
    if (!company.careers_url) {
      throw new Error(`No careers_url for company ${company.name}`)
    }

    // Extract company slug from Workable URL
    // Examples:
    // https://company.workable.com -> company
    // https://company.workable.com/jobs -> company
    const workableMatch = company.careers_url.match(/https?:\/\/([^\.]+)\.workable\.com/)
    const companySlug = workableMatch ? workableMatch[1] : null

    if (!companySlug) {
      throw new Error(`Invalid Workable URL format: ${company.careers_url}. Expected format: https://company.workable.com`)
    }

    // Try Workable's public API
    let data: WorkableResponse | null = null

    try {
      // Try v3 API first
      const apiUrl = `https://${companySlug}.workable.com/api/v3/jobs`
      
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
            
            // Workable API format varies - check common structures
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
        console.log('Workable API v3 failed, trying v1:', apiError)
      }

      // If v3 didn't work, try v1
      if (!data) {
        try {
          const apiUrlV1 = `https://${companySlug}.workable.com/api/v1/jobs`
          const response = await fetch(apiUrlV1, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          })

          if (response.ok) {
            const contentType = response.headers.get('content-type') || ''
            if (contentType.includes('application/json')) {
              const apiData = await response.json()
              
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
          console.log('Workable API v1 also failed, falling back to scraping:', apiError)
        }
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
        data = await this.scrapeWorkableJobs(html, company.careers_url)
      }
    } catch (error) {
      throw new Error(`Failed to fetch Workable jobs: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    if (!data || !data.jobs) {
      throw new Error('No job data found from Workable')
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
        job_uid: `workable_${job.id}`,
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

  private async scrapeWorkableJobs(html: string, baseUrl: string): Promise<WorkableResponse> {
    const jobs: WorkableJob[] = []
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

    // Fallback: Look for job links in HTML
    if (jobs.length === 0) {
      const jobLinkPattern = /<a[^>]*href=["']([^"']*\/jobs?\/[^"']+)["'][^>]*>[\s\S]{0,500}?([^<]{10,100})[\s\S]{0,500}?<\/a>/gi
      let match
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

