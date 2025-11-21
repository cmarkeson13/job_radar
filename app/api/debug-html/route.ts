import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'URL required' }, { status: 400 })
    }

    const results: any = {
      url,
      analysis: {},
      patterns: [],
      suggestions: [],
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })

      if (!response.ok) {
        return NextResponse.json({
          error: `HTTP ${response.status}: ${response.statusText}`,
          url,
        }, { status: response.status })
      }

      const html = await response.text()
      results.analysis.htmlLength = html.length
      results.analysis.status = response.status

      // Check for JSON-LD structured data
      const jsonLdPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
      const jsonLdMatches = []
      let jsonLdMatch
      while ((jsonLdMatch = jsonLdPattern.exec(html)) !== null) {
        try {
          const parsed = JSON.parse(jsonLdMatch[1])
          jsonLdMatches.push({
            raw: jsonLdMatch[1].substring(0, 500),
            parsed: parsed,
            hasJobPosting: parsed['@type'] === 'JobPosting' || 
                          (Array.isArray(parsed) && parsed.some((item: any) => item['@type'] === 'JobPosting')) ||
                          (parsed['@graph'] && parsed['@graph'].some((item: any) => item['@type'] === 'JobPosting')),
          })
        } catch (e) {
          jsonLdMatches.push({
            raw: jsonLdMatch[1].substring(0, 500),
            error: 'Invalid JSON',
          })
        }
      }
      results.analysis.jsonLdCount = jsonLdMatches.length
      results.analysis.jsonLdData = jsonLdMatches

      // Check for embedded JSON in script tags
      const scriptPattern = /<script[^>]*>(.*?)<\/script>/gs
      const embeddedJsonMatches = []
      let scriptMatch
      let scriptIndex = 0
      while ((scriptMatch = scriptPattern.exec(html)) !== null && scriptIndex < 50) {
        const scriptContent = scriptMatch[1]
        
        // Look for job-related JSON
        const patterns = [
          { name: 'jobs array', regex: /(?:jobs|postings|openings|positions)\s*[:=]\s*(\[[\s\S]{50,50000}\])/i },
          { name: 'window.__INITIAL_STATE__', regex: /window\.__INITIAL_STATE__\s*=\s*({[\s\S]{50,50000}})/i },
          { name: 'window.__NEXT_DATA__', regex: /window\.__NEXT_DATA__\s*=\s*({[\s\S]{50,50000}})/i },
          { name: 'jobs property', regex: /"jobs"\s*:\s*(\[[\s\S]{50,50000}\])/i },
        ]
        
        for (const pattern of patterns) {
          const match = scriptContent.match(pattern.regex)
          if (match) {
            try {
              const parsed = JSON.parse(match[1])
              embeddedJsonMatches.push({
                pattern: pattern.name,
                preview: match[1].substring(0, 500),
                hasJobs: Array.isArray(parsed) || 
                        (parsed.jobs && Array.isArray(parsed.jobs)) ||
                        (parsed.postings && Array.isArray(parsed.postings)),
                jobCount: Array.isArray(parsed) ? parsed.length :
                         parsed.jobs ? parsed.jobs.length :
                         parsed.postings ? parsed.postings.length : 0,
              })
            } catch (e) {
              embeddedJsonMatches.push({
                pattern: pattern.name,
                preview: match[1].substring(0, 500),
                error: 'Invalid JSON',
              })
            }
          }
        }
        scriptIndex++
      }
      results.analysis.embeddedJsonCount = embeddedJsonMatches.length
      results.analysis.embeddedJsonData = embeddedJsonMatches

      // Check for common job link patterns
      const linkPatterns = [
        { name: 'Job URLs (/job)', regex: /<a[^>]*href=["']([^"']*\/job[^"']*)["'][^>]*>([^<]+)<\/a>/gi },
        { name: 'Careers URLs (/careers)', regex: /<a[^>]*href=["']([^"']*\/careers[^"']*\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi },
        { name: 'Openings URLs (/openings)', regex: /<a[^>]*href=["']([^"']*\/openings[^"']*\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi },
        { name: 'Positions URLs (/positions)', regex: /<a[^>]*href=["']([^"']*\/positions[^"']*\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi },
        { name: 'Job cards (article)', regex: /<article[^>]*>[\s\S]{0,2000}?<a[^>]*href=["']([^"']+)["'][^>]*>[\s\S]{0,500}?([^<]{10,150})[\s\S]{0,500}?<\/a>/gi },
        { name: 'Job divs (class="job")', regex: /<div[^>]*class=["'][^"']*job[^"']*["'][^>]*>[\s\S]{0,2000}?<a[^>]*href=["']([^"']+)["'][^>]*>[\s\S]{0,500}?([^<]{10,150})[\s\S]{0,500}?<\/a>/gi },
      ]

      for (const pattern of linkPatterns) {
        const matches = []
        let match
        let count = 0
        while ((match = pattern.regex.exec(html)) !== null && count < 20) {
          const href = match[1]
          const text = match[2]?.trim() || match[3]?.trim() || ''
          
          // Filter out obvious non-jobs
          if (text && text.length > 5 && text.length < 200 && 
              !text.match(/^(apply|view|see|more|jobs?|careers?|home|about|contact|filters?)$/i)) {
            matches.push({
              href: href.substring(0, 200),
              text: text.substring(0, 100),
            })
            count++
          }
        }
        
        if (matches.length > 0) {
          results.patterns.push({
            name: pattern.name,
            count: matches.length,
            matches: matches,
          })
        }
      }

      // Check for known platform indicators
      const platformIndicators = {
        greenhouse: html.includes('greenhouse') || html.includes('Greenhouse'),
        lever: html.includes('lever') || html.includes('Lever'),
        ashby: html.includes('ashby') || html.includes('Ashby'),
        workable: html.includes('workable') || html.includes('Workable'),
        polymer: html.includes('polymer') || html.includes('Polymer'),
        bamboohr: html.includes('bamboohr') || html.includes('BambooHR'),
      }
      results.analysis.platformIndicators = platformIndicators

      // Generate suggestions
      if (jsonLdMatches.length > 0) {
        results.suggestions.push('✅ Found JSON-LD structured data - should work with enhanced generic scraper')
      }
      if (embeddedJsonMatches.length > 0) {
        results.suggestions.push('✅ Found embedded JSON in scripts - should work with enhanced generic scraper')
      }
      if (results.patterns.length > 0) {
        results.suggestions.push(`✅ Found ${results.patterns.reduce((sum: number, p: any) => sum + p.count, 0)} potential job links using common patterns`)
      }
      if (Object.values(platformIndicators).some(v => v)) {
        const detectedPlatforms = Object.entries(platformIndicators)
          .filter(([_, detected]) => detected)
          .map(([platform, _]) => platform)
        results.suggestions.push(`⚠️ Detected platform indicators: ${detectedPlatforms.join(', ')} - consider using specific adapter`)
      }
      if (jsonLdMatches.length === 0 && embeddedJsonMatches.length === 0 && results.patterns.length === 0) {
        results.suggestions.push('❌ No standard patterns detected - may need custom scraper or manual investigation')
      }

      // Sample HTML structure
      results.analysis.sampleHtml = html.substring(0, 2000)

    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : 'Unknown error',
        url,
      }, { status: 500 })
    }

    return NextResponse.json(results)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

