'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'
import { Job, Company } from '@/lib/database.types'
import { ModelToggle, useModelPreference } from '@/components/ModelToggle'

interface ScoredJob extends Job {
  company_name?: string
  match_quality?: 'excellent' | 'good' | 'fair' | 'poor'
}

function TopMatchesPageContent() {
  const [user, setUser] = useState<any>(null)
  const [jobs, setJobs] = useState<ScoredJob[]>([])
  const [loading, setLoading] = useState(true)
  const [scoring, setScoring] = useState(false)
  const [selectedJob, setSelectedJob] = useState<ScoredJob | null>(null)
  const [minScore, setMinScore] = useState(80) // Default: show 80%+ matches
  const [error, setError] = useState<string | null>(null)
  const { modelQuality, setModelQuality } = useModelPreference()

  useEffect(() => {
    checkUser()
    loadJobs()
  }, [])

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user ?? null)
  }

  async function loadJobs() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setLoading(false)
        return
      }

      // Check if user has a resume
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('resume_file_url')
        .eq('user_id', session.user.id)
        .single()

      if (!profile || !profile.resume_file_url) {
        setError('Please upload a resume first to see top matches.')
        setLoading(false)
        return
      }

      // Fetch all open jobs (with or without scores)
      const { data: jobsData, error: jobsError } = await supabase
        .from('jobs')
        .select(`
          *,
          companies!inner(name)
        `)
        .eq('closed_flag', false)
        .order('score_you', { ascending: false, nullsLast: true })
        .order('detected_at', { ascending: false })
        .limit(1000)

      if (jobsError) {
        console.error('Error loading jobs:', jobsError)
        setError(`Failed to load jobs: ${jobsError.message}`)
        setLoading(false)
        return
      }

      // Transform data
      const transformedJobs: ScoredJob[] = (jobsData || []).map((job: any) => ({
        ...job,
        company_name: job.companies?.name,
        match_quality: getMatchQuality(job.score_you),
      }))

      setJobs(transformedJobs)
    } catch (error) {
      console.error('Failed to load jobs:', error)
      setError('Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }

  function getMatchQuality(score: number | null): 'excellent' | 'good' | 'fair' | 'poor' {
    if (!score) return 'poor'
    if (score >= 80) return 'excellent'
    if (score >= 60) return 'good'
    if (score >= 40) return 'fair'
    return 'poor'
  }

  function getMatchQualityColor(quality: string) {
    switch (quality) {
      case 'excellent': return 'bg-green-100 text-green-800 border-green-300'
      case 'good': return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'fair': return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      default: return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

function parseListField(value?: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

  async function scoreAllJobs() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setError('You must be logged in')
      return
    }

    // Get job count first
    const { count } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('closed_flag', false)

    const jobCount = count || 0
    const estimatedCost = ((jobCount * 0.002) / 1000).toFixed(2) // Rough estimate: $0.002 per job

    if (!confirm(`Score ${jobCount} jobs? This may take ${Math.ceil(jobCount / 3 * 2 / 60)} minutes and cost approximately $${estimatedCost} in API credits. Continue?`)) {
      return
    }

    setScoring(true)
    setError(null)

    try {
      const response = await fetch('/api/jobs/score-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.user.id, limit: jobCount, modelQuality }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Scoring failed')
      }

      alert(`Scored ${result.scored} job(s).${result.failed ? ` ${result.failed} failed.` : ''}`)
      await loadJobs() // Reload to show new scores
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMsg)
      console.error('Score all error:', error)
    } finally {
      setScoring(false)
    }
  }

  // Filter jobs by minimum score, or show unscored jobs if minScore is 0
  const filteredJobs = jobs.filter(job => {
    if (job.score_you === null || job.score_you === undefined) {
      return minScore === 0 // Show unscored jobs only if filter is 0
    }
    return job.score_you >= minScore
  })

  if (loading) {
    return (
      <main className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <p>Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Top Matches</h1>
          <div className="flex gap-4">
            <Link href="/" className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
              Home
            </Link>
            <Link href="/resume" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Resume
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold mb-2">Job Matching</h2>
              <p className="text-sm text-gray-600 mb-1">
                Jobs are scored 0-100 based on how well they match your resume.
              </p>
              <p className="text-xs text-gray-500">
                <span className="font-semibold">80%+</span> = Excellent match (good to perfect fit) • 
                <span className="font-semibold"> 60-79%</span> = Good match • 
                <span className="font-semibold"> 40-59%</span> = Fair match • 
                <span className="font-semibold"> 0-39%</span> = Poor match
              </p>
              <p className="text-xs text-yellow-600 mt-1">
                ⚠️ Scoring uses OpenAI API credits. Start with a small batch to test.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ModelToggle value={modelQuality} onChange={setModelQuality} />
              <button
                onClick={scoreAllJobs}
                disabled={scoring}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
              >
                {scoring ? 'Scoring Jobs...' : 'Score All Jobs'}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">
              Minimum Score:
              <input
                type="number"
                min="0"
                max="100"
                value={minScore}
                onChange={(e) => setMinScore(parseInt(e.target.value) || 0)}
                className="ml-2 px-2 py-1 border rounded w-20"
              />
            </label>
            <span className="text-sm text-gray-600">
              Showing {filteredJobs.length} of {jobs.length} scored jobs
            </span>
          </div>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
            <p className="text-yellow-800">
              {jobs.length === 0 
                ? 'No jobs have been scored yet. Click "Score All Jobs" to start.'
                : `No jobs match the minimum score of ${minScore}%. Try lowering the filter or scoring more jobs.`
              }
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Jobs List */}
            <div className="lg:col-span-2">
              <div className="space-y-4">
                {filteredJobs.map((job) => (
                  <div
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className={`bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-lg transition ${
                      selectedJob?.id === job.id ? 'ring-2 ring-blue-500' : ''
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{job.title}</h3>
                        <p className="text-sm text-gray-600">{job.company_name}</p>
                      </div>
                      <div className="text-right">
                        {job.score_you !== null && job.score_you !== undefined ? (
                          <div className={`inline-block px-3 py-1 rounded-full border text-sm font-semibold ${getMatchQualityColor(job.match_quality || 'poor')}`}>
                            {job.score_you}%
                          </div>
                        ) : (
                          <div className="inline-block px-3 py-1 rounded-full border border-gray-300 bg-gray-50 text-gray-600 text-sm">
                            Not scored
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 mt-2">
                      {job.location_raw && <span>{job.location_raw}</span>}
                      {job.remote_flag && <span className="ml-2">🌍 Remote</span>}
                      {job.team && <span className="ml-2">• {job.team}</span>}
                    </div>
                    {job.description_snippet && (
                      <p className="text-sm text-gray-700 mt-2 line-clamp-2">
                        {job.description_snippet}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Job Details Panel */}
            <div className="lg:col-span-1">
              {selectedJob ? (
                <div className="bg-white rounded-lg shadow p-6 sticky top-4">
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-xl font-semibold">Job Details</h2>
                    <button
                      onClick={() => setSelectedJob(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mb-4">
                    <h3 className="font-semibold text-lg">{selectedJob.title}</h3>
                    <p className="text-gray-600">{selectedJob.company_name}</p>
                    {selectedJob.score_you !== null && selectedJob.score_you !== undefined ? (
                      <div className={`inline-block mt-2 px-3 py-1 rounded-full border ${getMatchQualityColor(selectedJob.match_quality || 'poor')}`}>
                        Match Score: {selectedJob.score_you}%
                      </div>
                    ) : (
                      <div className="inline-block mt-2 px-3 py-1 rounded-full border border-gray-300 bg-gray-50 text-gray-600">
                        Not scored yet
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 text-sm">
                    {selectedJob.location_raw && (
                      <div>
                        <span className="font-medium">Location:</span> {selectedJob.location_raw}
                        {selectedJob.remote_flag && <span className="ml-2">🌍 Remote</span>}
                      </div>
                    )}
                    {selectedJob.team && (
                      <div>
                        <span className="font-medium">Team:</span> {selectedJob.team}
                      </div>
                    )}
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
                  </div>

                  {selectedJob.full_description && (
                    <div className="mt-4 pt-4 border-t">
                      <h4 className="font-medium mb-2">Description</h4>
                      <div className="text-sm text-gray-700 max-h-96 overflow-y-auto">
                        <pre className="whitespace-pre-wrap font-sans">{selectedJob.full_description}</pre>
                      </div>
                    </div>
                  )}
                  {selectedJob.score_reasoning && (
                    <div className="mt-4 pt-4 border-t">
                      <h4 className="font-medium mb-2">AI Reasoning</h4>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedJob.score_reasoning}</p>
                    </div>
                  )}
                  {parseListField(selectedJob.score_strengths).length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Strengths</h4>
                      <ul className="list-disc list-inside text-sm text-gray-700">
                        {parseListField(selectedJob.score_strengths).map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {parseListField(selectedJob.score_gaps).length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Gaps</h4>
                      <ul className="list-disc list-inside text-sm text-gray-700">
                        {parseListField(selectedJob.score_gaps).map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {parseListField(selectedJob.score_hard_blockers).length > 0 && (
                    <div className="mt-4">
                      <h4 className="font-medium mb-2 text-red-700">Hard Blockers</h4>
                      <ul className="list-disc list-inside text-sm text-red-700">
                        {parseListField(selectedJob.score_hard_blockers).map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-6 text-center text-gray-500">
                  Select a job to view details
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

export default function TopMatchesPage() {
  return (
    <AuthGuard>
      <TopMatchesPageContent />
    </AuthGuard>
  )
}

