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
    
    // Common patterns for job listings
    // This is a basic parser - you may need to customize per company
    
    // Pattern 1: Look for common job listing structures
    // Many sites use <article>, <div class="job">, <li class="job-item">, etc.
    
    // Try to find job links with common patterns
    const jobLinkPatterns = [
      /<a[^>]*href=["']([^"']*\/job[^"']*|#[^"']*job[^"']*)["'][^>]*>([^<]+)<\/a>/gi,
      /<a[^>]*href=["']([^"']*\/careers[^"']*\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi,
      /<a[^>]*href=["']([^"']*\/openings[^"']*\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi,
    ]

    const foundLinks = new Set<string>()

    for (const pattern of jobLinkPatterns) {
      let match
      while ((match = pattern.exec(html)) !== null) {
        const href = match[1]
        const title = match[2].trim()
        
        if (title && title.length > 3 && title.length < 200) {
          // Skip if we've already seen this link
          const normalizedHref = this.normalizeUrl(href, baseUrl)
          if (foundLinks.has(normalizedHref)) continue
          foundLinks.add(normalizedHref)

          // Try to extract location from nearby text
          const location = this.extractLocationNearLink(html, match.index)

          jobs.push({
            job_uid: `html_${this.hashString(normalizedHref)}`,
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

    // If no jobs found with patterns, try a more generic approach
    if (jobs.length === 0) {
      // Look for any links that might be job postings
      const genericPattern = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]{10,100})<\/a>/gi
      let match
      let count = 0
      while ((match = genericPattern.exec(html)) !== null && count < 50) {
        const href = match[1]
        const text = match[2].trim()
        
        // Heuristic: job titles are usually 20-100 chars, contain common job words
        const jobKeywords = ['engineer', 'manager', 'director', 'designer', 'developer', 'analyst', 'specialist', 'coordinator', 'lead', 'senior', 'junior']
        const hasJobKeyword = jobKeywords.some(keyword => text.toLowerCase().includes(keyword))
        
        if (hasJobKeyword && text.length >= 10 && text.length <= 100) {
          const normalizedHref = this.normalizeUrl(href, baseUrl)
          if (foundLinks.has(normalizedHref)) continue
          foundLinks.add(normalizedHref)

          jobs.push({
            job_uid: `html_${this.hashString(normalizedHref)}`,
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
    // Look for location text within 500 chars before or after the link
    const contextStart = Math.max(0, linkIndex - 500)
    const contextEnd = Math.min(html.length, linkIndex + 500)
    const context = html.substring(contextStart, contextEnd)

    // Common location patterns
    const locationPatterns = [
      /(?:location|Location|LOCATION)[: ]*([A-Z][a-z]+(?:,\s*[A-Z][a-z]+)*)/,
      /([A-Z][a-z]+,\s*[A-Z]{2})/, // City, State
      /(Remote|On-site|Hybrid)/i,
    ]

    for (const pattern of locationPatterns) {
      const match = context.match(pattern)
      if (match) {
        return match[1] || match[0]
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

