export function normalizeCareersUrl(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const ensuredScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(ensuredScheme)
    url.protocol = 'https:'
    url.hash = ''
    url.search = ''
    url.pathname = url.pathname.replace(/\/+$/, '')
    url.host = url.host.toLowerCase()
    return url.toString()
  } catch {
    return ensuredScheme
  }
}

export function displayUrl(value?: string | null): string {
  if (!value) return '—'
  return value.replace(/^https?:\/\//i, '')
}


