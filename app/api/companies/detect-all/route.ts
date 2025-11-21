import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

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
  const linkToAshby = html.match(/href=["'](https?:\/\/jobs\.ashbyhq\.com\/[a-z0-9-]+)/i)
  if (linkToAshby) return { platform: 'ashby', canonical: linkToAshby[1] }
  return { platform: 'unknown', canonical: null }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient()

    const { data: companies, error } = await supabase
      .from('companies')
      .select('id, name, careers_url')

    if (error || !companies) {
      return NextResponse.json({ error: error?.message || 'No companies' }, { status: 500 })
    }

    let updated = 0
    let detected = 0

    for (const c of companies) {
      if (!c.careers_url) continue
      try {
        const res = await fetch(c.careers_url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        })
        const html = await res.text()
        const { platform, canonical } = detectPlatformFromHtml(html)
        if (platform !== 'unknown') {
          detected++
          const updates: any = { platform_key: platform }
          if (canonical) updates.careers_url = canonical
          await supabase.from('companies').update(updates).eq('id', c.id)
          updated++
        }
      } catch {
        // ignore individual failures
      }
      await new Promise(r => setTimeout(r, 300))
    }

    return NextResponse.json({ total: companies.length, detected, updated })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}
