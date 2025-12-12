#!/usr/bin/env node
/**
 * Benchmark scoring analysis script.
 *
 * Pulls all jobs with job_uids like "bench_%", compares the actual AI score
 * with the intended score band, and logs deltas + summary statistics.
 *
 * Usage:
 *   1. Ensure .env.local (or environment) exposes:
 *        NEXT_PUBLIC_SUPABASE_URL
 *        SUPABASE_SERVICE_ROLE_KEY  (or SUPABASE_SERVICE_KEY)
 *   2. Run: node scripts/analyze-benchmarks.js
 */

const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// Load env values from .env.local if present.
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local') })

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing Supabase credentials. Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const TARGET_MIDPOINTS = {
  100: 95,
  90: 85,
  80: 75,
  70: 65,
  60: 55,
  50: 45,
  40: 35,
  30: 25,
  20: 15,
  10: 5,
}

const BAND_LABELS = {
  100: '90-100',
  90: '80-89',
  80: '70-79',
  70: '60-69',
  60: '50-59',
  50: '40-49',
  40: '30-39',
  30: '20-29',
  20: '10-19',
  10: '0-9',
}

function extractBand(jobUid) {
  const match = jobUid.match(/bench_(\d+)/i)
  if (!match) return null
  const value = parseInt(match[1], 10)
  return TARGET_MIDPOINTS[value] ? value : null
}

async function main() {
  const { data, error } = await supabase
    .from('jobs')
    .select(
      'job_uid,title,score_you,score_reasoning,score_strengths,score_gaps,score_hard_blockers,posted_at',
    )
    .ilike('job_uid', 'bench_%')
    .order('job_uid', { ascending: false })

  if (error) {
    console.error('Failed to fetch benchmark jobs:', error)
    process.exit(1)
  }

  if (!data || data.length === 0) {
    console.log('No benchmark jobs found. Have you run scripts/seed_benchmark_jobs.sql?')
    process.exit(0)
  }

  const rows = data.map((job) => {
    const band = extractBand(job.job_uid)
    const targetScore = band ? TARGET_MIDPOINTS[band] : null
    const delta =
      typeof job.score_you === 'number' && typeof targetScore === 'number'
        ? job.score_you - targetScore
        : null
    return {
      job_uid: job.job_uid,
      title: job.title,
      bandLabel: band ? BAND_LABELS[band] : 'unknown',
      expected: targetScore,
      actual: typeof job.score_you === 'number' ? job.score_you : null,
      delta,
      reasoning: job.score_reasoning || '',
      strengths: job.score_strengths || [],
      gaps: job.score_gaps || [],
      hard_blockers: job.score_hard_blockers || [],
    }
  })

  const scoredRows = rows.filter((row) => typeof row.actual === 'number')
  if (scoredRows.length === 0) {
    console.log('No benchmark jobs have been scored yet.')
    process.exit(0)
  }

  console.log('\nBenchmark scoring overview')
  console.table(
    scoredRows.map((row) => ({
      job_uid: row.job_uid,
      band: row.bandLabel,
      expected: row.expected,
      actual: row.actual,
      delta: row.delta,
    })),
  )

  const summary = scoredRows.reduce(
    (acc, row) => {
      if (typeof row.delta === 'number') {
        acc.totalDelta += row.delta
        acc.totalAbsDelta += Math.abs(row.delta)
        acc.count += 1
        acc.bandStats[row.bandLabel] = acc.bandStats[row.bandLabel] || {
          deltas: [],
        }
        acc.bandStats[row.bandLabel].deltas.push(row.delta)
      }
      return acc
    },
    { totalDelta: 0, totalAbsDelta: 0, count: 0, bandStats: {} },
  )

  console.log('\nSummary stats')
  console.table([
    {
      metric: 'Mean delta',
      value: (summary.totalDelta / summary.count).toFixed(2),
    },
    {
      metric: 'Mean absolute delta',
      value: (summary.totalAbsDelta / summary.count).toFixed(2),
    },
  ])

  console.log('\nBand deltas')
  Object.entries(summary.bandStats).forEach(([band, stats]) => {
    const mean =
      stats.deltas.reduce((sum, value) => sum + value, 0) / stats.deltas.length
    const meanAbs =
      stats.deltas.reduce((sum, value) => sum + Math.abs(value), 0) /
      stats.deltas.length
    console.log(
      `${band}: mean delta ${mean.toFixed(2)}, mean abs delta ${meanAbs.toFixed(
        2,
      )}`,
    )
  })

  console.log('\nDone.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

