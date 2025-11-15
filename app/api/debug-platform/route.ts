import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { url, platform } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'URL required' }, { status: 400 })
    }

    const results: any = {
      url,
      platform,
      tests: [],
    }

    // Test 1: Try to fetch the URL directly
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })
      const contentType = response.headers.get('content-type') || ''
      const text = await response.text()
      
      results.tests.push({
        name: 'Direct URL fetch',
        status: response.status,
        contentType,
        isHTML: contentType.includes('text/html'),
        isJSON: contentType.includes('application/json'),
        preview: text.substring(0, 500),
      })
    } catch (error) {
      results.tests.push({
        name: 'Direct URL fetch',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }

    // Test 2: Try Lever API if platform is lever
    if (platform === 'lever') {
      // Extract possible company slug
      const slugMatch = url.match(/jobs\.lever\.co\/([^\/\?]+)/)
      const companySlug = slugMatch ? slugMatch[1] : 'basepower' // fallback
      
      const apiUrl = `https://api.lever.co/v0/postings/${companySlug}`
      try {
        const response = await fetch(apiUrl, {
          headers: { 'Accept': 'application/json' },
        })
        const contentType = response.headers.get('content-type') || ''
        const text = await response.text()
        
        results.tests.push({
          name: `Lever API: ${apiUrl}`,
          status: response.status,
          contentType,
          isHTML: contentType.includes('text/html'),
          isJSON: contentType.includes('application/json'),
          preview: text.substring(0, 500),
        })
      } catch (error) {
        results.tests.push({
          name: `Lever API: ${apiUrl}`,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    // Test 3: Try Ashby API if platform is ashby
    if (platform === 'ashby') {
      const slugMatch = url.match(/jobs\.ashbyhq\.com\/([^\/\?]+)/)
      const companySlug = slugMatch ? slugMatch[1] : 'valarlabs'
      
      // Try .json endpoint
      const jsonUrl = `https://jobs.ashbyhq.com/${companySlug}.json`
      try {
        const response = await fetch(jsonUrl, {
          headers: { 'Accept': 'application/json' },
        })
        const contentType = response.headers.get('content-type') || ''
        const text = await response.text()
        
        results.tests.push({
          name: `Ashby JSON: ${jsonUrl}`,
          status: response.status,
          contentType,
          isHTML: contentType.includes('text/html'),
          isJSON: contentType.includes('application/json'),
          preview: text.substring(0, 500),
        })
      } catch (error) {
        results.tests.push({
          name: `Ashby JSON: ${jsonUrl}`,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }

      // Try API endpoint
      const apiUrl = `https://jobs.ashbyhq.com/api/non-user-postings?organizationHost=${companySlug}`
      try {
        const response = await fetch(apiUrl, {
          headers: { 'Accept': 'application/json' },
        })
        const contentType = response.headers.get('content-type') || ''
        const text = await response.text()
        
        results.tests.push({
          name: `Ashby API: ${apiUrl}`,
          status: response.status,
          contentType,
          isHTML: contentType.includes('text/html'),
          isJSON: contentType.includes('application/json'),
          preview: text.substring(0, 500),
        })
      } catch (error) {
        results.tests.push({
          name: `Ashby API: ${apiUrl}`,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json(results)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

