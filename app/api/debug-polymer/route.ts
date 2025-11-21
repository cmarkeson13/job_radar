import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'URL required' }, { status: 400 })
    }

    const results: any = {
      url,
      tests: [],
    }

    // Extract company identifier from Polymer URL
    // Examples:
    // https://jobs.polymer.co/company-name -> company-name
    const polymerMatch = url.match(/jobs\.polymer\.co\/([^\/\?]+)/)
    const companySlug = polymerMatch ? polymerMatch[1] : null

    if (companySlug) {
      // Test 1: Try API endpoint (if it exists)
      const apiUrl = `https://jobs.polymer.co/api/${companySlug}/jobs`
      try {
        const response = await fetch(apiUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        })

        const contentType = response.headers.get('content-type') || ''
        const text = await response.text()

        results.tests.push({
          name: `Polymer API: ${apiUrl}`,
          status: response.status,
          contentType,
          isHTML: contentType.includes('text/html'),
          isJSON: contentType.includes('application/json'),
          preview: text.substring(0, 1000),
          fullResponse: response.ok && contentType.includes('application/json') ? JSON.parse(text) : null,
          error: !response.ok ? `HTTP ${response.status}: ${response.statusText}` : null,
        })
      } catch (error) {
        results.tests.push({
          name: `Polymer API: ${apiUrl}`,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    // Test 2: Try fetching the HTML page
    try {
      const pageResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })
      const html = await pageResponse.text()

      // Look for Polymer-specific structures
      const hasPolymerScripts = html.includes('polymer') || html.includes('Polymer')
      const scriptCount = (html.match(/<script[^>]*>/gi) || []).length
      
      // Look for JSON-LD structured data
      const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
      const hasJsonLd = jsonLdMatches && jsonLdMatches.length > 0
      
      // Look for embedded JSON data
      const jsonScriptMatches = html.match(/<script[^>]*>[\s\S]*?({[\s\S]{100,10000}jobs?[\s\S]{100,10000}})[\s\S]*?<\/script>/gi)
      const hasEmbeddedJson = jsonScriptMatches && jsonScriptMatches.length > 0

      // Look for job-related keywords
      const jobKeywords = html.match(/(?:job|position|opening|career|role)/gi)?.length || 0

      // Look for common job listing patterns
      const hasJobCards = html.includes('job-card') || html.includes('jobCard') || html.includes('job-item')
      const hasJobList = html.includes('job-list') || html.includes('jobList')

      results.tests.push({
        name: 'HTML Page Analysis',
        status: pageResponse.status,
        htmlLength: html.length,
        hasPolymerScripts,
        scriptTags: scriptCount,
        hasJsonLd,
        jsonLdCount: jsonLdMatches ? jsonLdMatches.length : 0,
        hasEmbeddedJson,
        embeddedJsonCount: jsonScriptMatches ? jsonScriptMatches.length : 0,
        jobKeywordsFound: jobKeywords,
        hasJobCards,
        hasJobList,
        sampleJsonLd: jsonLdMatches ? jsonLdMatches[0].substring(0, 500) : null,
        preview: html.substring(0, 2000),
      })
    } catch (error) {
      results.tests.push({
        name: 'HTML Page Fetch',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }

    return NextResponse.json(results)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

