import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { normalizeCareersUrl } from '@/lib/url-utils'

function detectPlatformFromHtml(html: string) {
  const indicators: Array<{ platform: string; match: RegExp; urlPattern?: RegExp }> = [
    { platform: 'ashby', match: /jobs\.ashbyhq\.com\//i, urlPattern: /(https?:\/\/jobs\.ashbyhq\.com\/[a-z0-9-]+)/i },
    { platform: 'greenhouse', match: /boards?\.greenhouse\.io|job-boards?\.greenhouse\.io/i, urlPattern: /(https?:\/\/(?:boards|job-boards)\.greenhouse\.io\/[a-z0-9-]+)/i },
    { platform: 'lever', match: /jobs\.lever\.co|\.lever\.co\//i, urlPattern: /(https?:\/\/jobs\.lever\.co\/[a-z0-9-]+)/i },
    { platform: 'workable', match: /\.workable\.com\//i, urlPattern: /(https?:\/\/[a-z0-9-]+\.workable\.com)/i },
    { platform: 'polymer', match: /jobs\.polymer\.co\//i, urlPattern: /(https?:\/\/jobs\.polymer\.co\/[a-z0-9-]+)/i },
    { platform: 'bamboohr', match: /\.bamboohr\.com\//i, urlPattern: /(https?:\/\/[a-z0-9-]+\.bamboohr\.com\/[a-z0-9-]*jobs?[^"'\s>]*)/i },
  ]

  for (const ind of indicators) {
    if (ind.match.test(html)) {
      let canonical: string | null = null
      if (ind.urlPattern) {
        const m = html.match(ind.urlPattern)
        canonical = m ? m[1] : null
      }
      return { platform: ind.platform, canonical }
    }
  }

  // Detect via embedded links on company sites (e.g., Supabase has anchors to jobs.ashbyhq.com)
  const linkToAshby = html.match(/href=["'](https?:\/\/jobs\.ashbyhq\.com\/[a-z0-9-]+)/i)
  if (linkToAshby) return { platform: 'ashby', canonical: linkToAshby[1] }

  return { platform: 'unknown', canonical: null }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient()
    const { companyId } = await request.json()

    if (!companyId) {
      return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    }

    const { data: company, error: fetchErr } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single()

    if (fetchErr || !company) {
      return NextResponse.json({ error: fetchErr?.message || 'Company not found' }, { status: 404 })
    }

    const targetUrl: string | null = company.careers_url
    if (!targetUrl) {
      return NextResponse.json({ error: 'Company has no careers_url to inspect' }, { status: 400 })
    }

    const normalizedTargetUrl = normalizeCareersUrl(targetUrl)
    if (!normalizedTargetUrl) {
      return NextResponse.json({ error: 'Invalid careers_url format' }, { status: 400 })
    }

    const res = await fetch(normalizedTargetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })
    const html = await res.text()

    const { platform, canonical } = detectPlatformFromHtml(html)

    if (platform === 'unknown') {
      return NextResponse.json({
        companyId,
        detected: null,
        message: 'No known platform indicators found',
      })
    }

    const updates: any = { platform_key: platform }
    const normalizedCanonical = normalizeCareersUrl(canonical || normalizedTargetUrl)
    if (normalizedCanonical) updates.careers_url = normalizedCanonical

    const { error: updateErr } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', companyId)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      companyId,
      platform,
      careers_url: normalizedCanonical || normalizedTargetUrl,
      updated: true,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}
