import { JobFetcherAdapter } from './base'
import { GreenhouseAdapter } from './greenhouse'
import { LeverAdapter } from './lever'
import { AshbyAdapter } from './ashby'
import { GenericHtmlAdapter } from './generic-html'
import { Company } from '../database.types'

export function getAdapter(platform: string): JobFetcherAdapter {
  switch (platform) {
    case 'greenhouse':
      return new GreenhouseAdapter()
    case 'lever':
      return new LeverAdapter()
    case 'ashby':
      return new AshbyAdapter()
    case 'generic_html':
      return new GenericHtmlAdapter()
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}

export { GreenhouseAdapter, LeverAdapter, AshbyAdapter, GenericHtmlAdapter }

