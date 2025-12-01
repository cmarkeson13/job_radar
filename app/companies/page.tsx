'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { normalizeCareersUrl, displayUrl } from '@/lib/url-utils'
import { Company } from '@/lib/database.types'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'

interface DebugResult {
  url: string
  suggestions?: string[]
  analysis?: {
    htmlLength?: number
    jsonLdCount?: number
    embeddedJsonCount?: number
    platformIndicators?: Record<string, boolean>
  }
  patterns?: Array<{
    name: string
    count: number
    matches?: Array<{ href: string; text: string }>
  }>
}

function CompaniesPageContent() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState<string | null>(null)
  const [fetchingAll, setFetchingAll] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [debugResult, setDebugResult] = useState<{ company: Company; result: DebugResult } | null>(null)
  const [jobCounts, setJobCounts] = useState<Record<string, number>>({})
  const [missingDescCounts, setMissingDescCounts] = useState<Record<string, number>>({})
  const [bulkProgress, setBulkProgress] = useState<{
    total: number
    completed: number
    success: number
    failed: number
    current?: string
    finished?: boolean
  } | null>(null)
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<'fetch' | 'detect' | 'delete' | null>(null)

  useEffect(() => {
    loadCompanies()
  }, [])

  async function loadCompanies() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('name')

      if (error) {
        console.error('Error loading companies:', error)
        alert(`Error loading companies: ${error.message}`)
      } else {
        console.log(`Loaded ${data?.length || 0} companies from database`)
        setCompanies(data || [])
        // Also load job counts per company to drive Connection indicator
        const { data: jobsData, error: jobsError } = await supabase
          .from('jobs')
          .select('company_id')

        if (!jobsError && jobsData) {
          const counts: Record<string, number> = {}
          for (const row of jobsData as any[]) {
            const id = row.company_id as string
            counts[id] = (counts[id] || 0) + 1
          }
          setJobCounts(counts)
        }

        const { data: missingJobs, error: missingError } = await supabase
          .from('jobs')
          .select('company_id')
          .is('full_description', null)
          .is('description_snippet', null)

        if (!missingError && missingJobs) {
          const missingCounts: Record<string, number> = {}
          for (const row of missingJobs as any[]) {
            const id = row.company_id as string
            missingCounts[id] = (missingCounts[id] || 0) + 1
          }
          setMissingDescCounts(missingCounts)
        }
      }
    } catch (error) {
      console.error('Failed to connect to Supabase:', error)
      alert(`Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}. Check your .env.local file.`)
    }
    setLoading(false)
  }

  async function fetchJobs(companyId: string) {
    setFetching(companyId)
    try {
      const response = await fetch('/api/jobs/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      })
      const result = await response.json()
      if (result.success) {
        alert(`Fetched jobs: ${result.jobsAdded} new, ${result.jobsUpdated} updated`)
        loadCompanies() // Refresh to update last_checked_at
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setFetching(null)
    }
  }

  async function debugCompany(company: Company) {
    if (!company.careers_url) {
      alert('No careers URL for this company')
      return
    }

    try {
      const response = await fetch('/api/debug-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: company.careers_url }),
      })
      const result = await response.json()
      
      if (result.error) {
        alert(`Debug Error: ${result.error}`)
        return
      }

      console.log('Full Debug Results:', result)
      setDebugResult({ company, result })
    } catch (error) {
      alert(`Debug Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async function exportCompanies() {
    setExporting(true)
    try {
      const response = await fetch('/api/companies/export')
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Failed to export companies')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `companies-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      alert(`Export error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setExporting(false)
    }
  }

  function toggleCompanySelection(companyId: string, checked: boolean) {
    setSelectedCompanyIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(companyId)
      else next.delete(companyId)
      return next
    })
  }

  function toggleSelectAllCompanies(checked: boolean) {
    if (checked) {
      setSelectedCompanyIds(new Set(companies.map(c => c.id)))
    } else {
      setSelectedCompanyIds(new Set())
    }
  }

  async function performFetchForCompany(id: string) {
    const response = await fetch('/api/jobs/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: id }),
    })
    const result = await response.json()
    if (!response.ok || result.error) {
      throw new Error(result.error || 'Fetch failed')
    }
  }

  async function performDetectForCompany(id: string) {
    const response = await fetch('/api/companies/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: id }),
    })
    const result = await response.json()
    if (!response.ok || result.error) {
      throw new Error(result.error || 'Detect failed')
    }
  }

  async function fetchSelectedCompanies() {
    if (selectedCompanyIds.size === 0) return
    if (!confirm(`Fetch jobs for ${selectedCompanyIds.size} selected compan${selectedCompanyIds.size === 1 ? 'y' : 'ies'}?`)) return
    setBulkAction('fetch')
    try {
      for (const id of selectedCompanyIds) {
        await performFetchForCompany(id)
      }
      alert(`Fetched jobs for ${selectedCompanyIds.size} compan${selectedCompanyIds.size === 1 ? 'y' : 'ies'}.`)
      setSelectedCompanyIds(new Set())
      loadCompanies()
    } catch (error) {
      alert(`Bulk fetch error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setBulkAction(null)
    }
  }

  async function detectSelectedCompanies() {
    if (selectedCompanyIds.size === 0) return
    setBulkAction('detect')
    try {
      for (const id of selectedCompanyIds) {
        await performDetectForCompany(id)
      }
      alert(`Detection complete for ${selectedCompanyIds.size} compan${selectedCompanyIds.size === 1 ? 'y' : 'ies'}.`)
      setSelectedCompanyIds(new Set())
      loadCompanies()
    } catch (error) {
      alert(`Detect error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setBulkAction(null)
    }
  }

  async function deleteSelectedCompanies() {
    if (selectedCompanyIds.size === 0) return
    if (!confirm(`Delete ${selectedCompanyIds.size} compan${selectedCompanyIds.size === 1 ? 'y' : 'ies'}? This cannot be undone.`)) return
    setBulkAction('delete')
    try {
      const { error } = await supabase
        .from('companies')
        .delete()
        .in('id', Array.from(selectedCompanyIds))
      if (error) {
        throw new Error(error.message)
      }
      alert(`Deleted ${selectedCompanyIds.size} compan${selectedCompanyIds.size === 1 ? 'y' : 'ies'}.`)
      setSelectedCompanyIds(new Set())
      loadCompanies()
    } catch (error) {
      alert(`Delete error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setBulkAction(null)
    }
  }

  async function fetchAllJobs() {
    if (!confirm(`Fetch jobs for all ${companies.length} companies? This may take a while.`)) {
      return
    }
    
    const startTime = Date.now()
    console.log(`[Bulk Fetch] Starting fetch for ${companies.length} companies...`)
    console.log(`[Bulk Fetch] Processing companies in parallel batches (5 at a time)...`)
    
    setFetchingAll(true)
    setBulkProgress(null)
    let sessionId: string | null = null
    let pollInterval: NodeJS.Timeout | null = null
    let lastLogIndex = 0
    let seenProgress = false
    
    try {
      // Start the fetch
      const response = await fetch('/api/jobs/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // No companyId = fetch all
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText || 'Unknown error'}`)
      }
      
      const result = await response.json()
      
      if (!result.success) {
        const errorMsg = result.error || 'Unknown error occurred'
        console.error('[Bulk Fetch] Error:', errorMsg)
        alert(`Error: ${errorMsg}`)
        return
      }
      
      sessionId = result.sessionId
      if (!sessionId) {
        throw new Error('No sessionId returned from fetch')
      }
      
      // Poll for progress updates
      pollInterval = setInterval(async () => {
        try {
          const progressResponse = await fetch(`/api/jobs/fetch-progress?sessionId=${sessionId}`)
          if (!progressResponse.ok) {
            if (progressResponse.status === 404 && seenProgress) {
              console.warn('[Bulk Fetch] Progress entry missing; assuming completed.')
              if (pollInterval) {
                clearInterval(pollInterval)
              }
              setFetchingAll(false)
              setBulkProgress(null)
              await loadCompanies()
            }
            return // Progress not ready yet or already cleaned up
          }
          
          const progress = await progressResponse.json()
          seenProgress = true
          setBulkProgress({
            total: progress.total,
            completed: progress.completed,
            success: progress.success,
            failed: progress.failed,
            current: progress.current,
            finished: progress.finished,
          })
          
          // Log new messages to browser console
          if (progress.logs && progress.logs.length > lastLogIndex) {
            const newLogs = progress.logs.slice(lastLogIndex)
            for (const log of newLogs) {
              console.log(`[Bulk Fetch] ${log.message}`)
            }
            lastLogIndex = progress.logs.length
          }
          
          // Show current status
          if (progress.current) {
            console.log(`[Bulk Fetch] Currently processing: ${progress.current} (${progress.completed}/${progress.total})`)
          }
          
          // If finished, stop polling and show results
          if (progress.finished) {
            if (pollInterval) {
              clearInterval(pollInterval)
            }
            
            const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1)
            console.log(`[Bulk Fetch] ✅ Complete in ${totalElapsed}s`)
            
            let message = `Bulk fetch complete: ${progress.success} succeeded, ${progress.failed} failed (Total: ${progress.total})\nTime: ${totalElapsed}s`
            if (progress.errors && progress.errors.length > 0) {
              message += `\n\nErrors:\n${progress.errors.slice(0, 5).join('\n')}`
              if (progress.errors.length > 5) {
                message += `\n... and ${progress.errors.length - 5} more (check console for full list)`
              }
            }
            
            alert(message)
            loadCompanies()
            setFetchingAll(false)
            setBulkProgress(null)
            seenProgress = false
          }
        } catch (error) {
          console.error('[Bulk Fetch] Error polling progress:', error)
        }
      }, 1000) // Poll every second
      
      // Set a timeout to stop polling after 10 minutes (safety)
      setTimeout(() => {
        if (pollInterval) {
          clearInterval(pollInterval)
          console.warn('[Bulk Fetch] Polling timeout - fetch may still be running')
          setFetchingAll(false)
        }
      }, 10 * 60 * 1000)
      
    } catch (error) {
      if (pollInterval) {
        clearInterval(pollInterval)
      }
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.error(`[Bulk Fetch] Error after ${elapsed}s:`, error)
      alert(`Error: ${errorMsg}`)
      setFetchingAll(false)
      setBulkProgress(null)
    }
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/companies/import', {
        method: 'POST',
        body: formData,
      })
      const result = await response.json()
      if (result.success) {
        let message = `Imported ${result.imported} companies, updated ${result.updated}`
        if (result.totalRows) {
          message += ` (out of ${result.totalRows} rows)`
        }
        if (result.errorCount > 0) {
          message += `\n\n⚠️ ${result.errorCount} rows had errors:`
          if (result.errors && result.errors.length > 0) {
            const errorPreview = result.errors.slice(0, 5).join('\n')
            message += `\n\n${errorPreview}`
            if (result.errors.length > 5) {
              message += `\n... and ${result.errors.length - 5} more errors`
            }
          }
        }
        alert(message)
        // Force reload companies
        await loadCompanies()
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
    // Reset file input
    event.target.value = ''
  }

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="p-8">
      {(fetching || fetchingAll) && (
        <div className="fixed top-4 right-4 z-50 bg-white shadow-lg border border-gray-200 rounded-lg px-4 py-3 w-72">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <div>
              {fetchingAll ? (
                <>
                  <p className="text-sm font-semibold text-gray-800">Fetching all companies…</p>
                  <p className="text-xs text-gray-600">
                    {bulkProgress
                      ? `${bulkProgress.completed}/${bulkProgress.total} processed · ${bulkProgress.success} ✓ ${bulkProgress.failed} ✗`
                      : 'Starting…'}
                  </p>
                  {bulkProgress?.current && (
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      Current: {bulkProgress.current}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-700">
                  Fetching jobs for{' '}
                  <span className="font-semibold">
                    {companies.find(c => c.id === fetching)?.name || 'company'}
                  </span>
                  …
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Companies <span className="text-gray-500 text-xl">({companies.length})</span></h1>
          <div className="flex gap-4">
            <button
              onClick={fetchAllJobs}
              disabled={fetchingAll || companies.length === 0}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {fetchingAll ? 'Fetching All...' : 'Fetch All Jobs'}
            </button>
            <button
              onClick={async () => {
                const resp = await fetch('/api/companies/detect-all', { method: 'POST' })
                const result = await resp.json()
                if (result.error) {
                  alert(`Detect All error: ${result.error}`)
                } else {
                  alert(`Detect All complete: ${result.detected} detected, ${result.updated} updated (Total companies: ${result.total})`)
                  loadCompanies()
                }
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            >
              Detect All
            </button>
            <button
              onClick={exportCompanies}
              disabled={exporting}
              className="px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {exporting ? 'Exporting...' : 'Download CSV'}
            </button>
            <label className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 cursor-pointer">
              Import Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <Link href="/" className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
              Home
            </Link>
          </div>
        </div>

        {selectedCompanyIds.size > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 rounded px-4 py-3 mb-4 text-sm text-indigo-900 flex flex-wrap items-center gap-3">
            <span>{selectedCompanyIds.size} selected</span>
            <button
              onClick={fetchSelectedCompanies}
              disabled={!!bulkAction}
              className="px-3 py-1 bg-purple-600 text-white rounded disabled:bg-gray-400"
            >
              {bulkAction === 'fetch' ? 'Fetching…' : 'Fetch Selected'}
            </button>
            <button
              onClick={detectSelectedCompanies}
              disabled={!!bulkAction}
              className="px-3 py-1 bg-blue-600 text-white rounded disabled:bg-gray-400"
            >
              {bulkAction === 'detect' ? 'Detecting…' : 'Detect Selected'}
            </button>
            <button
              onClick={deleteSelectedCompanies}
              disabled={!!bulkAction}
              className="px-3 py-1 bg-red-600 text-white rounded disabled:bg-gray-400"
            >
              {bulkAction === 'delete' ? 'Deleting…' : 'Delete Selected'}
            </button>
            <button onClick={() => setSelectedCompanyIds(new Set())} className="text-xs underline">
              Clear selection
            </button>
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedCompanyIds.size > 0 && selectedCompanyIds.size === companies.length}
                    onChange={(e) => toggleSelectAllCompanies(e.target.checked)}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Platform</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Careers URL</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Checked</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Connection</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {companies.map((company) => (
                <tr key={company.id}>
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selectedCompanyIds.has(company.id)}
                      onChange={(e) => toggleCompanySelection(company.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{company.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <select
                      value={company.platform_key}
                      onChange={async (e) => {
                        const newPlatform = e.target.value
                        if (confirm(`Update ${company.name} platform to '${newPlatform}'?`)) {
                          const { error } = await supabase
                            .from('companies')
                            .update({ platform_key: newPlatform as any })
                            .eq('id', company.id)
                          
                          if (error) {
                            alert(`Error: ${error.message}`)
                          } else {
                            loadCompanies() // Refresh to show updated platform
                          }
                        } else {
                          // Reset dropdown to original value
                          e.target.value = company.platform_key
                        }
                      }}
                      className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
                    >
                      <option value="greenhouse">greenhouse</option>
                      <option value="lever">lever</option>
                      <option value="ashby">ashby</option>
                      <option value="workable">workable</option>
                      <option value="polymer">polymer</option>
                      <option value="generic_html">generic_html</option>
                      <option value="linkedin">linkedin</option>
                      <option value="unknown">unknown</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {company.careers_url ? (
                      (() => {
                        const normalized = normalizeCareersUrl(company.careers_url)
                        if (!normalized) {
                          return <span className="text-red-600">Invalid URL</span>
                        }
                        const label = displayUrl(company.careers_url)
                        return (
                          <a href={normalized} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {label.length > 50 ? label.substring(0, 50) + '...' : label}
                          </a>
                        )
                      })()
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {company.last_checked_at ? new Date(company.last_checked_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <div className="flex items-center justify-center gap-1">
                      {company.last_fetch_error ? (
                        <span className="text-yellow-600" title={company.last_fetch_error}>
                          ⚠
                        </span>
                      ) : jobCounts[company.id] && jobCounts[company.id] > 0 ? (
                        <span className="text-green-600" title={`${jobCounts[company.id]} job(s) found`}>
                          ✓
                        </span>
                      ) : (
                        <span className="text-gray-400" title="No jobs detected yet">
                          —
                        </span>
                      )}
                      {missingDescCounts[company.id] && missingDescCounts[company.id] > 0 && (
                        <span
                          className="text-orange-500"
                          title={`${missingDescCounts[company.id]} job(s) missing description`}
                        >
                          !
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex gap-2">
                      <button
                        onClick={() => fetchJobs(company.id)}
                        disabled={fetching === company.id}
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {fetching === company.id ? 'Fetching...' : 'Fetch Jobs'}
                      </button>
                      <button
                        onClick={async () => {
                          const resp = await fetch('/api/companies/detect', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ companyId: company.id }),
                          })
                          const result = await resp.json()
                          if (result.error) {
                            alert(`Detect error: ${result.error}`)
                          } else if (result.platform) {
                            alert(`Detected platform: ${result.platform}\nURL: ${result.careers_url}`)
                            loadCompanies()
                          } else {
                            alert('No platform detected.')
                          }
                        }}
                        className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                        title="Detect platform and update URL"
                      >
                        Detect
                      </button>
                      {company.platform_key === 'generic_html' && (
                        <button
                          onClick={() => debugCompany(company)}
                          className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                          title="Debug HTML structure"
                        >
                          🔍 Debug
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {companies.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No companies found. Import an Excel file to get started.
          </div>
        )}
      </div>

      {/* Debug Modal */}
      {debugResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold">🔍 Debug Results: {debugResult.company.name}</h2>
              <button
                onClick={() => setDebugResult(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-700 mb-1">URL</h3>
                  <a href={debugResult.result.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                    {debugResult.result.url}
                  </a>
                </div>

                {debugResult.result.suggestions && debugResult.result.suggestions.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-2">Suggestions</h3>
                    <ul className="space-y-1">
                      {debugResult.result.suggestions.map((suggestion, idx) => (
                        <li key={idx} className="text-sm">
                          {suggestion.startsWith('✅') && <span className="text-green-600">✅</span>}
                          {suggestion.startsWith('⚠️') && <span className="text-yellow-600">⚠️</span>}
                          {suggestion.startsWith('❌') && <span className="text-red-600">❌</span>}
                          {' '}
                          {suggestion.replace(/^[✅⚠️❌]\s*/, '')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {debugResult.result.analysis && (
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-2">Analysis</h3>
                    <ul className="space-y-1 text-sm">
                      <li>HTML Length: {debugResult.result.analysis.htmlLength?.toLocaleString()} chars</li>
                      <li>JSON-LD Found: {debugResult.result.analysis.jsonLdCount || 0}</li>
                      <li>Embedded JSON: {debugResult.result.analysis.embeddedJsonCount || 0}</li>
                      {debugResult.result.analysis.platformIndicators && (
                        <li>
                          Platform Indicators:{' '}
                          {Object.entries(debugResult.result.analysis.platformIndicators)
                            .filter(([_, detected]) => detected)
                            .map(([platform]) => platform)
                            .join(', ') || 'None'}
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {debugResult.result.patterns && debugResult.result.patterns.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-2">Patterns Found</h3>
                    <div className="space-y-3">
                      {debugResult.result.patterns.map((pattern, idx) => (
                        <div key={idx} className="border border-gray-200 rounded p-3">
                          <div className="font-medium text-sm mb-1">{pattern.name}: {pattern.count} matches</div>
                          {pattern.matches && pattern.matches.length > 0 && (
                            <ul className="text-xs text-gray-600 space-y-1 mt-2">
                              {pattern.matches.slice(0, 5).map((match, midx) => (
                                <li key={midx} className="truncate">
                                  • {match.text?.substring(0, 80)}...
                                </li>
                              ))}
                              {pattern.matches.length > 5 && (
                                <li className="text-gray-400">... and {pattern.matches.length - 5} more</li>
                              )}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-500 pt-2 border-t border-gray-200">
                  💡 Tip: Check the browser console (F12) for full JSON details.
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-between items-center">
              {debugResult.result.analysis?.platformIndicators && 
               Object.entries(debugResult.result.analysis.platformIndicators).some(([_, detected]) => detected) && (
                <div className="flex gap-2">
                  <span className="text-sm text-gray-600">Quick Fix: Update platform to</span>
                  {Object.entries(debugResult.result.analysis.platformIndicators)
                    .filter(([_, detected]) => detected)
                    .map(([platform]) => (
                      <button
                        key={platform}
                        onClick={async () => {
                          if (confirm(`Update ${debugResult.company.name} platform to '${platform}'?`)) {
                            const { error } = await supabase
                              .from('companies')
                              .update({ platform_key: platform as any })
                              .eq('id', debugResult.company.id)
                            
                            if (error) {
                              alert(`Error: ${error.message}`)
                            } else {
                              alert(`Updated platform to '${platform}'. Refresh the page to see changes.`)
                              setDebugResult(null)
                              loadCompanies()
                            }
                          }
                        }}
                        className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                      >
                        {platform}
                      </button>
                    ))}
                </div>
              )}
              <button
                onClick={() => setDebugResult(null)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CompaniesPage() {
  return (
    <AuthGuard>
      <CompaniesPageContent />
    </AuthGuard>
  )
}

