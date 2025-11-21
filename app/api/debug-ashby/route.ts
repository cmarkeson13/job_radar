import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'URL required' }, { status: 400 })
    }

    // Extract company slug from URL
    const slugMatch = url.match(/jobs\.ashbyhq\.com\/([^\/\?]+)/)
    const companySlug = slugMatch ? slugMatch[1] : null

    if (!companySlug) {
      return NextResponse.json({ error: 'Could not extract company slug from URL' }, { status: 400 })
    }

    const results: any = {
      url,
      companySlug,
      apiTest: null,
      htmlAnalysis: null,
      patternMatches: [],
    }

    // Test 1: Try the API endpoint
    const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${companySlug}?includeCompensation=true`
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })

      const contentType = response.headers.get('content-type') || ''
      const text = await response.text()

      results.apiTest = {
        url: apiUrl,
        status: response.status,
        contentType,
        isHTML: contentType.includes('text/html'),
        isJSON: contentType.includes('application/json'),
        preview: text.substring(0, 1000),
        fullResponse: response.ok && contentType.includes('application/json') ? JSON.parse(text) : null,
        error: !response.ok ? `HTTP ${response.status}: ${response.statusText}` : null,
      }
    } catch (error) {
      results.apiTest = {
        url: apiUrl,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }

    // Test 2: Try fetching the HTML page and test all patterns
    try {
      const pageResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })
      const html = await pageResponse.text()

      // Look for Ashby-specific structures
      const hasDepartmentHeadings = html.includes('ashby-department-heading')
      const hasJobBriefLists = html.includes('ashby-job-posting-brief-list')
      const departmentCount = (html.match(/ashby-department-heading/gi) || []).length
      const jobListCount = (html.match(/ashby-job-posting-brief-list/gi) || []).length
      
      // Extract samples
      const deptMatch = html.match(/<h2[^>]*ashby-department-heading[^>]*>([\s\S]{0,2000})/i)
      const jobListMatch = html.match(/<div[^>]*ashby-job-posting-brief-list[^>]*>([\s\S]{0,3000})<\/div>/i)

      results.htmlAnalysis = {
        status: pageResponse.status,
        htmlLength: html.length,
        hasDepartmentHeadings,
        hasJobBriefLists,
        departmentCount,
        jobListCount,
        sampleDepartment: deptMatch ? deptMatch[1].substring(0, 500) : null,
        sampleJobList: jobListMatch ? jobListMatch[1].substring(0, 2000) : null,
      }

      // Test Pattern 1: Department sections with job lists
      const departmentSectionPattern = /<h2[^>]*class=["'][^"']*ashby-department-heading[^"']*["'][^>]*>([^<]+)<\/h2>[\s\S]{0,5000}?<div[^>]*class=["'][^"']*ashby-job-posting-brief-list[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi
      const pattern1Matches: any[] = []
      let deptMatch2
      while ((deptMatch2 = departmentSectionPattern.exec(html)) !== null) {
        const department = deptMatch2[1].trim()
        const jobSection = deptMatch2[2]
        
        const jobPattern = /<a[^>]*href=["']([^"']+)["'][^>]*>[\s\S]{0,2000}?<h3[^>]*class=["'][^"']*ashby-job-posting-brief-title[^"']*["'][^>]*>([^<]+)<\/h3>[\s\S]{0,2000}?<\/a>/gi
        const jobs: any[] = []
        let jobMatch
        while ((jobMatch = jobPattern.exec(jobSection)) !== null) {
          jobs.push({
            href: jobMatch[1],
            title: jobMatch[2].trim(),
            rawMatch: jobMatch[0].substring(0, 300),
          })
        }
        
        pattern1Matches.push({
          department,
          jobCount: jobs.length,
          jobs,
        })
      }
      results.patternMatches.push({
        name: 'Pattern 1: Department sections (ashby-department-heading)',
        matches: pattern1Matches.length,
        details: pattern1Matches,
      })

      // Test Pattern 5: Fallback pattern (headings/strong tags)
      const titlePatterns = [
        /<h[2-4][^>]*>([^<]{10,100})<\/h[2-4]>/gi,
        /<[^>]*class=["'][^"']*title[^"']*["'][^>]*>([^<]{10,100})<\/[^>]*>/gi,
        /<strong[^>]*>([^<]{10,100})<\/strong>/gi,
      ]
      const pattern5Matches: any[] = []
      for (const pattern of titlePatterns) {
        let titleMatch
        while ((titleMatch = pattern.exec(html)) !== null) {
          const title = titleMatch[1].trim()
          pattern5Matches.push({
            title,
            pattern: pattern.toString().substring(0, 50),
            context: html.substring(Math.max(0, titleMatch.index - 100), Math.min(html.length, titleMatch.index + 200)),
          })
        }
      }
      results.patternMatches.push({
        name: 'Pattern 5: Fallback (headings/strong/title classes)',
        matches: pattern5Matches.length,
        details: pattern5Matches.slice(0, 20), // Limit to first 20
      })

    } catch (error) {
      results.htmlAnalysis = {
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }

    return NextResponse.json(results) // Results will be formatted by browser
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

