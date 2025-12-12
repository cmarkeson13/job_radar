'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Job } from '@/lib/database.types'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'
import { ModelToggle, useModelPreference } from '@/components/ModelToggle'

function JobsPageContent() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterClosed, setFilterClosed] = useState<boolean>(false)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null)
  const [search, setSearch] = useState<string>('')
  const [companyFilter, setCompanyFilter] = useState<string>('all')
  const [remoteOnly, setRemoteOnly] = useState<boolean>(false)
  const [minScore, setMinScore] = useState<number>(0)
  const [scoring, setScoring] = useState<boolean>(false)
  const { modelQuality, setModelQuality } = useModelPreference()
  const [sortKey, setSortKey] = useState<'company' | 'title' | 'location' | 'remote' | 'status' | 'score' | 'posted'>('posted')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    loadJobs()
  }, [filterStatus, filterClosed, search, companyFilter, remoteOnly])

  async function loadJobs() {
    setLoading(true)
    let query = supabase
      .from('jobs')
      .select(`
        *,
        companies (
          name,
          slug,
          last_fetch_error
        )
      `)
      .order('detected_at', { ascending: false })

    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus)
    }

    if (!filterClosed) {
      query = query.eq('closed_flag', false)
    }

    if (remoteOnly) {
      query = query.eq('remote_flag', true)
    }

    if (companyFilter !== 'all') {
      // Filter by company name through the join alias 'companies.name'
      query = query.eq('companies.name', companyFilter)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error loading jobs:', error)
      alert(`Error loading jobs: ${error.message}`)
    } else {
      let rows = data || []
      if (search.trim()) {
        const s = search.trim().toLowerCase()
        rows = rows.filter((r: any) =>
          (r.title || '').toLowerCase().includes(s) ||
          (r.description_snippet || '').toLowerCase().includes(s) ||
          ((r as any).companies?.name || '').toLowerCase().includes(s)
        )
      }
      setJobs(rows)
    }
    setLoading(false)
  }

  async function updateJobStatus(jobId: string, status: Job['status']) {
    const { error } = await supabase
      .from('jobs')
      .update({ status })
      .eq('id', jobId)

    if (error) {
      alert(`Error updating status: ${error.message}`)
    } else {
      loadJobs()
      if (selectedJob?.id === jobId) {
        setSelectedJob({ ...selectedJob, status })
      }
    }
  }

  function toggleSelect(
    jobId: string,
    index: number,
    checked: boolean,
    shiftKey?: boolean,
  ) {
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
    if (checked) {
      setSelectedIds(new Set(displayJobs.map(j => j.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} job(s)?`)) return
    const { error } = await supabase
      .from('jobs')
      .delete()
      .in('id', Array.from(selectedIds))
    if (error) {
      alert(`Error deleting: ${error.message}`)
    } else {
      setSelectedIds(new Set())
      if (selectedJob && selectedIds.has(selectedJob.id)) setSelectedJob(null)
      loadJobs()
    }
  }

  async function bulkFavorite() {
    if (selectedIds.size === 0) return
    const { error } = await supabase
      .from('jobs')
      .update({ notes: '⭐ Favorite' })
      .in('id', Array.from(selectedIds))
    if (error) {
      alert(`Error favoriting: ${error.message}`)
    } else {
      setSelectedIds(new Set())
      loadJobs()
    }
  }

  async function scoreSelectedJobs() {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : (selectedJob ? [selectedJob.id] : [])
    if (ids.length === 0) {
      alert('Select at least one job or open a job in the detail panel to score.')
      return
    }

    const { data: { session } } = await supabase.auth.getSession()
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
        const refreshed = await supabase
          .from('jobs')
          .select('*')
          .eq('id', selectedJob.id)
          .single()
        if (refreshed.data) setSelectedJob(refreshed.data as Job)
      }
      setSelectedIds(new Set())
      alert(`Scored ${ids.length} job(s).`)
    } finally {
      setScoring(false)
    }
  }

  const filteredJobs = jobs.filter((job) => {
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
    const getPosted = (job: Job) => job.posted_at ? new Date(job.posted_at).getTime() : 0
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

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">
            Jobs <span className="text-gray-500 text-xl">({filteredJobs.length}/{jobs.length})</span>
          </h1>
          <div className="flex gap-3 items-center">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, company, description"
              className="px-3 py-2 border border-gray-300 rounded w-64"
            />
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="px-2 py-2 border border-gray-300 rounded"
            >
              <option value="all">All companies</option>
              {Array.from(new Set(jobs.map((j: any) => j.companies?.name).filter(Boolean))).sort().map((name) => (
                <option key={name as string} value={name as string}>{name as string}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} />
              Remote only
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              Minimum score
              <input
                type="number"
                min={0}
                max={100}
                value={minScore}
                onChange={(e) => setMinScore(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
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
              onClick={() => window.location.href = '/'}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Home
            </button>
          </div>
        </div>

        <div className="mb-4 flex gap-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded"
          >
            <option value="all">All Statuses</option>
            <option value="New">New</option>
            <option value="Applied">Applied</option>
            <option value="Interviewing">Interviewing</option>
            <option value="OnHold">On Hold</option>
            <option value="Rejected">Rejected</option>
          </select>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filterClosed}
              onChange={(e) => setFilterClosed(e.target.checked)}
              className="rounded"
            />
            <span>Show Closed Jobs</span>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <div className={`${selectedJob ? 'col-span-2' : 'col-span-3'} bg-white rounded-lg shadow overflow-hidden`}>
            <div className="overflow-x-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-600">
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : ''}
                </div>
                {selectedIds.size > 0 && (
                  <div className="flex gap-2">
                    <button onClick={bulkFavorite} className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600" title="Mark as favorite">⭐ Favorite</button>
                    <button onClick={bulkDelete} className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700" title="Delete selected">Delete</button>
                  </div>
                )}
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.size > 0 && selectedIds.size === displayJobs.length}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer" onClick={() => handleSort('company')}>
                      Company{renderSortIndicator('company')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer" onClick={() => handleSort('title')}>
                      Title{renderSortIndicator('title')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer" onClick={() => handleSort('location')}>
                      Location{renderSortIndicator('location')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer" onClick={() => handleSort('remote')}>
                      Remote{renderSortIndicator('remote')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer" onClick={() => handleSort('status')}>
                      Status{renderSortIndicator('status')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer" onClick={() => handleSort('score')}>
                      Score{renderSortIndicator('score')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fetch Error</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer" onClick={() => handleSort('posted')}>
                      Posted{renderSortIndicator('posted')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {displayJobs.map((job, idx) => {
                    const company = (job as any).companies
                    const hasError = company?.last_fetch_error
                    const isSelected = selectedIds.has(job.id)
                    return (
                      <tr
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        className={`cursor-pointer hover:bg-gray-50 ${selectedJob?.id === job.id ? 'bg-blue-50' : ''} ${hasError ? 'bg-red-50' : ''}`}
                      >
                        <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) =>
                              toggleSelect(
                                job.id,
                                idx,
                                e.target.checked,
                                // use nativeEvent to reliably read modifier keys
                                (e.nativeEvent as MouseEvent).shiftKey,
                              )
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{company?.name || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{job.notes?.includes('⭐') ? '⭐ ' : ''}{job.title}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{job.location_raw || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {job.remote_flag === true ? '✓' : job.remote_flag === false ? '✗' : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{job.status}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {job.score_you !== null && job.score_you !== undefined ? (
                            <span className="font-semibold">{job.score_you}%</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {hasError ? (
                            <span className="text-red-600" title={hasError}>
                              ⚠ Error
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {job.posted_at ? new Date(job.posted_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filteredJobs.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No jobs match the current filters. Adjust filters or fetch more jobs from the Companies page.
              </div>
            )}
          </div>

          {selectedJob && (
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold">{selectedJob.title}</h2>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!selectedJob) return
                      if (confirm('Delete this job?')) {
                        const { error } = await supabase
                          .from('jobs')
                          .delete()
                          .eq('id', selectedJob.id)
                        if (error) {
                          alert(`Error deleting: ${error.message}`)
                        } else {
                          setSelectedJob(null)
                          loadJobs()
                        }
                      }
                    }}
                    className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Delete
                  </button>
                  <button
                    onClick={async () => {
                      if (!selectedJob) return
                      const { error } = await supabase
                        .from('jobs')
                        .update({ notes: '⭐ Favorite' })
                        .eq('id', selectedJob.id)
                      if (error) {
                        alert(`Error: ${error.message}`)
                      } else {
                        loadJobs()
                      }
                    }}
                    className="px-3 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                  >
                    ⭐ Favorite
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={selectedJob.status}
                    onChange={(e) => updateJobStatus(selectedJob.id, e.target.value as Job['status'])}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  >
                    <option value="New">New</option>
                    <option value="Applied">Applied</option>
                    <option value="Interviewing">Interviewing</option>
                    <option value="OnHold">On Hold</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </div>
                {selectedJob.job_url && (
                  <div>
                    <a
                      href={selectedJob.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      View Job Posting →
                    </a>
                  </div>
                )}
                {(selectedJob.full_description || selectedJob.description_snippet) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <div className="text-sm text-gray-700 leading-relaxed job-description space-y-2">
                      {selectedJob.full_description ? (
                        <div
                          dangerouslySetInnerHTML={{
                            __html: selectedJob.full_description,
                          }}
                        />
                      ) : (
                        <p>{selectedJob.description_snippet}</p>
                      )}
                    </div>
                  </div>
                )}
                {selectedJob.score_you !== null && selectedJob.score_you !== undefined && (
                  <div className="space-y-2">
                    <div className="text-lg font-semibold">AI Match Score: {selectedJob.score_you}%</div>
                    {selectedJob.score_reasoning && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reasoning</label>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedJob.score_reasoning}</p>
                      </div>
                    )}
                    {selectedJob.score_strengths && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Strengths</label>
                        <ul className="list-disc list-inside text-sm text-gray-600">
                          {(() => {
                            try {
                              return JSON.parse(selectedJob.score_strengths || '[]')
                            } catch {
                              return []
                            }
                          })().map((item: string, idx: number) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedJob.score_gaps && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Gaps</label>
                        <ul className="list-disc list-inside text-sm text-gray-600">
                          {(() => {
                            try {
                              return JSON.parse(selectedJob.score_gaps || '[]')
                            } catch {
                              return []
                            }
                          })().map((item: string, idx: number) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedJob.score_hard_blockers && (
                      <div>
                        <label className="block text-sm font-medium text-red-700 mb-1">Hard blockers</label>
                        <ul className="list-disc list-inside text-sm text-red-700">
                          {(() => {
                            try {
                              return JSON.parse(selectedJob.score_hard_blockers || '[]')
                            } catch {
                              return []
                            }
                          })().map((item: string, idx: number) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {selectedJob.team && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                    <p className="text-sm text-gray-600">{selectedJob.team}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function JobsPage() {
  return (
    <AuthGuard>
      <JobsPageContent />
    </AuthGuard>
  )
}

