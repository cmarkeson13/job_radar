import { Job, Company } from '../database.types'

export interface NormalizedJob {
  job_uid: string
  title: string
  team: string | null
  location_raw: string | null
  remote_flag: boolean | null
  job_url: string | null
  posted_at: string | null
  description_snippet: string | null
  full_description: string | null
}

export interface JobFetcherAdapter {
  fetchJobs(company: Company): Promise<NormalizedJob[]>
}

export abstract class BaseAdapter implements JobFetcherAdapter {
  abstract fetchJobs(company: Company): Promise<NormalizedJob[]>

  protected normalizeText(text: string | null | undefined): string | null {
    if (!text) return null
    return text.trim().replace(/\s+/g, ' ')
  }

  protected extractRemoteFlag(location: string | null, title: string, description: string | null): boolean | null {
    if (!location && !description) return null
    
    const searchText = `${location || ''} ${title} ${description || ''}`.toLowerCase()
    const remoteIndicators = ['remote', 'work from home', 'wfh', 'distributed', 'anywhere']
    const onsiteIndicators = ['on-site', 'onsite', 'in-office', 'in office', 'hybrid']
    
    const hasRemote = remoteIndicators.some(indicator => searchText.includes(indicator))
    const hasOnsite = onsiteIndicators.some(indicator => searchText.includes(indicator))
    
    if (hasRemote && !hasOnsite) return true
    if (hasOnsite && !hasRemote) return false
    return null
  }
}

