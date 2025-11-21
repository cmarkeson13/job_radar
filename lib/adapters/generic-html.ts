import { BaseAdapter, NormalizedJob } from './base'
import { Company } from '../database.types'

export class GenericHtmlAdapter extends BaseAdapter {
  async fetchJobs(company: Company): Promise<NormalizedJob[]> {
    if (!company.careers_url) {
      throw new Error(`No careers_url for company ${company.name}`)
    }

    try {
      const response = await fetch(company.careers_url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`)
      }

      const html = await response.text()
      const jobs = this.parseJobsFromHtml(html, company.careers_url)

      return jobs
    } catch (error) {
      throw new Error(`Failed to fetch HTML jobs: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private parseJobsFromHtml(html: string, baseUrl: string): NormalizedJob[] {
    const jobs: NormalizedJob[] = []
    const foundJobs = new Set<string>()

    // Pattern 1: JSON-LD structured data (most reliable)
    const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    let jsonLdMatch
    while ((jsonLdMatch = jsonLdPattern.exec(html)) !== null) {
      try {
        const jsonData = JSON.parse(jsonLdMatch[1])
        
        // Handle both single JobPosting and array of JobPostings
        const jobPostings = Array.isArray(jsonData) 
          ? jsonData.filter((item: any) => item['@type'] === 'JobPosting' || item['@type'] === 'http://schema.org/JobPosting')
          : (jsonData['@type'] === 'JobPosting' || jsonData['@type'] === 'http://schema.org/JobPosting') ? [jsonData] : []
        
        // Also check for @graph arrays (common in structured data)
        if (jsonData['@graph'] && Array.isArray(jsonData['@graph'])) {
          jobPostings.push(...jsonData['@graph'].filter((item: any) => 
            item['@type'] === 'JobPosting' || item['@type'] === 'http://schema.org/JobPosting'
          ))
        }

        for (const posting of jobPostings) {
          const jobId = posting.identifier?.value || 
                       posting.identifier || 
                       posting.url || 
                       this.hashString(posting.title || '')
          
          if (!foundJobs.has(jobId) && posting.title) {
            foundJobs.add(jobId)
            
            // Extract location from structured data
            let location: string | null = null
            if (posting.jobLocation) {
              if (typeof posting.jobLocation === 'string') {
                location = posting.jobLocation
              } else if (posting.jobLocation.address) {
                const addr = posting.jobLocation.address
                if (typeof addr === 'string') {
                  location = addr
                } else {
                  const parts = [
                    addr.addressLocality,
                    addr.addressRegion,
                    addr.addressCountry
                  ].filter(Boolean)
                  location = parts.length > 0 ? parts.join(', ') : null
                }
              } else if (posting.jobLocation.name) {
                location = posting.jobLocation.name
              }
            }

            jobs.push({
              job_uid: `html_${this.hashString(jobId)}`,
              title: this.normalizeText(posting.title) || 'Untitled',
              team: posting.department || posting.employmentType || null,
              location_raw: location,
              remote_flag: this.extractRemoteFlag(location, posting.title, posting.description),
              job_url: posting.url || `${baseUrl}/${jobId}`,
              posted_at: posting.datePosted || posting.datePublished || null,
              description_snippet: posting.description ? posting.description.substring(0, 500) : null,
              full_description: posting.description || null,
            })
          }
        }
      } catch (e) {
        // Invalid JSON, continue
      }
    }

    // Pattern 2: Embedded JSON in script tags (common in React/SPA apps)
    const scriptPattern = /<script[^>]*>(.*?)<\/script>/gs
    let scriptMatch
    while ((scriptMatch = scriptPattern.exec(html)) !== null) {
      const scriptContent = scriptMatch[1]
      
      // Look for job arrays or objects in various formats
      const patterns = [
        /(?:jobs|postings|openings|positions)\s*[:=]\s*(\[[\s\S]{50,50000}\])/i,
        /window\.__INITIAL_STATE__\s*=\s*({[\s\S]{50,50000}})/i,
        /window\.__NEXT_DATA__\s*=\s*({[\s\S]{50,50000}})/i,
        /"jobs"\s*:\s*(\[[\s\S]{50,50000}\])/i,
        /jobs\s*:\s*(\[[\s\S]{50,50000}\])/i,
      ]
      
      for (const pattern of patterns) {
        const jobArrayMatch = scriptContent.match(pattern)
        if (jobArrayMatch) {
          try {
            const parsed = JSON.parse(jobArrayMatch[1])
            let jobArray = Array.isArray(parsed) ? parsed : 
                          parsed.jobs ? parsed.jobs :
                          parsed.postings ? parsed.postings :
                          parsed.positions ? parsed.positions :
                          parsed.data?.jobs ? parsed.data.jobs :
                          parsed.props?.jobs ? parsed.props.jobs :
                          null
            
            if (jobArray && Array.isArray(jobArray)) {
              for (const item of jobArray) {
                if (item.title || item.name || item.text || item.position) {
                  const jobId = item.id || item.slug || item.key || item.jobId || this.hashString(item.title || item.name || item.text || item.position || '')
                  if (!foundJobs.has(jobId)) {
                    foundJobs.add(jobId)
                    
                    const title = item.title || item.name || item.text || item.position || 'Untitled'
                    const location = item.location || item.locationName || item.locationText || item.city || null
                    const description = item.description || item.content || item.body || null
                    
                    jobs.push({
                      job_uid: `html_${this.hashString(jobId)}`,
                      title: this.normalizeText(title) || 'Untitled',
                      team: item.department || item.team || item.category || null,
                      location_raw: location,
                      remote_flag: this.extractRemoteFlag(location, title, description),
                      job_url: item.url || item.applyUrl || item.hostedUrl || item.link || `${baseUrl}/${jobId}`,
                      posted_at: item.publishedAt || item.createdAt || item.postedAt || item.datePosted || null,
                      description_snippet: description ? description.substring(0, 500) : null,
                      full_description: description,
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

    // Pattern 3: Common job listing link patterns (if no structured data found)
    if (jobs.length === 0) {
      const jobLinkPatterns = [
        // Standard job URLs
        /<a[^>]*href=["']([^"']*\/job[^"']*|#[^"']*job[^"']*)["'][^>]*>[\s\S]{0,500}?([^<]{10,150})[\s\S]{0,500}?<\/a>/gi,
        /<a[^>]*href=["']([^"']*\/careers[^"']*\/[^"']+)["'][^>]*>[\s\S]{0,500}?([^<]{10,150})[\s\S]{0,500}?<\/a>/gi,
        /<a[^>]*href=["']([^"']*\/openings[^"']*\/[^"']+)["'][^>]*>[\s\S]{0,500}?([^<]{10,150})[\s\S]{0,500}?<\/a>/gi,
        /<a[^>]*href=["']([^"']*\/positions[^"']*\/[^"']+)["'][^>]*>[\s\S]{0,500}?([^<]{10,150})[\s\S]{0,500}?<\/a>/gi,
        // Job cards/articles
        /<article[^>]*>[\s\S]{0,2000}?<a[^>]*href=["']([^"']+)["'][^>]*>[\s\S]{0,500}?([^<]{10,150})[\s\S]{0,500}?<\/a>[\s\S]{0,2000}?<\/article>/gi,
        /<div[^>]*class=["'][^"']*job[^"']*["'][^>]*>[\s\S]{0,2000}?<a[^>]*href=["']([^"']+)["'][^>]*>[\s\S]{0,500}?([^<]{10,150})[\s\S]{0,500}?<\/a>[\s\S]{0,2000}?<\/div>/gi,
      ]

      for (const pattern of jobLinkPatterns) {
        let match
        while ((match = pattern.exec(html)) !== null) {
          const href = match[1]
          const title = match[2]?.trim() || match[3]?.trim() || ''
          
          if (title && title.length > 10 && title.length < 200) {
            // Filter out common non-job text
            const excludePatterns = [
              /^(apply|view|see|more|jobs?|careers?|open positions?|home|about|contact|filters?)$/i,
              /^(click here|learn more|read more)$/i,
            ]
            
            if (excludePatterns.some(p => p.test(title))) continue

            const normalizedHref = this.normalizeUrl(href, baseUrl)
            const jobId = this.hashString(normalizedHref + title)
            
            if (!foundJobs.has(jobId)) {
              foundJobs.add(jobId)

              // Try to extract location from nearby text
              const location = this.extractLocationNearLink(html, match.index)

              jobs.push({
                job_uid: `html_${jobId}`,
                title: this.normalizeText(title) || 'Untitled',
                team: null,
                location_raw: location,
                remote_flag: this.extractRemoteFlag(location, title, null),
                job_url: normalizedHref,
                posted_at: null,
                description_snippet: null,
                full_description: null,
              })
            }
          }
        }
      }
    }

    // Pattern 4: Generic fallback - look for links with job keywords (last resort)
    if (jobs.length === 0) {
      const genericPattern = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]{10,100})<\/a>/gi
      let match
      let count = 0
      const jobKeywords = [
        'engineer', 'manager', 'director', 'designer', 'developer', 'analyst', 
        'specialist', 'coordinator', 'lead', 'senior', 'junior', 'assistant',
        'executive', 'product', 'marketing', 'sales', 'operations', 'data',
        'scientist', 'researcher', 'writer', 'editor', 'consultant', 'architect'
      ]
      
      while ((match = genericPattern.exec(html)) !== null && count < 50) {
        const href = match[1]
        const text = match[2].trim()
        
        // Skip navigation and common links
        if (href.match(/\/(home|about|contact|blog|news|privacy|security|login|signup)/i)) continue
        if (text.match(/^(apply|view|see|more|jobs?|careers?|home|about|contact|filters?)$/i)) continue
        
        const hasJobKeyword = jobKeywords.some(keyword => text.toLowerCase().includes(keyword))
        
        if (hasJobKeyword && text.length >= 10 && text.length <= 100) {
          const normalizedHref = this.normalizeUrl(href, baseUrl)
          const jobId = this.hashString(normalizedHref + text)
          
          if (!foundJobs.has(jobId)) {
            foundJobs.add(jobId)

            jobs.push({
              job_uid: `html_${jobId}`,
              title: this.normalizeText(text) || 'Untitled',
              team: null,
              location_raw: null,
              remote_flag: null,
              job_url: normalizedHref,
              posted_at: null,
              description_snippet: null,
              full_description: null,
            })
            count++
          }
        }
      }
    }

    return jobs
  }

  private normalizeUrl(href: string, baseUrl: string): string {
    if (href.startsWith('http://') || href.startsWith('https://')) {
      return href
    }
    if (href.startsWith('/')) {
      const url = new URL(baseUrl)
      return `${url.protocol}//${url.host}${href}`
    }
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
    return `${base}/${href}`
  }

  private extractLocationNearLink(html: string, linkIndex: number): string | null {
    // Look for location text within 800 chars before or after the link
    const contextStart = Math.max(0, linkIndex - 800)
    const contextEnd = Math.min(html.length, linkIndex + 800)
    const context = html.substring(contextStart, contextEnd)

    // Remove HTML tags for better pattern matching
    const textContext = context.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

    // Common location patterns (more comprehensive)
    const locationPatterns = [
      /(?:location|Location|LOCATION|where)[: ]*([A-Z][a-z]+(?:,\s*[A-Z][a-z]+)*(?:\s*,\s*[A-Z]{2})?)/,
      /([A-Z][a-z]+,\s*[A-Z]{2})/, // City, State (e.g., "San Francisco, CA")
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][a-z]+)/, // City, Country (e.g., "New York, United States")
      /(Remote|On-site|Onsite|Hybrid|Work from home|WFH|Distributed|Anywhere)/i,
      /(?:based in|located in|office in)[: ]*([A-Z][a-z]+(?:,\s*[A-Z][a-z]+)*)/i,
      /(?:📍|🌍)\s*([A-Z][a-z]+(?:,\s*[A-Z][a-z]+)*)/, // Emoji indicators
    ]

    for (const pattern of locationPatterns) {
      const match = textContext.match(pattern)
      if (match) {
        const location = (match[1] || match[0]).trim()
        // Filter out false positives
        if (location.length > 2 && location.length < 100 && 
            !location.match(/^(the|and|or|for|with|from|this|that)$/i)) {
          return location
        }
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
}

