'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Company } from '@/lib/database.types'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'

function CompaniesPageContent() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState<string | null>(null)
  const [fetchingAll, setFetchingAll] = useState(false)

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

  async function fetchAllJobs() {
    if (!confirm(`Fetch jobs for all ${companies.length} companies? This may take a while.`)) {
      return
    }
    
    setFetchingAll(true)
    try {
      const response = await fetch('/api/jobs/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}), // No companyId = fetch all
      })
      const result = await response.json()
      if (result.success) {
        alert(`Started fetching jobs for all companies. This will run in the background.`)
        // Refresh companies after a delay to see updated last_checked_at
        setTimeout(() => loadCompanies(), 2000)
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setFetchingAll(false)
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
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Companies</h1>
          <div className="flex gap-4">
            <button
              onClick={fetchAllJobs}
              disabled={fetchingAll || companies.length === 0}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {fetchingAll ? 'Fetching All...' : 'Fetch All Jobs'}
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

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Platform</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Careers URL</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Checked</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {companies.map((company) => (
                <tr key={company.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{company.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{company.platform_key}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {company.careers_url ? (
                      <a href={company.careers_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {company.careers_url.length > 50 ? company.careers_url.substring(0, 50) + '...' : company.careers_url}
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {company.last_checked_at ? new Date(company.last_checked_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => fetchJobs(company.id)}
                      disabled={fetching === company.id}
                      className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {fetching === company.id ? 'Fetching...' : 'Fetch Jobs'}
                    </button>
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

