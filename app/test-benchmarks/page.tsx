'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'
import { ModelToggle, useModelPreference } from '@/components/ModelToggle'
import { supabase } from '@/lib/supabase'
import { Job } from '@/lib/database.types'

function TestBenchmarksPageContent() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [filterClosed, setFilterClosed] = useState<boolean>(false)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const [search, setSearch] = useState<string>('')
  const [remoteOnly, setRemoteOnly] = useState<boolean>(false)
  const [minScore, setMinScore] = useState<number>(0)
  const [scoring, setScoring] = useState<boolean>(false)
  const { modelQuality, setModelQuality } = useModelPreference()
  const [sortKey, setSortKey] = useState<'company' | 'title' | 'location' | 'remote' | 'status' | 'score' | 'posted'>('posted')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [analyzerOutput, setAnalyzerOutput] = useState<string>('')
  const [analyzerLoading, setAnalyzerLoading] = useState<boolean>(false)
  const [analyzerError, setAnalyzerError] = useState<string>('')

  useEffect(() => {
    loadJobs()
  }, [filterClosed, search, remoteOnly])

  async function loadJobs() {
    setLoading(true)
    let query = supabase
      .from('jobs')
      .select(
        `
        *,
        companies (
          name,
          slug,
          last_fetch_error
        )
      `,
      )
      .filter('job_uid', 'ilike', 'bench_%')
      .order('detected_at', { ascending: false })

    if (!filterClosed) {
      query = query.eq('closed_flag', false)
    }

    if (remoteOnly) {
      query = query.eq('remote_flag', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error loading benchmark jobs:', error)
      alert(`Error loading benchmark jobs: ${error.message}`)
    } else {
      let rows = data || []
      if (search.trim()) {
        const s = search.trim().toLowerCase()
        rows = rows.filter((r: any) => (r.title || '').toLowerCase().includes(s) || ((r as any).companies?.name || '').toLowerCase().includes(s))
      }
      setJobs(rows)
    }
    setLoading(false)
  }

  function toggleSelect(jobId: string, index: number, checked: boolean, shiftKey?: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (shiftKey && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, index)
        const end = Math.max(lastSelectedIndex, index)
        for (let i = start; i <= end; i++) {
          const id = displayJobs[i]?.id
          if (!id) continue
          if (checked) next.add(id)
          else next.delete(id)
        }
      } else {
        if (checked) next.add(jobId)
        else next.delete(jobId)
      }
      return next
    })
    setLastSelectedIndex(index)
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) setSelectedIds(new Set(displayJobs.map(j => j.id)))
    else setSelectedIds(new Set())
  }

  async function scoreSelectedJobs() {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : selectedJob ? [selectedJob.id] : []
    if (ids.length === 0) {
      alert('Select at least one job or open a job in the detail panel to score.')
      return
    }

    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) {
      alert('You must be logged in to score jobs.')
      return
    }

    setScoring(true)
    try {
      for (const jobId of ids) {
        const response = await fetch('/api/jobs/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: session.user.id, jobId, modelQuality }),
        })
        const result = await response.json()
        if (!response.ok) {
          console.error('Scoring error:', result.error)
          alert(`Failed to score job: ${result.error || 'Unknown error'}`)
          break
        }
      }
      await loadJobs()
      if (selectedJob) {
        const refreshed = await supabase.from('jobs').select('*').eq('id', selectedJob.id).single()
        if (refreshed.data) setSelectedJob(refreshed.data as Job)
      }
      setSelectedIds(new Set())
      alert(`Scored ${ids.length} job(s).`)
    } finally {
      setScoring(false)
    }
  }

  const filteredJobs = jobs.filter(job => {
    if (minScore > 0 && job.score_you !== null && job.score_you !== undefined) {
      return job.score_you >= minScore
    }
    if (minScore > 0 && (job.score_you === null || job.score_you === undefined)) {
      return false
    }
    return true
  })

  function compareJobs(a: Job, b: Job) {
    const getCompany = (job: Job) => ((job as any).companies?.name || '').toLowerCase()
    const getTitle = (job: Job) => (job.title || '').toLowerCase()
    const getLocation = (job: Job) => (job.location_raw || '').toLowerCase()
    const getStatus = (job: Job) => job.status || ''
    const getScore = (job: Job) => job.score_you ?? -1
    const getPosted = (job: Job) => (job.posted_at ? new Date(job.posted_at).getTime() : 0)
    const getRemote = (job: Job) => (job.remote_flag === true ? 1 : job.remote_flag === false ? 0 : -1)

    let result = 0
    switch (sortKey) {
      case 'company':
        result = getCompany(a).localeCompare(getCompany(b))
        break
      case 'title':
        result = getTitle(a).localeCompare(getTitle(b))
        break
      case 'location':
        result = getLocation(a).localeCompare(getLocation(b))
        break
      case 'status':
        result = getStatus(a).localeCompare(getStatus(b))
        break
      case 'score':
        result = getScore(a) - getScore(b)
        break
      case 'remote':
        result = getRemote(a) - getRemote(b)
        break
      case 'posted':
      default:
        result = getPosted(a) - getPosted(b)
        break
    }
    return sortDirection === 'asc' ? result : -result
  }

  const displayJobs = [...filteredJobs].sort(compareJobs)

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection(key === 'posted' ? 'desc' : 'asc')
    }
  }

  function renderSortIndicator(key: typeof sortKey) {
    if (sortKey !== key) return null
    return sortDirection === 'asc' ? ' ▲' : ' ▼'
  }

  async function runAnalyzer() {
    setAnalyzerLoading(true)
    setAnalyzerError('')
    try {
      const resp = await fetch('/api/benchmarks/analyze', { method: 'POST' })
      const data = await resp.json()
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Analyzer failed')
      }
      setAnalyzerOutput(data.output || '')
    } catch (err) {
      setAnalyzerError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setAnalyzerLoading(false)
    }
  }

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">
            Test Benchmarks <span className="text-gray-500 text-xl">({filteredJobs.length}/{jobs.length})</span>
          </h1>
          <div className="flex gap-3 items-center">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search title or company"
              className="px-3 py-2 border border-gray-300 rounded w-64"
            />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={remoteOnly} onChange={e => setRemoteOnly(e.target.checked)} />
              Remote only
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              Minimum score
              <input
                type="number"
                min={0}
                max={100}
                value={minScore}
                onChange={e => setMinScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                className="w-20 px-2 py-1 border rounded"
              />
            </label>
            <ModelToggle value={modelQuality} onChange={setModelQuality} />
            <button
              onClick={scoreSelectedJobs}
              disabled={scoring}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
            >
              {scoring ? 'Scoring...' : 'Score Selected'}
            </button>
            <button
              onClick={runAnalyzer}
              disabled={analyzerLoading}
              className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400"
            >
              {analyzerLoading ? 'Running…' : 'Run Analyzer'}
            </button>
            <Link href="/" className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
              Home
            </Link>
          </div>
        </div>

        <div className="mb-4 flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filterClosed}
              onChange={e => setFilterClosed(e.target.checked)}
              className="rounded"
            />
            <span>Show Closed Jobs</span>
          </label>
        </div>

        <div className="mb-6 bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-lg font-semibold text-gray-900">Analyzer Output</div>
            <button
              onClick={runAnalyzer}
              disabled={analyzerLoading}
              className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 text-sm"
            >
              {analyzerLoading ? 'Running…' : 'Run Analyzer'}
            </button>
          </div>
          {analyzerError && <div className="text-sm text-red-600 mb-2">Error: {analyzerError}</div>}
          <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 rounded p-3 overflow-auto max-h-96">
            {analyzerOutput || 'No analyzer output yet.'}
          </pre>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className={`${selectedJob ? 'col-span-2' : 'col-span-3'} bg-white rounded-lg shadow overflow-hidden`}>
            <div className="overflow-x-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-600">{selectedIds.size > 0 ? `${selectedIds.size} selected` : ''}</div>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.size > 0 && selectedIds.size === displayJobs.length}
                        onChange={e => toggleSelectAll(e.target.checked)}
                      />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer"
                      onClick={() => handleSort('company')}
                    >
                      Company{renderSortIndicator('company')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer"
                      onClick={() => handleSort('title')}
                    >
                      Title{renderSortIndicator('title')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer"
                      onClick={() => handleSort('location')}
                    >
                      Location{renderSortIndicator('location')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer"
                      onClick={() => handleSort('remote')}
                    >
                      Remote{renderSortIndicator('remote')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer"
                      onClick={() => handleSort('status')}
                    >
                      Status{renderSortIndicator('status')}
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer"
                      onClick={() => handleSort('score')}
                    >
                      Score{renderSortIndicator('score')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fetch Error</th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer"
                      onClick={() => handleSort('posted')}
                    >
                      Posted{renderSortIndicator('posted')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayJobs.map((job, idx) => {
                    const isSelected = selectedIds.has(job.id)
                    const companyName = (job as any).companies?.name || ''
                    return (
                      <tr
                        key={job.id}
                        className={`hover:bg-gray-50 cursor-pointer ${selectedJob?.id === job.id ? 'bg-indigo-50' : ''}`}
                        onClick={() => setSelectedJob(job)}
                      >
                        <td className="px-2 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={e => toggleSelect(job.id, idx, e.target.checked, (e.nativeEvent as any).shiftKey)}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{companyName}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{job.title}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{job.location_raw || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{job.remote_flag === true ? '✓' : job.remote_flag === false ? 'X' : '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{job.status || 'New'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{job.score_you !== null && job.score_you !== undefined ? `${job.score_you}%` : '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{(job as any).companies?.last_fetch_error || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{job.posted_at ? new Date(job.posted_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {selectedJob && (
            <div className="col-span-1 bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="text-xs uppercase text-gray-500">{(selectedJob as any).companies?.name || 'Company'}</div>
                  <div className="text-lg font-semibold">{selectedJob.title}</div>
                  <div className="text-sm text-gray-600">
                    {selectedJob.location_raw || 'Unknown'} • {selectedJob.remote_flag ? 'Remote OK' : 'Onsite/Hybrid'}
                  </div>
                </div>
                <button onClick={() => setSelectedJob(null)} className="text-gray-500 hover:text-gray-700 text-sm">
                  Close
                </button>
              </div>
              <div className="space-y-2 text-sm text-gray-800">
                <div>
                  <span className="font-semibold">Score:</span>{' '}
                  {selectedJob.score_you !== null && selectedJob.score_you !== undefined ? `${selectedJob.score_you}%` : '—'}
                </div>
                <div>
                  <span className="font-semibold">Status:</span> {selectedJob.status || 'New'}
                </div>
                <div>
                  <span className="font-semibold">Posted:</span>{' '}
                  {selectedJob.posted_at ? new Date(selectedJob.posted_at).toLocaleDateString() : '—'}
                </div>
                <div className="text-gray-600 whitespace-pre-wrap">{selectedJob.description_snippet || 'No description snippet'}</div>
                <div className="text-gray-600 whitespace-pre-wrap">{selectedJob.full_description || ''}</div>
                <div className="text-sm text-gray-600">
                  <Link href={`/jobs/${selectedJob.id}`} className="text-indigo-600 hover:text-indigo-800 underline">
                    View raw job record
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TestBenchmarksPage() {
  return (
    <AuthGuard>
      <TestBenchmarksPageContent />
    </AuthGuard>
  )
}

