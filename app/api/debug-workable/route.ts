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

    // Extract company identifier from Workable URL
    // Examples:
    // https://company.workable.com -> company
    // https://company.workable.com/jobs -> company
    const workableMatch = url.match(/https?:\/\/([^\.]+)\.workable\.com/)
    const companySlug = workableMatch ? workableMatch[1] : null

    if (companySlug) {
      // Test 1: Try public API endpoint
      const apiUrl = `https://${companySlug}.workable.com/api/v3/jobs`
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
          name: `Workable API: ${apiUrl}`,
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
          name: `Workable API: ${apiUrl}`,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }

      // Test 2: Try alternative API endpoint
      const apiUrl2 = `https://${companySlug}.workable.com/api/v1/jobs`
      try {
        const response = await fetch(apiUrl2, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        })

        const contentType = response.headers.get('content-type') || ''
        const text = await response.text()

        results.tests.push({
          name: `Workable API v1: ${apiUrl2}`,
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
          name: `Workable API v1: ${apiUrl2}`,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    // Test 3: Try fetching the HTML page
    try {
      const pageResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })
      const html = await pageResponse.text()

      // Look for Workable-specific structures
      const hasWorkableScripts = html.includes('workable') || html.includes('Workable')
      const scriptCount = (html.match(/<script[^>]*>/gi) || []).length
      
      // Look for JSON-LD structured data
      const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
      const hasJsonLd = jsonLdMatches && jsonLdMatches.length > 0
      
      // Look for embedded JSON data
      const jsonScriptMatches = html.match(/<script[^>]*>[\s\S]*?({[\s\S]{100,10000}jobs?[\s\S]{100,10000}})[\s\S]*?<\/script>/gi)
      const hasEmbeddedJson = jsonScriptMatches && jsonScriptMatches.length > 0

      // Look for job-related keywords
      const jobKeywords = html.match(/(?:job|position|opening|career|role)/gi)?.length || 0

      results.tests.push({
        name: 'HTML Page Analysis',
        status: pageResponse.status,
        htmlLength: html.length,
        hasWorkableScripts,
        scriptTags: scriptCount,
        hasJsonLd,
        jsonLdCount: jsonLdMatches ? jsonLdMatches.length : 0,
        hasEmbeddedJson,
        embeddedJsonCount: jsonScriptMatches ? jsonScriptMatches.length : 0,
        jobKeywordsFound: jobKeywords,
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

