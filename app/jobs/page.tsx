'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Job } from '@/lib/database.types'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'

function JobsPageContent() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterClosed, setFilterClosed] = useState<boolean>(false)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState<string>('')
  const [companyFilter, setCompanyFilter] = useState<string>('all')
  const [remoteOnly, setRemoteOnly] = useState<boolean>(false)

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

  function toggleSelect(jobId: string, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(jobId)
      else next.delete(jobId)
      return next
    })
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(jobs.map(j => j.id)))
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

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Jobs <span className="text-gray-500 text-xl">({jobs.length})</span></h1>
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
                        checked={selectedIds.size > 0 && selectedIds.size === jobs.length}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Remote</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fetch Error</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Posted</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {jobs.map((job) => {
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
                            onChange={(e) => toggleSelect(job.id, e.target.checked)}
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{company?.name || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{job.notes?.includes('⭐') ? '⭐ ' : ''}{job.title}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{job.location_raw || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {job.remote_flag === true ? '✓' : job.remote_flag === false ? '✗' : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{job.status}</td>
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
            {jobs.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No jobs found. Fetch jobs from the Companies page.
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
                {selectedJob.description_snippet && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{selectedJob.description_snippet}</p>
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

