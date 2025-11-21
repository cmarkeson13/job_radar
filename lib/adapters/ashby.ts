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

    // Pattern 0: Company site lists headings and "Apply for position" links to jobs.ashbyhq.com
    // Example structure: <h3>Job Title</h3> ... <a href="https://jobs.ashbyhq.com/{slug}/{jobId}">Apply for position</a>
    const hostedLinkBlock = /<h3[^>]*>([^<]{5,200})<\/h3>[\s\S]{0,600}?<a[^>]*href=["'](https?:\/\/jobs\.ashbyhq\.com\/[a-z0-9-]+\/[a-z0-9-]+)["'][^>]*>[^<]{0,80}<\/a>/gi
    let hostedMatch: RegExpExecArray | null = null
    while ((hostedMatch = hostedLinkBlock.exec(html)) !== null) {
      const titleRaw = hostedMatch[1].trim()
      const url = hostedMatch[2]
      const idMatch = url.match(/\/([a-z0-9-]+)$/i)
      const jobId = idMatch ? idMatch[1] : this.hashString(url)

      const cleanTitle = titleRaw
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()

      if (cleanTitle && cleanTitle.length >= 5 && !foundJobs.has(jobId)) {
        foundJobs.add(jobId)
        jobs.push({
          id: jobId,
          title: this.normalizeText(cleanTitle) || 'Untitled',
          locationName: null,
          departmentName: null,
          publishedAt: null,
          description: null,
          url,
          isRemote: this.extractRemoteFlag(null, cleanTitle, null) === true,
        })
      }
    }

    // Filter out common page headers/welcome messages and non-job entries
    const excludePatterns = [
      /welcome to .* careers? page/i,
      /open positions? \(\d+\)/i,
      /we're excited/i,
      /explore our current openings/i,
      /join us/i,
      /filters?:/i,
      /powered by ashby/i,
      /talent community/i,
      /talent network/i,
      /join our talent/i,
      /general application/i,
      /general interest/i,
      /future opportunities/i,
      /accredited by/i,
      /better business bureau/i,
      /bbb/i,
      /open roles/i,
      /join .* company/i,
      /^join$/i,
      /^careers?$/i,
      /^about$/i,
      /^contact$/i,
      /^home$/i,
      /^apply$/i,
      /^view$/i,
      /^see more$/i,
      /^learn more$/i,
      /^read more$/i,
      /^click here$/i,
      /privacy policy/i,
      /terms of service/i,
      /cookie policy/i,
      /^follow us$/i,
      /^connect$/i,
      /social media/i,
      /newsletter/i,
      /subscribe/i,
    ]

    const isExcluded = (text: string): boolean => {
      return excludePatterns.some(pattern => pattern.test(text))
    }

    // Pattern 1: Look for Ashby's specific structure
    // Structure: h2.ashby-department-heading -> div.ashby-job-posting-brief-list -> a -> h3.ashby-job-posting-brief-title
    const departmentSectionPattern = /<h2[^>]*class=["'][^"']*ashby-department-heading[^"']*["'][^>]*>([^<]+)<\/h2>[\s\S]{0,5000}?<div[^>]*class=["'][^"']*ashby-job-posting-brief-list[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi
    
    let deptMatch
    while ((deptMatch = departmentSectionPattern.exec(html)) !== null) {
      const department = deptMatch[1].trim()
      const jobSection = deptMatch[2]
      
      // Extract individual jobs - each job is in an <a> tag with an h3.ashby-job-posting-brief-title inside
      // Pattern: <a href="..."> ... <h3 class="ashby-job-posting-brief-title">Job Title</h3> ... </a>
      const jobPattern = /<a[^>]*href=["']([^"']+)["'][^>]*>[\s\S]{0,2000}?<h3[^>]*class=["'][^"']*ashby-job-posting-brief-title[^"']*["'][^>]*>([^<]+)<\/h3>[\s\S]{0,2000}?<\/a>/gi
      
      let jobMatch
      while ((jobMatch = jobPattern.exec(jobSection)) !== null) {
        const href = jobMatch[1]
        const title = jobMatch[2].trim()
        
        // Clean up title
        const cleanTitle = title
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/\s+/g, ' ')
          .trim()
        
        // Additional validation: job titles should not be too short, should contain actual words
        // Also skip known non-job forms like Talent Community
        const hrefLower = href.toLowerCase()
        const isFormLink = hrefLower.includes('/form/') || hrefLower.includes('talent-community') || hrefLower.includes('community')
        if (isFormLink) {
          continue
        }
        const hasValidJobWords = /(engineer|manager|director|designer|developer|analyst|specialist|coordinator|lead|senior|junior|assistant|executive|product|marketing|sales|operations|data|scientist|researcher|writer|editor|consultant|architect|coordinator|administrator|associate|intern|internship)/i.test(cleanTitle)
        const isTooShort = cleanTitle.length < 10
        const isTooLong = cleanTitle.length > 150
        const hasOnlyPunctuation = /^[^a-z0-9]*$/i.test(cleanTitle)
        const isLikelyHeader = /^(open|join|welcome|about|contact|home|careers?|positions?|roles?|join community|community)$/i.test(cleanTitle)
        
        if (cleanTitle && !isExcluded(cleanTitle) && !isTooShort && !isTooLong && !hasOnlyPunctuation && !isLikelyHeader && (hasValidJobWords || cleanTitle.length > 15)) {
          // Extract job ID from href (format: /company-slug/job-id)
          const jobIdMatch = href.match(/\/([a-z0-9-]+)\/([a-z0-9-]+)$/i)
          const jobId = jobIdMatch ? jobIdMatch[2] : this.extractJobId(href) || this.hashString(cleanTitle)
          
          if (!foundJobs.has(jobId)) {
            foundJobs.add(jobId)
            
            // Extract location and other details from the job card
            // Look for ashby-job-posting-brief-details which contains location info
            const jobCardHtml = jobMatch[0] // The entire <a> tag content
            const detailsMatch = jobCardHtml.match(/<div[^>]*ashby-job-posting-brief-details[^>]*>([\s\S]*?)<\/div>/i)
            const detailsText = detailsMatch ? detailsMatch[1] : ''
            
            // Extract location from details (format: "Department • Location • Employment Type • Work Model")
            const location = this.extractLocationFromContext(detailsText || jobCardHtml)
            
            // Build full URL
            const fullUrl = href.startsWith('http') ? href : 
                            href.startsWith('/') ? `https://jobs.ashbyhq.com${href}` :
                            `${baseUrl}${href}`
            
            jobs.push({
              id: jobId,
              title: this.normalizeText(cleanTitle) || 'Untitled',
              locationName: location,
              departmentName: department || null,
              publishedAt: null,
              description: null,
              url: fullUrl,
              isRemote: this.extractRemoteFlag(location, cleanTitle, null) === true,
            })
          }
        }
      }
    }

    // Pattern 2: Look for job titles in structured format (Ashby often uses specific div structures)
    // Look for patterns like: <div>Job Title</div> followed by department/location info
    // BUT: Only use this pattern if we haven't found jobs from Pattern 1 (the proper Ashby structure)
    if (jobs.length === 0) {
      const structuredJobPattern = /<[^>]*>([A-Z][^<]{10,100})<\/[^>]*>[\s\S]{0,300}?(?:department|location|engineering|product|business|operations|gtm|policy)/gi
      let match
      while ((match = structuredJobPattern.exec(html)) !== null) {
        const title = match[1].trim()
        
        // Strong validation for Pattern 2 - must have job keywords
        const hasValidJobWords = /(engineer|manager|director|designer|developer|analyst|specialist|coordinator|lead|senior|junior|assistant|executive|product|marketing|sales|operations|data|scientist|researcher|writer|editor|consultant|architect|coordinator|administrator|associate|intern|internship)/i.test(title)
        const isTooShort = title.length < 10
        const isTooLong = title.length > 150
        const isLikelyHeader = /^(open|join|welcome|about|contact|home|careers?|positions?|roles?|accredited|better business|bbb)/i.test(title)
        const hasPipesOrSeparators = /\|/.test(title) // "Open roles | Join Company" is a header
        
        if (!isExcluded(title) && !isTooShort && !isTooLong && !isLikelyHeader && !hasPipesOrSeparators && hasValidJobWords &&
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
    }

    // Pattern 3: Look for job links in the HTML (more generic, but filtered)
    // Only use if we haven't found jobs from Patterns 1 or 2
    if (jobs.length === 0) {
      const jobLinkPattern = /<a[^>]*href=["']([^"']*\/[a-z0-9-]{10,})["'][^>]*>([^<]{10,150})<\/a>/gi
      let match: RegExpExecArray | null = null // Local match for this pattern
      while ((match = jobLinkPattern.exec(html)) !== null) {
        const href = match[1]
        const title = match[2].trim()
        
        // Strong validation - must have job keywords and not be a header/nav link
        const hasValidJobWords = /(engineer|manager|director|designer|developer|analyst|specialist|coordinator|lead|senior|junior|assistant|executive|product|marketing|sales|operations|data|scientist|researcher|writer|editor|consultant|architect|coordinator|administrator|associate|intern|internship)/i.test(title)
        const isTooShort = title.length < 10
        const isTooLong = title.length > 150
        const isLikelyHeader = /^(open|join|welcome|about|contact|home|careers?|positions?|roles?|accredited|better business|bbb)/i.test(title)
        const hasPipesOrSeparators = /\|/.test(title)
        
        const isFormLink = href.toLowerCase().includes('/form/') || href.toLowerCase().includes('talent-community') || href.toLowerCase().includes('community')
        if (title && !isExcluded(title) && !isTooShort && !isTooLong && !isLikelyHeader && !hasPipesOrSeparators && hasValidJobWords && !isFormLink &&
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
    let match: RegExpExecArray | null = null // Local match for this pattern
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
              !title.match(/^(open positions|careers|jobs|we're hiring|join us|about|contact|home|filters?|talent community|talent network|general application|general interest)$/i) &&
              !title.match(/^[A-Z\s]{0,3}$/) && // Not all caps short text
              title.match(/[a-z]/i) && // Has letters
              title.match(/\b(engineer|manager|lead|director|assistant|analyst|specialist|coordinator|developer|designer|product|marketing|sales|operations|data|scientist|researcher|writer|editor)\b/i)) { // Has job title keywords
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
    // Ashby formats details like: "Department • Location • Employment Type • Work Model"
    // Example: "Engineering • Bay Area; Boston; Washington D.C. • Full time • On-site"
    
    // First, try to extract the location part (between the first and second bullet)
    const bulletPattern = /[•·]\s*([^•·]+?)\s*[•·]/
    const bullets = context.match(/[•·]/g)
    
    if (bullets && bullets.length >= 2) {
      // Split by bullets and get the second part (index 1) which should be location
      const parts = context.split(/[•·]/).map(p => p.trim()).filter(p => p)
      if (parts.length >= 2) {
        // Second part is usually location (first is department)
        const locationPart = parts[1]
        
        // Clean up and return
        const cleaned = locationPart
          .replace(/<[^>]+>/g, '') // Remove HTML tags
          .replace(/&nbsp;/g, ' ')
          .trim()
        
        if (cleaned && cleaned.length > 0) {
          return cleaned
        }
      }
    }
    
    // Fallback: Look for common location patterns
    const locationPatterns = [
      /(Bay Area|San Francisco|Boston|Washington D\.C\.|Washington DC|New York|Austin|Seattle|Los Angeles|Chicago|Denver|Atlanta|Miami|Portland|Philadelphia|Americas|APAC|EMEA)(?:\s*;\s*(?:Bay Area|San Francisco|Boston|Washington D\.C\.|Washington DC|New York|Austin|Seattle|Los Angeles|Chicago|Denver|Atlanta|Miami|Portland|Philadelphia|Americas|APAC|EMEA))*/, // Multiple locations
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
    // https://www.company.com/careers -> try to extract from HTML/API
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

    // If no slug found from URL patterns, it might be a custom domain
    // Try to extract from the HTML page or API calls
    if (!companySlug) {
      try {
        const pageResponse = await fetch(company.careers_url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        })
        
        if (!pageResponse.ok) {
          throw new Error(`HTTP ${pageResponse.status}: ${pageResponse.statusText}`)
        }
        
        const html = await pageResponse.text()
        
        // Check if this is actually an Ashby page
        const isAshbyPage = html.includes('ashby') || html.includes('Ashby') || 
                           html.includes('ashby-department-heading') || 
                           html.includes('ashby-job-posting')
        
        if (!isAshbyPage) {
          throw new Error(`Page does not appear to be an Ashby careers page: ${company.careers_url}`)
        }
        
        // Try to extract company slug from API calls in the HTML
        // Look for: api.ashbyhq.com/posting-api/job-board/{slug}
        const apiMatch = html.match(/api\.ashbyhq\.com\/posting-api\/job-board\/([^"'\s\/]+)/)
        if (apiMatch) {
          companySlug = apiMatch[1]
        } else {
          // Try to extract from script tags or data attributes
          const scriptMatch = html.match(/["']clientName["']\s*:\s*["']([^"']+)["']/)
          if (scriptMatch) {
            companySlug = scriptMatch[1]
          } else {
            // Fallback: use normalized company slug from database
            companySlug = company.slug.toLowerCase().replace(/[^a-z0-9]+/g, '-')
          }
        }
      } catch (error) {
        // If we can't fetch the page, throw a more helpful error
        throw new Error(`Could not extract Ashby company slug from URL: ${company.careers_url}. ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    // Try Ashby's public API first
    // API endpoint: https://api.ashbyhq.com/posting-api/job-board/{clientname}
    // The clientname is typically the company slug from the URL
    let data: AshbyResponse | null = null

    try {
      // Try the public API endpoint
      const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${companySlug}?includeCompensation=true`
      
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
            
            // Transform API response to our format
            // API returns: { jobs: [...] } or { jobPostings: [...] }
            if (apiData.jobs && Array.isArray(apiData.jobs)) {
              // Primary format: { jobs: [...] }
              data = {
                jobs: apiData.jobs.map((posting: any) => ({
                  id: posting.id || posting.key || posting.slug || '',
                  title: posting.title || posting.name || 'Untitled',
                  locationName: posting.location || posting.locationName || posting.locationText || null,
                  departmentName: posting.department || posting.departmentName || posting.team || null,
                  publishedAt: posting.publishedAt || posting.createdAt || posting.postedAt || null,
                  description: posting.descriptionPlain || posting.description || posting.descriptionHtml || posting.body || null,
                  url: posting.jobUrl || posting.url || posting.applyUrl || posting.hostedUrl || `${company.careers_url}/${posting.id || posting.key}`,
                  isRemote: posting.isRemote || posting.remote || posting.remoteFlag || null,
                }))
              }
            } else if (apiData.jobPostings && Array.isArray(apiData.jobPostings)) {
              // Alternative format: { jobPostings: [...] }
              data = {
                jobs: apiData.jobPostings.map((posting: any) => ({
                  id: posting.id || posting.key || posting.slug || '',
                  title: posting.title || posting.name || 'Untitled',
                  locationName: posting.location || posting.locationName || posting.locationText || null,
                  departmentName: posting.department || posting.departmentName || posting.team || null,
                  publishedAt: posting.publishedAt || posting.createdAt || posting.postedAt || null,
                  description: posting.descriptionPlain || posting.description || posting.descriptionHtml || posting.body || null,
                  url: posting.jobUrl || posting.url || posting.applyUrl || posting.hostedUrl || `${company.careers_url}/${posting.id || posting.key}`,
                  isRemote: posting.isRemote || posting.remote || posting.remoteFlag || null,
                }))
              }
            } else {
              // Try other alternative response formats
              if (Array.isArray(apiData)) {
                data = { jobs: apiData }
              } else if (apiData.postings) {
                data = { jobs: apiData.postings }
              }
            }
          }
        }
      } catch (apiError) {
        // API failed, fall back to scraping
        console.log('Ashby API failed, falling back to scraping:', apiError)
      }

      // If API didn't work, try scraping
      if (!data) {
        try {
          const pageResponse = await fetch(company.careers_url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          })
          if (!pageResponse.ok) {
            throw new Error(`HTTP ${pageResponse.status}: ${pageResponse.statusText}`)
          }
          const html = await pageResponse.text()
          data = await this.scrapeAshbyJobs(html, company.careers_url)
        } catch (scrapeError) {
          throw new Error(`Failed to scrape Ashby page: ${scrapeError instanceof Error ? scrapeError.message : 'Unknown error'}`)
        }
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

