import { BaseAdapter, NormalizedJob } from './base'
import { Company } from '../database.types'

interface AshbyJob {
  id: string
  title: string
  locationName?: string
  departmentName?: string
  publishedAt?: string
  description?: string
  url?: string
  isRemote?: boolean
}

interface AshbyResponse {
  jobs: AshbyJob[]
}

export class AshbyAdapter extends BaseAdapter {
  private async scrapeAshbyJobs(html: string, baseUrl: string): Promise<AshbyResponse> {
    const jobs: AshbyJob[] = []
    const foundJobs = new Set<string>()

    // Filter out common page headers/welcome messages
    const excludePatterns = [
      /welcome to .* careers? page/i,
      /open positions? \(\d+\)/i,
      /we're excited/i,
      /explore our current openings/i,
      /join us/i,
      /filters?:/i,
      /department/i,
      /location/i,
      /employment type/i,
      /powered by ashby/i,
    ]

    const isExcluded = (text: string): boolean => {
      return excludePatterns.some(pattern => pattern.test(text))
    }

    // Pattern 1: Look for Ashby job cards - they typically have clickable job titles
    // Ashby uses specific structure with job titles as links
    const ashbyJobCardPattern = /<a[^>]*href=["']([^"']*\/[a-z0-9-]{10,})["'][^>]*>[\s\S]{0,1000}?<[^>]*>([^<]{10,150})<\/[^>]*>[\s\S]{0,500}?<[^>]*>([^<]{5,200})<\/[^>]*>/gi
    
    let match
    while ((match = ashbyJobCardPattern.exec(html)) !== null) {
      const href = match[1]
      const title = (match[2] || match[3] || '').trim()
      
      if (title && !isExcluded(title) && title.length > 10 && title.length < 150 &&
          !title.match(/^(apply|view|see|more|jobs?|careers?|home|about|contact|filters?)$/i) &&
          !title.match(/^(department|location|employment type|full time|part time|on-site|remote|hybrid)$/i)) {
        const jobId = this.extractJobId(href) || this.hashString(title)
        if (!foundJobs.has(jobId)) {
          foundJobs.add(jobId)
          
          // Extract location and department from the context (usually in the same card)
          const context = html.substring(Math.max(0, match.index - 500), Math.min(html.length, match.index + 1000))
          const location = this.extractLocationFromContext(context)
          const department = this.extractDepartmentFromContext(context)
          
          const fullUrl = href.startsWith('http') ? href : 
                          href.startsWith('/') ? `${baseUrl.replace(/\/$/, '')}${href}` :
                          `${baseUrl}/${jobId}`
          
          jobs.push({
            id: jobId,
            title: this.normalizeText(title) || 'Untitled',
            locationName: location,
            departmentName: department,
            publishedAt: null,
            description: null,
            url: fullUrl,
            isRemote: this.extractRemoteFlag(location, title, null) === true,
          })
        }
      }
    }

    // Pattern 2: Look for job titles in structured format (Ashby often uses specific div structures)
    // Look for patterns like: <div>Job Title</div> followed by department/location info
    const structuredJobPattern = /<[^>]*>([A-Z][^<]{10,100})<\/[^>]*>[\s\S]{0,300}?(?:department|location|engineering|product|business|operations|gtm|policy)/gi
    while ((match = structuredJobPattern.exec(html)) !== null) {
      const title = match[1].trim()
      
      if (!isExcluded(title) && title.length > 10 && title.length < 150 &&
          !title.match(/^(apply|view|see|more|jobs?|careers?|open positions?)$/i)) {
        const jobId = this.hashString(title)
        if (!foundJobs.has(jobId)) {
          foundJobs.add(jobId)
          
          const context = html.substring(Math.max(0, match.index - 200), Math.min(html.length, match.index + 500))
          const location = this.extractLocationFromContext(context)
          const department = this.extractDepartmentFromContext(context)
          
          jobs.push({
            id: jobId,
            title: this.normalizeText(title) || 'Untitled',
            locationName: location,
            departmentName: department,
            publishedAt: null,
            description: null,
            url: `${baseUrl}/${jobId}`,
            isRemote: this.extractRemoteFlag(location, title, null) === true,
          })
        }
      }
    }

    // Pattern 3: Look for job links in the HTML (more generic, but filtered)
    const jobLinkPattern = /<a[^>]*href=["']([^"']*\/[a-z0-9-]{10,})["'][^>]*>([^<]{10,150})<\/a>/gi
    while ((match = jobLinkPattern.exec(html)) !== null) {
      const href = match[1]
      const title = match[2].trim()
      
      // Filter out navigation, headers, and non-job links
      if (title && !isExcluded(title) && title.length > 10 && title.length < 150 && 
          !title.match(/^(apply|view|see|more|jobs?|careers?|home|about|contact|filters?|department|location|employment type)$/i) &&
          !href.match(/\/(home|about|contact|blog|news|privacy|security)/i)) {
        const jobId = this.extractJobId(href) || this.hashString(href + title)
        if (!foundJobs.has(jobId)) {
          foundJobs.add(jobId)
          
          const context = html.substring(Math.max(0, match.index - 300), Math.min(html.length, match.index + 500))
          const location = this.extractLocationFromContext(context)
          const department = this.extractDepartmentFromContext(context)
          const fullUrl = href.startsWith('http') ? href : 
                          href.startsWith('/') ? `${baseUrl.replace(/\/$/, '')}${href}` :
                          `${baseUrl}/${jobId}`
          
          jobs.push({
            id: jobId,
            title: this.normalizeText(title) || 'Untitled',
            locationName: location,
            departmentName: department,
            publishedAt: null,
            description: null,
            url: fullUrl,
            isRemote: this.extractRemoteFlag(location, title, null) === true,
          })
        }
      }
    }

    // Pattern 4: Look for structured job data in script tags (Ashby sometimes embeds this)
    const scriptPattern = /<script[^>]*>(.*?)<\/script>/gs
    let scriptMatch
    while ((scriptMatch = scriptPattern.exec(html)) !== null) {
      const scriptContent = scriptMatch[1]
      
      // Look for job arrays or objects - try multiple patterns
      const patterns = [
        /(?:jobs|postings|openings)\s*[:=]\s*(\[[\s\S]{10,50000}\])/i,
        /window\.__INITIAL_STATE__\s*=\s*({[\s\S]{10,50000}})/i,
        /"jobs"\s*:\s*(\[[\s\S]{10,50000}\])/i,
        /postings\s*:\s*(\[[\s\S]{10,50000}\])/i,
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
                      locationName: item.location || item.locationName || item.locationText || null,
                      departmentName: item.department || item.team || item.departmentName || null,
                      publishedAt: item.publishedAt || item.createdAt || item.postedAt || null,
                      description: item.description || item.content || item.body || null,
                      url: item.url || item.applyUrl || item.hostedUrl || `${baseUrl}/${jobId}`,
                      isRemote: item.isRemote || item.remote || item.remoteFlag || null,
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

    // Pattern 5: Look for job cards with data attributes
    const jobCardPattern = /<[^>]*data-job-id=["']([^"']+)["'][^>]*>[\s\S]*?<[^>]*class=["'][^"']*title[^"']*["'][^>]*>([^<]+)<\/[^>]*>/gi
    while ((match = jobCardPattern.exec(html)) !== null) {
      const jobId = match[1]
      const title = match[2].trim()
      
      if (title && !foundJobs.has(jobId)) {
        foundJobs.add(jobId)
        jobs.push({
          id: jobId,
          title: this.normalizeText(title) || 'Untitled',
          locationName: null,
          departmentName: null,
          publishedAt: null,
          description: null,
          url: `${baseUrl}/jobs/${jobId}`,
          isRemote: null,
        })
      }
    }

    // Pattern 5: Look for any text that looks like a job title (fallback, but heavily filtered)
    // This is more aggressive and might catch jobs even if structure is unusual
    if (jobs.length === 0) {
      // Look for headings or strong text that might be job titles
      const titlePatterns = [
        /<h[2-4][^>]*>([^<]{10,100})<\/h[2-4]>/gi, // h2-h4 are more likely to be job titles
        /<[^>]*class=["'][^"']*title[^"']*["'][^>]*>([^<]{10,100})<\/[^>]*>/gi,
        /<strong[^>]*>([^<]{10,100})<\/strong>/gi,
      ]
      
      for (const pattern of titlePatterns) {
        let titleMatch
        while ((titleMatch = pattern.exec(html)) !== null) {
          const title = titleMatch[1].trim()
          // Filter out common non-job titles and page headers
          if (!isExcluded(title) && title.length > 10 && title.length < 100 &&
              !title.match(/^(open positions|careers|jobs|we're hiring|join us|about|contact|home|filters?)$/i) &&
              !title.match(/^[A-Z\s]{0,3}$/) && // Not all caps short text
              title.match(/[a-z]/i) && // Has letters
              title.match(/\b(engineer|manager|lead|director|assistant|analyst|specialist|coordinator|developer|designer)\b/i)) { // Has job title keywords
            const jobId = this.hashString(title)
            if (!foundJobs.has(jobId)) {
              foundJobs.add(jobId)
              const context = html.substring(Math.max(0, titleMatch.index - 300), Math.min(html.length, titleMatch.index + 500))
              const location = this.extractLocationFromContext(context)
              const department = this.extractDepartmentFromContext(context)
              jobs.push({
                id: jobId,
                title: this.normalizeText(title) || 'Untitled',
                locationName: location,
                departmentName: department,
                publishedAt: null,
                description: null,
                url: `${baseUrl}/${jobId}`,
                isRemote: this.extractRemoteFlag(location, title, null) === true,
              })
            }
          }
        }
      }
    }

    return { jobs }
  }

  private extractJobId(href: string): string | null {
    // Extract job ID from URL patterns like /jobs/123 or #job-123
    const patterns = [
      /\/jobs\/([^\/\?]+)/,
      /#job[_-]?([^"'\s]+)/,
      /job[_-]?([a-z0-9-]+)/i,
    ]
    
    for (const pattern of patterns) {
      const match = href.match(pattern)
      if (match) return match[1]
    }
    
    // Fallback: hash the href
    return this.hashString(href)
  }

  private extractLocationNearMatch(html: string, matchIndex: number): string | null {
    // Look for location text within 300 chars before or after the match
    const contextStart = Math.max(0, matchIndex - 300)
    const contextEnd = Math.min(html.length, matchIndex + 300)
    const context = html.substring(contextStart, contextEnd)
    return this.extractLocationFromContext(context)
  }

  private extractLocationFromContext(context: string): string | null {
    // Ashby often formats locations like: "Bay Area; Boston; Washington D.C."
    const locationPatterns = [
      /(Bay Area|San Francisco|Boston|Washington D\.C\.|New York|Austin|Seattle|Los Angeles|Chicago|Denver|Atlanta|Miami|Portland|Philadelphia)(?:\s*;\s*(?:Bay Area|San Francisco|Boston|Washington D\.C\.|New York|Austin|Seattle|Los Angeles|Chicago|Denver|Atlanta|Miami|Portland|Philadelphia))*/, // Multiple locations
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2})/, // City, State format
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+[A-Z]{2})/, // City State format
      /(Remote|On-site|Hybrid)/i,
    ]

    for (const pattern of locationPatterns) {
      const match = context.match(pattern)
      if (match) {
        return match[0].trim()
      }
    }

    return null
  }

  private extractDepartmentFromContext(context: string): string | null {
    // Ashby shows departments like: "Engineering • Bay Area; Boston..."
    const departmentPatterns = [
      /(Engineering|Product|Business Operations|Go-to-Market|GTM|Policy & Regulatory Affairs|Sales|Marketing|Design|Operations)/i,
    ]

    for (const pattern of departmentPatterns) {
      const match = context.match(pattern)
      if (match) {
        return match[1]
      }
    }

    return null
  }

  private hashString(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36)
  }
  async fetchJobs(company: Company): Promise<NormalizedJob[]> {
    if (!company.careers_url) {
      throw new Error(`No careers_url for company ${company.name}`)
    }

    // Extract company identifier from Ashby URL
    // Examples:
    // https://jobs.ashbyhq.com/company -> company
    // https://company.ashbyhq.com -> company
    let companySlug: string | null = null
    
    const patterns = [
      /jobs\.ashbyhq\.com\/([^\/\?]+)/,  // https://jobs.ashbyhq.com/valarlabs
      /ashbyhq\.com\/([^\/\?]+)/,        // https://ashbyhq.com/company
      /([^\.]+)\.ashbyhq\.com/,          // https://company.ashbyhq.com
    ]

    for (const pattern of patterns) {
      const match = company.careers_url.match(pattern)
      if (match) {
        companySlug = match[1]
        break
      }
    }

    if (!companySlug) {
      throw new Error(`Invalid Ashby URL format: ${company.careers_url}. Expected format: https://jobs.ashbyhq.com/companyname`)
    }

    // Ashby often doesn't have a public API, so we need to scrape the page
    // Try to find JSON data in the page source first
    let data: AshbyResponse | null = null

    try {
      // First, try to fetch the careers page and look for embedded JSON
      const pageResponse = await fetch(company.careers_url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })
      const html = await pageResponse.text()

      // Look for JSON-LD structured data
      const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/s)
      if (jsonLdMatch) {
        try {
          const jsonLd = JSON.parse(jsonLdMatch[1])
          // Transform if needed
          if (jsonLd['@type'] === 'JobPosting' || Array.isArray(jsonLd)) {
            // Handle structured data format
          }
        } catch {}
      }

      // Look for embedded job data in script tags
      const scriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gs)
      if (scriptMatches) {
        for (const script of scriptMatches) {
          // Look for job data patterns
          const jobDataMatch = script.match(/(?:jobs|postings|openings)\s*[:=]\s*(\[[\s\S]*?\])/i)
          if (jobDataMatch) {
            try {
              const parsed = JSON.parse(jobDataMatch[1])
              if (Array.isArray(parsed) && parsed.length > 0) {
                data = { jobs: parsed }
                break
              }
            } catch {}
          }
        }
      }

      // If no embedded data found, try API endpoints
      if (!data) {
        // Try JSON endpoint
        const jsonUrl = `https://jobs.ashbyhq.com/${companySlug}.json`
        try {
          const response = await fetch(jsonUrl, {
            headers: { 'Accept': 'application/json' },
          })
          const contentType = response.headers.get('content-type') || ''
          if (response.ok && contentType.includes('application/json')) {
            data = await response.json()
          }
        } catch {}

        // Try API endpoint if JSON didn't work
        if (!data) {
          const apiUrl = `https://jobs.ashbyhq.com/api/non-user-postings?organizationHost=${companySlug}`
          try {
            const response = await fetch(apiUrl, {
              headers: { 'Accept': 'application/json' },
            })
            const contentType = response.headers.get('content-type') || ''
            if (response.ok && contentType.includes('application/json')) {
              const altData = await response.json()
              if (altData.postings) {
                data = { jobs: altData.postings }
              } else {
                data = altData as AshbyResponse
              }
            }
          } catch {}
        }
      }

      // If still no data, fall back to HTML scraping
      if (!data) {
        data = await this.scrapeAshbyJobs(html, company.careers_url)
      }
    } catch (error) {
      throw new Error(`Failed to fetch Ashby jobs: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    if (!data || !data.jobs) {
      throw new Error('No job data found from Ashby')
    }

    return data.jobs.map(job => {
        const location = job.locationName || null
        const team = job.departmentName || null
        const description = job.description || null
        const descriptionSnippet = description ? description.substring(0, 500) : null
        const jobUrl = job.url || `${company.careers_url}/${job.id}`

        // Determine remote flag - Ashby sometimes has isRemote field
        let remoteFlag: boolean | null = null
        if (job.isRemote !== undefined) {
          remoteFlag = job.isRemote
        } else {
          remoteFlag = this.extractRemoteFlag(location, job.title, description)
        }

        return {
          job_uid: `ashby_${job.id}`,
          title: job.title || 'Untitled',
          team,
          location_raw: location,
          remote_flag: remoteFlag,
          job_url: jobUrl,
          posted_at: job.publishedAt || null,
          description_snippet: descriptionSnippet,
          full_description: description,
        }
      })
  }
}

