import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

function escapeCsvValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export async function GET() {
  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('companies')
      .select('name,platform_key,careers_url,last_checked_at,last_fetch_error,created_at,updated_at')
      .order('name')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const headers = ['Name', 'Platform', 'Careers URL', 'Last Checked', 'Last Fetch Error', 'Created At', 'Updated At']
    const rows = data?.map((row) =>
      [
        escapeCsvValue(row.name),
        escapeCsvValue(row.platform_key),
        escapeCsvValue(row.careers_url),
        escapeCsvValue(row.last_checked_at),
        escapeCsvValue(row.last_fetch_error),
        escapeCsvValue(row.created_at),
        escapeCsvValue(row.updated_at),
      ].join(',')
    ) || []

    const csvContent = [headers.join(','), ...rows].join('\n')
    const filename = `companies-${new Date().toISOString().split('T')[0]}.csv`

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


