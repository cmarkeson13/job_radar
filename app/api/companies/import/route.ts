import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import * as XLSX from 'xlsx'

interface CompanyRow {
  name?: string
  slug?: string
  careers_url?: string
  linkedin_jobs_url?: string
  platform?: string
  work_model?: string
  hq?: string
  tags?: string
  priority?: number
  relevant_for?: string
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const rows: CompanyRow[] = XLSX.utils.sheet_to_json(worksheet)

    const supabase = createServerClient()
    let imported = 0
    let updated = 0
    const errors: string[] = []

    for (const row of rows) {
      if (!row.name) {
        errors.push(`Row missing name: ${JSON.stringify(row)}`)
        continue
      }

      const slug = row.slug || row.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      const platform = (row.platform || 'unknown').toLowerCase()
      const validPlatforms = ['greenhouse', 'lever', 'ashby', 'generic_html', 'linkedin', 'unknown']
      const platformKey = validPlatforms.includes(platform) ? platform : 'unknown'

      // Normalize work_model to match database constraint
      let workModel: string | null = null
      if (row.work_model) {
        const normalized = row.work_model.toLowerCase().trim()
        if (normalized.includes('remote') || normalized === 'wfh' || normalized === 'work from home') {
          workModel = 'remote'
        } else if (normalized.includes('hybrid')) {
          workModel = 'hybrid'
        } else if (normalized.includes('onsite') || normalized.includes('on-site') || normalized.includes('in-office') || normalized.includes('in office')) {
          workModel = 'onsite'
        } else if (normalized === 'unknown' || normalized === '') {
          workModel = 'unknown'
        } else {
          // If it doesn't match, default to null (which is allowed)
          workModel = null
        }
      }

      const companyData = {
        slug,
        name: row.name,
        careers_url: row.careers_url || null,
        linkedin_jobs_url: row.linkedin_jobs_url || null,
        platform_key: platformKey,
        work_model: workModel,
        hq: row.hq || null,
        tags: row.tags ? row.tags.split(',').map(t => t.trim()) : null,
        priority: row.priority || 0,
        relevant_for: row.relevant_for || null,
      }

      // Check if company exists
      const { data: existing, error: checkError } = await supabase
        .from('companies')
        .select('id')
        .eq('slug', slug)
        .single()

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned (expected for new companies)
        errors.push(`Error checking company ${row.name}: ${checkError.message}`)
        continue
      }

      if (existing) {
        const { error: updateError } = await supabase
          .from('companies')
          .update(companyData)
          .eq('id', existing.id)
        
        if (updateError) {
          errors.push(`Error updating ${row.name}: ${updateError.message}`)
        } else {
          updated++
        }
      } else {
        const { error: insertError } = await supabase
          .from('companies')
          .insert(companyData)
        
        if (insertError) {
          errors.push(`Error inserting ${row.name}: ${insertError.message}`)
        } else {
          imported++
        }
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      updated,
      totalRows: rows.length,
      errors: errors.length > 0 ? errors : undefined,
      errorCount: errors.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

