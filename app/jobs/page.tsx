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

  useEffect(() => {
    loadJobs()
  }, [filterStatus, filterClosed])

  async function loadJobs() {
    setLoading(true)
    let query = supabase
      .from('jobs')
      .select(`
        *,
        companies (
          name,
          slug
        )
      `)
      .order('detected_at', { ascending: false })

    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus)
    }

    if (!filterClosed) {
      query = query.eq('closed_flag', false)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error loading jobs:', error)
      alert(`Error loading jobs: ${error.message}`)
    } else {
      setJobs(data || [])
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

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Jobs</h1>
          <Link href="/" className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
            Home
          </Link>
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
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Remote</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Posted</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {jobs.map((job) => {
                    const company = (job as any).companies
                    return (
                      <tr
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        className={`cursor-pointer hover:bg-gray-50 ${selectedJob?.id === job.id ? 'bg-blue-50' : ''}`}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{company?.name || 'Unknown'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{job.title}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{job.location_raw || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {job.remote_flag === true ? '✓' : job.remote_flag === false ? '✗' : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{job.status}</td>
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

