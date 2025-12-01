'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'
import { ModelToggle, useModelPreference } from '@/components/ModelToggle'

function ResumePageContent() {
  const [user, setUser] = useState<any>(null)
  const [resumeFileName, setResumeFileName] = useState<string | null>(null)
  const [resumeSummary, setResumeSummary] = useState<string | null>(null)
  const [uploadedAt, setUploadedAt] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [jobPreferences, setJobPreferences] = useState<string>('')
  const [locationPreferences, setLocationPreferences] = useState<string>('')
  const [seniorityPreference, setSeniorityPreference] = useState<string>('')
  const [experienceYearsOverride, setExperienceYearsOverride] = useState<string>('')
  const [savingPreferences, setSavingPreferences] = useState(false)
  const { modelQuality, setModelQuality } = useModelPreference('premium')

  useEffect(() => {
    checkUser()
    loadResume()
  }, [])

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user ?? null)
  }

  async function loadResume() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const { data, error } = await supabase
        .from('user_profiles')
        .select('resume_file_url, resume_summary, resume_uploaded_at, job_preferences, location_preferences, seniority_preference, experience_years_override')
        .eq('user_id', session.user.id)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading resume:', error)
        return
      }

      if (data) {
        // Show that a file is uploaded if we have a file URL
        if (data.resume_file_url) {
          setResumeFileName('Resume uploaded')
        } else {
          setResumeFileName(null)
        }
        setResumeSummary(data.resume_summary)
        setUploadedAt(data.resume_uploaded_at)
        setJobPreferences(data.job_preferences || '')
        setLocationPreferences(data.location_preferences || '')
        setSeniorityPreference(data.seniority_preference || '')
        setExperienceYearsOverride(
          data.experience_years_override !== null && data.experience_years_override !== undefined
            ? String(data.experience_years_override)
            : ''
        )
      } else {
        // No resume uploaded yet
        setResumeFileName(null)
        setResumeSummary(null)
        setUploadedAt(null)
        setJobPreferences('')
        setLocationPreferences('')
        setSeniorityPreference('')
      }
    } catch (error) {
      console.error('Failed to load resume:', error)
    }
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setError('You must be logged in to upload a resume')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('userId', session.user.id)

      const response = await fetch('/api/resume/upload', {
        method: 'POST',
        body: formData,
      })

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(`Server error: ${response.status}. ${text.substring(0, 200)}`)
      }

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      // Reload resume data
      await checkUser() // Make sure user is loaded
      await loadResume()
      alert('Resume uploaded successfully!')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMsg)
      console.error('Upload error:', error)
    } finally {
      setUploading(false)
    }
  }

  async function handleAnalyze() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setError('You must be logged in')
      return
    }

    if (!resumeFileName) {
      setError('Please upload a resume first')
      return
    }

    setAnalyzing(true)
    setError(null)

    try {
      const response = await fetch('/api/resume/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.user.id, modelQuality }),
      })

      // Check if response is JSON before parsing
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(`Server error: ${response.status}. ${text.substring(0, 200)}`)
      }

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Analysis failed')
      }

      setResumeSummary(result.summary)
      if (typeof result.jobPreferences === 'string') {
        setJobPreferences(result.jobPreferences)
      }
      if (typeof result.locationPreferences === 'string') {
        setLocationPreferences(result.locationPreferences)
      }
      if (typeof result.seniorityPreference === 'string') {
        setSeniorityPreference(result.seniorityPreference)
      }
      if (!experienceYearsOverride && result?.candidateProfile?.total_years_experience) {
        setExperienceYearsOverride(String(result.candidateProfile.total_years_experience))
      }
      alert('Resume analyzed successfully!')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMsg)
      console.error('Analysis error:', error)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleSavePreferences = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setError('You must be logged in')
      return
    }

    setSavingPreferences(true)
    setError(null)

    try {
          const { error: updateError } = await supabase
            .from('user_profiles')
            .update({
              job_preferences: jobPreferences || null,
              location_preferences: locationPreferences || null,
              seniority_preference: seniorityPreference || null,
              experience_years_override: experienceYearsOverride ? Number(experienceYearsOverride) : null,
            })
        .eq('user_id', session.user.id)

      if (updateError) {
        throw new Error(updateError.message)
      }

      alert('Preferences saved!')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save preferences'
      setError(message)
      console.error('Preference save error:', err)
    } finally {
      setSavingPreferences(false)
    }
  }

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Resume</h1>
          <Link href="/" className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
            Home
          </Link>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">
            {resumeFileName ? 'Update Resume' : 'Upload Resume'}
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            {resumeFileName 
              ? 'Upload a new resume to replace the current one. Maximum file size: 10MB'
              : 'Upload your resume (PDF, DOCX, or TXT). Maximum file size: 10MB'
            }
          </p>
          <div className="mb-4">
            <label className="block">
              <span className="sr-only">Choose file</span>
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={handleFileUpload}
                disabled={uploading}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>
          </div>
          {uploading && <p className="text-sm text-gray-600">Uploading and processing...</p>}
          {uploadedAt && (
            <p className="text-sm text-gray-600">
              Last uploaded: {new Date(uploadedAt).toLocaleString()}
            </p>
          )}
        </div>

        {resumeFileName && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold">Resume File</h2>
                <p className="text-sm text-gray-600 mt-1">{resumeFileName}</p>
              </div>
              <div className="flex items-center gap-3">
                <ModelToggle value={modelQuality} onChange={setModelQuality} />
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {analyzing ? 'Analyzing...' : 'Analyze with AI'}
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Your resume is stored and ready for AI analysis. Click "Analyze with AI" to generate a summary.
            </p>
          </div>
        )}

        {resumeSummary && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">AI-Generated Summary</h2>
            <div className="bg-gray-50 p-4 rounded">
              <pre className="whitespace-pre-wrap text-sm">{resumeSummary}</pre>
            </div>
            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <ModelToggle value={modelQuality} onChange={setModelQuality} />
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                {analyzing ? 'Re-analyzing...' : 'Re-analyze Resume'}
              </button>
            </div>
          </div>
        )}

        {(resumeSummary || resumeFileName) && (
          <div className="bg-white rounded-lg shadow p-6 mt-6">
            <h2 className="text-xl font-semibold mb-4">Editable Preferences</h2>
            <p className="text-sm text-gray-600 mb-4">
              Update these fields if you want to override what the AI extracted from the resume. These values
              will be used when ranking jobs and can be refined from the summary above.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Years of Experience (override)</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={experienceYearsOverride}
                  onChange={(e) => setExperienceYearsOverride(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring focus:border-blue-300"
                  placeholder="e.g., 4"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave blank to use the AI-estimated total from your resume.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Job Preferences</label>
                <textarea
                  value={jobPreferences}
                  onChange={(e) => setJobPreferences(e.target.value)}
                  rows={4}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring focus:border-blue-300"
                  placeholder="e.g., Product management roles in e-commerce, marketing analytics, rapid-growth startups..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Location Preferences</label>
                <textarea
                  value={locationPreferences}
                  onChange={(e) => setLocationPreferences(e.target.value)}
                  rows={2}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring focus:border-blue-300"
                  placeholder="e.g., Remote first, open to SF Bay Area or NYC"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Seniority Level</label>
                <input
                  type="text"
                  value={seniorityPreference}
                  onChange={(e) => setSeniorityPreference(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring focus:border-blue-300"
                  placeholder="e.g., Mid-level Product Manager"
                />
              </div>
              <button
                onClick={handleSavePreferences}
                disabled={savingPreferences}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
              >
                {savingPreferences ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </div>
        )}

        {!resumeFileName && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
            <p className="text-yellow-800">
              Upload a resume to get started. After uploading, you can analyze it with AI to generate a summary.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

export default function ResumePage() {
  return (
    <AuthGuard>
      <ResumePageContent />
    </AuthGuard>
  )
}

