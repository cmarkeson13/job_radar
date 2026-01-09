import OpenAI from 'openai'
import { createServerClient } from './supabase'
import { analyzeJobProfile } from './job-analyzer'
import {
  CandidateProfile,
  JobProfile,
  MATCHING_EXPLANATION_PROMPT,
  MATCHING_SYSTEM_PROMPT,
} from './profile-schema'
import { ModelQuality, resolveModel } from './model-selection'

const MATCH_MODEL_DEFAULT =
  process.env.OPENAI_MATCH_MODEL ||
  process.env.NEXT_PUBLIC_OPENAI_MODEL ||
  'gpt-4o-mini'

let cachedClient: OpenAI | null = null

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured')
  }
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return cachedClient
}

const SKILL_SYNONYMS = [
  {
    canonical: 'experimentation',
    keywords: [
      'a/b',
      'ab testing',
      'split test',
      'experiment',
      'experimentation',
      'test-and-learn',
      'test & learn',
      'growth experiment',
      'experimentation roadmap',
    ],
  },
  {
    canonical: 'lifecycle_marketing',
    keywords: [
      'lifecycle marketing',
      'crm marketing',
      'retention marketing',
      'engagement marketing',
      'email + push',
      'email + sms',
      'omnichannel lifecycle',
    ],
  },
  {
    canonical: 'lifecycle_management',
    keywords: [
      'lifecycle program',
      'customer journey',
      'journey management',
      'nurture program',
      'journey orchestration',
      'customer lifecycle',
      'email lifecycle',
    ],
  },
  {
    canonical: 'campaign_management',
    keywords: [
      'campaign management',
      'campaign ops',
      'campaign execution',
      'crm campaign',
      'omnichannel campaign',
      'messaging calendar',
      'email campaign',
      'push campaign',
      'journey orchestration',
      'marketing orchestration',
      'campaign orchestration',
    ],
  },
  {
    canonical: 'marketing_operations',
    keywords: [
      'marketing operations',
      'marketing ops',
      'mopex',
      'mops',
      'martech',
      'marketing technology',
      'marketo admin',
      'braze admin',
    ],
  },
  {
    canonical: 'stakeholder_management',
    keywords: [
      'stakeholder',
      'cross-functional partner',
      'exec alignment',
      'influence leadership',
      'executive communication',
      'c-suite updates',
      'partner alignment',
      'stakeholder mgmt',
      'stakeholder management',
      'manage stakeholders',
      'stakeholder comms',
    ],
  },
  {
    canonical: 'growth_strategy',
    keywords: [
      'growth strategy',
      'growth roadmap',
      'gtm',
      'go-to-market',
      'market expansion',
      'retention strategy',
      'acquisition strategy',
      'growth plan',
      'growth experimentation',
      'growth experimentation roadmap',
      'growth program',
    ],
  },
  {
    canonical: 'roadmap_planning',
    keywords: [
      'roadmap',
      'prioritize initiatives',
      'planning cycle',
      'product roadmap',
      'roadmap planning',
      'roadmap prioritization',
      'backlog prioritization',
      'quarterly planning',
    ],
  },
  {
    canonical: 'roadmap_ownership',
    keywords: [
      'own the roadmap',
      'roadmap owner',
      'roadmap accountability',
      'drive the roadmap',
      'roadmap lead',
      'roadmap charter',
      'roadmap stewardship',
      'roadmap ownership',
      'owns the roadmap',
      'roadmap driver',
    ],
  },
  {
    canonical: 'cross_functional_leadership',
    keywords: [
      'cross functional',
      'xfn leadership',
      'partner with sales',
      'partner with eng',
      'partner with marketing',
      'cross-functional leadership',
      'cross functional squad',
    ],
  },
  {
    canonical: 'cross_functional_alignment',
    keywords: [
      'align cross-functional',
      'xfn alignment',
      'partner alignment',
      'working across teams',
      'go-to-market alignment',
      'alignment ritual',
      'cross functional alignment',
      'keep stakeholders aligned',
    ],
  },
  {
    canonical: 'conversion_optimization',
    keywords: ['conversion', 'funnel', 'activation', 'growth loop', 'funnel lift', 'winback'],
  },
  {
    canonical: 'product_analytics',
    keywords: [
      'product analytics',
      'product metrics',
      'self-serve analytics',
      'dashboard review',
      'metrics instrumentation',
      'retention metrics',
    ],
  },
  {
    canonical: 'data_insights',
    keywords: [
      'data insight',
      'sql analysis',
      'analytical insight',
      'deep dive',
      'analysis',
      'insights deep dive',
      'data exploration',
    ],
  },
  {
    canonical: 'analytics_storytelling',
    keywords: [
      'analytics storytelling',
      'storytelling with data',
      'narrative with data',
      'exec readout',
      'insights deck',
      'data story',
    ],
  },
  {
    canonical: 'storytelling',
    keywords: [
      'storytelling',
      'compelling narrative',
      'story-driven',
      'story arc',
      'executive story',
    ],
  },
  {
    canonical: 'customer_research',
    keywords: [
      'user research',
      'customer interview',
      'qual research',
      'voice of customer',
      'voc',
      'customer listening',
      'research synthesis',
    ],
  },
  {
    canonical: 'positioning',
    keywords: [
      'positioning',
      'messaging',
      'value prop',
      'narrative',
      'product narrative',
      'market messaging',
    ],
  },
  {
    canonical: 'sales_enablement',
    keywords: [
      'sales enablement',
      'seller toolkit',
      'playbook',
      'field enablement',
      'sales training',
      'enablement collateral',
    ],
  },
  {
    canonical: 'automation',
    keywords: [
      'automation',
      'automated workflow',
      'marketing automation',
      'workflow automation',
      'journey automation',
      'triggered journey',
      'automation rules',
    ],
  },
  {
    canonical: 'regulatory_translation',
    keywords: [
      'regulatory',
      'compliance translation',
      'policy to product',
      'regulatory partner',
      'translate regulation',
      'regulatory requirement',
      'compliance requirements',
    ],
  },
  {
    canonical: 'supply_chain_coordination',
    keywords: [
      'supply chain',
      'logistics coordination',
      'inventory planning',
      'factory partner',
      'supply planning',
      'ops coordination',
      'vendor coordination',
    ],
  },
  {
    canonical: 'requirements_gathering',
    keywords: [
      'requirements gathering',
      'capture requirements',
      'collect requirements',
      'requirements intake',
      'document requirements',
      'requirements workshop',
    ],
  },
  {
    canonical: 'analytics_coordination',
    keywords: [
      'analytics coordination',
      'partner with analytics',
      'analytics liaison',
      'analytics squad',
      'data partner',
      'analyst partnership',
    ],
  },
  {
    canonical: 'communication',
    keywords: [
      'executive communication',
      'exec update',
      'stakeholder communication',
      'status update',
      'communications plan',
      'narrative update',
    ],
  },
  {
    canonical: 'project_management',
    keywords: [
      'program management',
      'project management',
      'delivery management',
      'timeline management',
      'project plan',
      'critical path',
    ],
  },
]

function normalizeSkillName(value?: string | null) {
  if (!value) return ''
  const normalized = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return normalized.replace(/\s+/g, '_')
}

function uniqueNormalizedSkills(values?: string[]) {
  return Array.from(
    new Set(
      (values || [])
        .map(value => normalizeSkillName(value))
        .filter(Boolean),
    ),
  )
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

type SkillCoverage = {
  must: { present: string[]; missing: string[] }
  nice: { present: string[]; missing: string[] }
  tools: { present: string[]; missing: string[] }
}

function computeSkillCoverage(candidate: CandidateProfile, job: JobProfile): SkillCoverage {
  const candidateSkillUniverse = uniqueNormalizedSkills([
    ...toArray(candidate.core_skills),
    ...toArray(candidate.tools_technologies),
    ...toArray(candidate.primary_functions),
  ])
  const candidateSkillSet = new Set(candidateSkillUniverse)

  const evaluate = (skills: string[]) => {
    const present: string[] = []
    const missing: string[] = []
    skills.forEach(skill => {
      const normalized = normalizeSkillName(skill)
      if (!normalized) return
      if (candidateSkillSet.has(normalized)) present.push(skill)
      else missing.push(skill)
    })
    return { present: uniqueStrings(present), missing: uniqueStrings(missing) }
  }

  return {
    must: evaluate(toArray(job.required_skills)),
    nice: evaluate(toArray(job.nice_to_have_skills)),
    tools: evaluate(toArray(job.tools_technologies)),
  }
}

function mergeCoverage(
  diagnostics: LlmDiagnostics,
  coverage: SkillCoverage,
): LlmDiagnostics {
  const mergePresent = (existing: string[], additions: string[]) =>
    uniqueStrings([...existing, ...additions])

  const mergeMissing = (existing: string[], additions: string[], present: string[]) => {
    const presentSet = new Set(present.map(normalizeSkillName))
    return uniqueStrings(
      [...additions, ...existing].filter(
        skill => skill && !presentSet.has(normalizeSkillName(skill)),
      ),
    )
  }

  const mustPresent = mergePresent(
    diagnostics.must_have_skills_present,
    coverage.must.present,
  )
  const nicePresent = mergePresent(
    diagnostics.nice_to_have_skills_present,
    coverage.nice.present,
  )
  const toolsPresent = mergePresent(diagnostics.tools_present, coverage.tools.present)

  return {
    ...diagnostics,
    must_have_skills_present: mustPresent,
    must_have_skills_missing: mergeMissing(
      diagnostics.must_have_skills_missing,
      coverage.must.missing,
      mustPresent,
    ),
    nice_to_have_skills_present: nicePresent,
    tools_present: toolsPresent,
    tools_missing: mergeMissing(
      diagnostics.tools_missing,
      coverage.tools.missing,
      toolsPresent,
    ),
  }
}

function parseArrayField(value: any): string[] {
  if (Array.isArray(value)) return value.map(item => String(item))
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : value ? [value] : []
    } catch {
      return value ? [value] : []
    }
  }
  return []
}

function toArray(value?: any): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean)
  if (typeof value === 'string') return value ? [value] : []
  return []
}

function formatList(values: string[], fallback = 'unspecified') {
  return values.length ? values.join(', ') : fallback
}

function section(title: string, lines: string[]) {
  if (!lines.length) {
    return `${title}:\n- Not specified`
  }
  return `${title}:\n${lines.map(line => `- ${line}`).join('\n')}`
}

type LlmDiagnostics = {
  must_have_skills_present: string[]
  must_have_skills_missing: string[]
  nice_to_have_skills_present: string[]
  tools_present: string[]
  tools_missing: string[]
  experience_years_delta: number
  seniority_alignment:
    | 'above_expectation'
    | 'within_one_level'
    | 'below_by_one_level'
    | 'below_by_two_or_more'
    | 'unspecified'
  domain_alignment: 'strong' | 'partial' | 'weak' | 'unspecified'
  location_fit: 'full_match' | 'partial' | 'mismatch' | 'unspecified'
  work_authorization_fit: 'full_match' | 'partial' | 'mismatch' | 'unspecified'
  preference_alignment: {
    role_types: 'strong' | 'partial' | 'weak' | 'unspecified'
    company_size: 'strong' | 'partial' | 'weak' | 'unspecified'
    keywords: 'strong' | 'partial' | 'weak' | 'unspecified'
  }
  blocking_issues: string[]
  overall_fit_label:
    | 'plug_and_play'
    | 'strong_fit'
    | 'stretch'
    | 'weak_fit'
    | 'hard_no'
  notes?: string
}

function augmentCandidateProfile(
  profile: CandidateProfile,
  resumeSummary?: string | null,
) {
  const originalCoreSkills = toArray(profile.core_skills)
  const normalizedCoreSkills = uniqueNormalizedSkills(originalCoreSkills)
  const normalizedTools = uniqueNormalizedSkills(toArray(profile.tools_technologies))
  const normalizedFunctions = uniqueNormalizedSkills(toArray(profile.primary_functions))
  const normalizedIndustries = uniqueNormalizedSkills(toArray(profile.industries))

  const clone: CandidateProfile = {
    ...profile,
    core_skills: normalizedCoreSkills,
    tools_technologies: normalizedTools,
    primary_functions: normalizedFunctions,
  }

  const appendSkills = (skills: string[]) => {
    if (!skills.length) return
    clone.core_skills = uniqueStrings([...(clone.core_skills || []), ...skills])
  }

  const normalizedPrimaryText = normalizedFunctions.join(' ')
  const normalizedIndustryText = normalizedIndustries.join(' ')
  const preferenceKeywords = toArray(profile.job_preferences?.keywords)
    .join(' ')
    .toLowerCase()
  const preferenceRoles = uniqueNormalizedSkills(
    toArray(profile.job_preferences?.role_types),
  ).join(' ')

  const hasSkill = (skill: string) =>
    clone.core_skills?.some(core => core === skill) ?? false

  if (
    normalizedPrimaryText.includes('product') ||
    preferenceRoles.includes('product')
  ) {
    appendSkills([
      'roadmap_planning',
      'roadmap_ownership',
      'stakeholder_management',
      'cross_functional_alignment',
    ])
  }

  if (
    normalizedPrimaryText.includes('marketing') ||
    normalizedIndustryText.includes('marketing')
  ) {
    appendSkills(['lifecycle_management', 'campaign_management'])
  }

  if (
    hasSkill('a/b_testing') ||
    hasSkill('conversion_optimization') ||
    preferenceKeywords.includes('conversion')
  ) {
    appendSkills(['experimentation', 'analytics_storytelling', 'data_insights'])
  }

  if (
    (preferenceKeywords.includes('growth') ||
      preferenceKeywords.includes('retention') ||
      normalizedIndustryText.includes('marketing')) &&
    hasSkill('experimentation')
  ) {
    appendSkills(['growth_strategy'])
  }

  const haystack = [
    profile.summary || '',
    resumeSummary || '',
    originalCoreSkills.join(' '),
    normalizedCoreSkills.map(skill => skill.replace(/_/g, ' ')).join(' '),
    normalizedTools.map(tool => tool.replace(/_/g, ' ')).join(' '),
    normalizedFunctions.map(func => func.replace(/_/g, ' ')).join(' '),
    normalizedIndustries.map(ind => ind.replace(/_/g, ' ')).join(' '),
    toArray(profile.job_preferences?.keywords).join(' '),
    toArray(profile.job_preferences?.role_types).join(' '),
    toArray(profile.job_preferences?.industries).join(' '),
  ]
    .join(' ')
    .toLowerCase()

  SKILL_SYNONYMS.forEach(({ canonical, keywords }) => {
    const alreadyPresent = clone.core_skills?.some(
      skill => skill === canonical,
    )
    if (alreadyPresent) return
    if (keywords.some(keyword => haystack.includes(keyword.toLowerCase()))) {
      clone.core_skills = Array.from(
        new Set([...(clone.core_skills || []), canonical]),
      )
    }
  })

  return clone
}

function buildDiagnosticsPrompt(candidate: CandidateProfile, job: JobProfile) {
  return [
    'Candidate JSON:',
    JSON.stringify(candidate, null, 2),
    '',
    'Job JSON:',
    JSON.stringify(job, null, 2),
  ].join('\n')
}

function buildExplanationPrompt({
  candidate,
  job,
  diagnostics,
  score,
  companyName,
}: {
  candidate: CandidateProfile
  job: JobProfile
  diagnostics: LlmDiagnostics
  score: number
  companyName?: string | null
}) {
  const candidateSummaryLines = [
    `Seniority: ${candidate.seniority_level}`,
    `Experience: ${candidate.total_years_experience || 'unspecified'} yrs`,
    `Core skills: ${formatList(toArray(candidate.core_skills))}`,
    `Industries: ${formatList(toArray(candidate.industries))}`,
  ]

  const jobSummaryLines = [
    `Title: ${job.job_title || 'Unknown'}${companyName ? ` at ${companyName}` : ''}`,
    `Role type: ${job.role_type || 'unspecified'}`,
    `Seniority: ${job.seniority_level}`,
    `Must-haves: ${formatList(toArray(job.required_skills))}`,
  ]

  return [
    'Explain the final score for this candidate/job pairing.',
    '',
    section('Candidate Summary', candidateSummaryLines),
    '',
    section('Job Summary', jobSummaryLines),
    '',
    'Diagnostics JSON:',
    JSON.stringify(diagnostics, null, 2),
    '',
    `Final numeric score (do not change it): ${score}`,
  ].join('\n')
}

function normalizeDiagnostics(raw: any): LlmDiagnostics {
  return {
    must_have_skills_present: toArray(raw?.must_have_skills_present),
    must_have_skills_missing: toArray(raw?.must_have_skills_missing),
    nice_to_have_skills_present: toArray(raw?.nice_to_have_skills_present),
    tools_present: toArray(raw?.tools_present),
    tools_missing: toArray(raw?.tools_missing),
    experience_years_delta: Number(raw?.experience_years_delta) || 0,
    seniority_alignment: raw?.seniority_alignment || 'unspecified',
    domain_alignment: raw?.domain_alignment || 'unspecified',
    location_fit: raw?.location_fit || 'unspecified',
    work_authorization_fit: raw?.work_authorization_fit || 'unspecified',
    preference_alignment: {
      role_types: raw?.preference_alignment?.role_types || 'unspecified',
      company_size: raw?.preference_alignment?.company_size || 'unspecified',
      keywords: raw?.preference_alignment?.keywords || 'unspecified',
    },
    blocking_issues: toArray(raw?.blocking_issues),
    overall_fit_label: raw?.overall_fit_label || 'weak_fit',
    notes: typeof raw?.notes === 'string' ? raw.notes : undefined,
  }
}

function scoreFromDiagnostics(diag: LlmDiagnostics) {
  let score = 80

  const totalMustHaves =
    diag.must_have_skills_present.length + diag.must_have_skills_missing.length
  const coverage =
    totalMustHaves === 0
      ? 0.85
      : diag.must_have_skills_present.length / Math.max(totalMustHaves, 1)
  const coverageDelta = coverage - 0.62
  const coverageWeight = coverage >= 0.5 ? 72 : 52
  score += coverageDelta * coverageWeight

  if (diag.nice_to_have_skills_present.length) {
    score += Math.min(diag.nice_to_have_skills_present.length * 2.5, 10)
  }

  if (diag.tools_present.length > diag.tools_missing.length) {
    score += diag.tools_missing.length === 0 ? 5 : 3
  } else if (diag.tools_missing.length > diag.tools_present.length) {
    score -= diag.tools_present.length === 0 ? 8 : 4
  }

  if (diag.experience_years_delta >= 3) {
    score += 9
  } else if (diag.experience_years_delta >= 1) {
    score += 6
  } else if (diag.experience_years_delta >= -1) {
    score += 2
  } else if (diag.experience_years_delta >= -3) {
    score -= 4
  } else {
    score -= 10
  }

  switch (diag.seniority_alignment) {
    case 'above_expectation':
      score += 5
      break
    case 'within_one_level':
      score += 3
      break
    case 'below_by_one_level':
      score -= 7
      break
    case 'below_by_two_or_more':
      score -= 12
      break
  }

  if (diag.domain_alignment === 'strong') score += 9
  else if (diag.domain_alignment === 'partial') score += 4
  else if (diag.domain_alignment === 'weak') score -= 6

  if (diag.location_fit === 'mismatch') score -= 2
  else if (diag.location_fit === 'partial') score -= 1

  if (diag.work_authorization_fit === 'mismatch') score -= 20
  else if (diag.work_authorization_fit === 'partial') score -= 8

  const prefWeights: Record<'strong' | 'partial' | 'weak' | 'unspecified', number> =
    { strong: 2, partial: 0, weak: -2, unspecified: 0 }
  ;(['role_types', 'company_size', 'keywords'] as const).forEach(key => {
    const value = diag.preference_alignment[key]
    score += prefWeights[value] || 0
  })

  // Targeted bonus for high coverage when the LLM already sees a good fit
  if (
    coverage >= 0.75 &&
    (diag.overall_fit_label === 'stretch' || diag.overall_fit_label === 'strong_fit')
  ) {
    score += 4
  }
  if (coverage >= 0.85 && diag.overall_fit_label === 'stretch') {
    score += 4
  }
  if (coverage >= 0.8 && diag.overall_fit_label === 'weak_fit') {
    score = Math.max(score, 70)
  }

  const hasWorkAuthBlocker = diag.blocking_issues?.some(issue => {
    const lower = issue.toLowerCase()
    return (
      lower.includes('work authorization') ||
      lower.includes('visa') ||
      lower.includes('citizenship')
    )
  })
  const hasHardLocationRequirement = diag.blocking_issues?.some(issue => {
    const lower = issue.toLowerCase()
    if (!lower.includes('location') && !lower.includes('on site') && !lower.includes('onsite')) {
      return false
    }
    return (
      lower.includes('requires onsite') ||
      lower.includes('requires on-site') ||
      lower.includes('must be onsite') ||
      lower.includes('must be on site') ||
      lower.includes('on-site presence') ||
      lower.includes('onsite presence') ||
      lower.includes('ts/sci') ||
      lower.includes('ts sci') ||
      lower.includes('ts-sci') ||
      lower.includes('tssci')
    )
  })
  const onlySoftLocationMismatch =
    diag.blocking_issues?.length &&
    diag.blocking_issues.every(issue => issue.toLowerCase().includes('location mismatch'))
  const zeroMustHaveCoverage =
    (diag.must_have_skills_present.length === 0 && diag.must_have_skills_missing.length > 0) ||
    (diag.must_have_skills_present.length === 0 && diag.must_have_skills_missing.length === 0)
  const severeUnderExperience =
    diag.experience_years_delta <= -3 || diag.seniority_alignment === 'below_by_two_or_more'
  const hasAnyMustHave = diag.must_have_skills_present.length > 0
  const hasCoverageButNonFit =
    hasAnyMustHave &&
    (diag.overall_fit_label === 'weak_fit' || diag.overall_fit_label === 'hard_no')
  const modestCoverageLevel =
    diag.must_have_skills_present.length >= 1 &&
    diag.must_have_skills_present.length >= diag.must_have_skills_missing.length // at least 50% of must-haves present
  const totalMust = diag.must_have_skills_present.length + diag.must_have_skills_missing.length
  const mustCoverageRatio =
    totalMust === 0 ? 0 : diag.must_have_skills_present.length / Math.max(totalMust, 1)
  const prefRoleWeak = diag.preference_alignment.role_types === 'weak'
  const prefKeywordsWeak = diag.preference_alignment.keywords === 'weak'
  const prefCompanyWeak = diag.preference_alignment.company_size === 'weak'

  switch (diag.overall_fit_label) {
    case 'plug_and_play':
      score = Math.max(score, 96)
      break
    case 'strong_fit':
      score = Math.max(score, 90)
      break
    case 'stretch':
      score = Math.max(score, 74)
      break
    case 'weak_fit':
      score = Math.max(score, 50)
      break
    case 'hard_no':
      score = Math.min(score, 25)
      break
  }

  if (!diag.blocking_issues?.length && diag.overall_fit_label === 'weak_fit') {
    score = Math.max(score, 50)
  }

  if (hasHardLocationRequirement) {
    score = Math.min(score, 55)
  }
  if (hasWorkAuthBlocker) {
    score = Math.min(score, 35)
  }

  // Soft location mismatch should not clamp the score if everything else is strong
  if (diag.blocking_issues?.length && !hasHardLocationRequirement && !hasWorkAuthBlocker && !onlySoftLocationMismatch) {
    score = Math.min(score, 55)
  }

  // Preference weakness caps
  if (prefKeywordsWeak && prefRoleWeak && prefCompanyWeak) {
    score = Math.min(score, 45)
  } else if (prefKeywordsWeak && prefRoleWeak) {
    score = Math.min(score, 55)
  }

  // Role/domain mismatch cap; harder clamp when there's essentially no coverage
  if (prefRoleWeak && diag.domain_alignment === 'weak') {
    if (mustCoverageRatio < 0.2) {
      score = Math.min(score, 20)
    } else {
      score = Math.min(score, 45)
    }
  }

  // Extra cap for zero-coverage hard_no to pull bottom band down, but only when also severely under-experienced
  if (diag.overall_fit_label === 'hard_no' && zeroMustHaveCoverage && severeUnderExperience) {
    score = Math.min(score, 8)
  }

  // Allow zero-coverage hard_no with only soft location issues and reasonable seniority to sit a bit higher
  if (
    diag.overall_fit_label === 'hard_no' &&
    zeroMustHaveCoverage &&
    onlySoftLocationMismatch &&
    !hasWorkAuthBlocker &&
    !severeUnderExperience
  ) {
    score = Math.max(score, 32)
    score = Math.min(score, 42)
  }

  // Modest boost for weak/hard_no cases that at least hit one must-have
  if (hasCoverageButNonFit) {
    score += modestCoverageLevel ? 6 : 4
    const coverageCap =
      mustCoverageRatio >= 0.75 ? 80 : mustCoverageRatio >= 0.5 ? 60 : modestCoverageLevel ? 40 : 35
    score = Math.min(score, coverageCap)
    if (mustCoverageRatio >= 0.6) {
      score += 3
    }
  }

  // High coverage rescue: if coverage is strong, avoid over-clamping
  if (mustCoverageRatio >= 0.85 && diag.overall_fit_label !== 'hard_no') {
    score = Math.max(score, 88)
    score = Math.min(score, 92)
  } else if (mustCoverageRatio >= 0.75 && diag.overall_fit_label !== 'hard_no') {
    score = Math.max(score, 85)
    // For strong_fit, keep a lower cap to avoid 80-band overshoot
    if (diag.overall_fit_label === 'strong_fit') {
      score = Math.min(score, 88)
    } else {
      score = Math.min(score, 90)
    }
    // Targeted lift for near-complete coverage stretch fits to recover 90–92 without affecting lower bands
    if (
      diag.overall_fit_label === 'stretch' &&
      mustCoverageRatio >= 0.8 &&
      diag.must_have_skills_missing.length <= 1 &&
      diag.tools_missing.length <= 2 &&
      diag.domain_alignment !== 'weak'
    ) {
      score = Math.max(score, 92)
      score = Math.min(score, 94)
    }
  } else if (mustCoverageRatio >= 0.6 && (diag.overall_fit_label === 'stretch' || diag.overall_fit_label === 'strong_fit')) {
    score = Math.max(score, 72)
  }

  // Moderate floor for partial coverage non-hard-no to lift mids slightly
  if (mustCoverageRatio >= 0.5 && diag.overall_fit_label !== 'hard_no') {
    score = Math.max(score, 52)
  }
  // Slight floor for lower coverage (not hard_no) to help 30–50 bands while easing the clamp
  if (mustCoverageRatio >= 0.4 && diag.overall_fit_label !== 'hard_no') {
    score = Math.max(score, 48)
  }
  // Lift very low mids slightly when some coverage exists
  if (diag.overall_fit_label !== 'hard_no') {
    if (mustCoverageRatio >= 0.2 && mustCoverageRatio < 0.4) {
      score = Math.max(score, 42)
    }
  }

  // Small bump for weak_fit with some coverage without letting it run away
  if (
    diag.overall_fit_label === 'weak_fit' &&
    mustCoverageRatio >= 0.4 &&
    mustCoverageRatio < 0.75
  ) {
    score += 2
    score = Math.min(score, 68)
  }

  // If weak_fit with zero must-have coverage but strong seniority/experience signals and some supporting skills/tools, give a modest lift
  if (
    diag.overall_fit_label === 'weak_fit' &&
    mustCoverageRatio === 0 &&
    (diag.seniority_alignment === 'above_expectation' || diag.experience_years_delta >= 1) &&
    (diag.nice_to_have_skills_present.length > 0 || diag.tools_present.length > 0)
  ) {
    score = Math.max(score, 58)
    score = Math.min(score, 70)
  }

  // Allow high-coverage weak/hard_no to climb a bit higher
  if (
    hasCoverageButNonFit &&
    mustCoverageRatio >= 0.75
  ) {
    score = Math.max(score, 70)
    score = Math.min(score, 92)
  }

  // Cap strong/stretch with blocking issues to avoid over-scoring
  if (
    diag.blocking_issues?.length &&
    (diag.overall_fit_label === 'strong_fit' || diag.overall_fit_label === 'stretch')
  ) {
    score = Math.min(score, 95)
  }

  // Overqualification clamp
  if (diag.seniority_alignment === 'above_expectation' && diag.experience_years_delta >= 3) {
    score -= 8
    score = Math.min(score, 72)
  }

  // Hard cap for near-zero coverage weak/hard_no to prevent bottom-band overshoot
  if (
    mustCoverageRatio < 0.2 &&
    (diag.overall_fit_label === 'weak_fit' || diag.overall_fit_label === 'hard_no')
  ) {
    score = Math.min(score, 25)
  }

  score = Math.max(score, 5)

  return Math.max(0, Math.min(100, Math.round(score)))
}

export async function scoreJobForUser(
  userId: string,
  jobId: string,
  options?: { modelQuality?: ModelQuality },
) {
  const supabase = createServerClient()

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select(
      'candidate_profile, resume_summary, job_preferences, location_preferences, seniority_preference, experience_years_override',
    )
    .eq('user_id', userId)
    .single()

  if (profileError || !profile?.candidate_profile) {
    return {
      success: false,
      error:
        'Resume not analyzed yet. Please run "Analyze with AI" on the Resume page.',
    }
  }

  let candidateProfile = { ...(profile.candidate_profile as CandidateProfile) }
  if (
    profile.experience_years_override !== null &&
    profile.experience_years_override !== undefined
  ) {
    candidateProfile.total_years_experience = Number(
      profile.experience_years_override,
    )
  }
  candidateProfile = augmentCandidateProfile(
    candidateProfile,
    profile.resume_summary,
  )

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select(
      'id, title, job_profile, full_description, description_snippet, location_raw, remote_flag, company_id',
    )
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return { success: false, error: 'Job not found' }
  }

  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', job.company_id)
    .single()

  let jobProfile = job.job_profile as JobProfile | null
  let longDescription = job.full_description || job.description_snippet || ''
  if (!longDescription.trim()) {
    longDescription = [
      `Job Title: ${job.title}`,
      company?.name ? `Company: ${company.name}` : null,
      job.location_raw ? `Location: ${job.location_raw}` : null,
      job.remote_flag === true
        ? 'This role is remote-friendly.'
        : job.remote_flag === false
          ? 'This role is on-site.'
          : null,
      'No job description was provided. Infer requirements conservatively from the metadata above.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (!jobProfile && longDescription) {
    jobProfile = await analyzeJobProfile({
      title: job.title,
      company: company?.name || 'Unknown Company',
      description: longDescription,
      location: job.location_raw || undefined,
      remoteFlag: job.remote_flag,
    })
    if (jobProfile) {
      await supabase.from('jobs').update({ job_profile: jobProfile }).eq('id', job.id)
    }
  }

  if (!jobProfile) {
    return { success: false, error: 'Job profile missing description to analyze.' }
  }

  const skillCoverage = computeSkillCoverage(candidateProfile, jobProfile)
  const diagnosticsPrompt = buildDiagnosticsPrompt(candidateProfile, jobProfile)

  try {
    const client = getClient()
    const model = resolveModel(options?.modelQuality, {
      premium: MATCH_MODEL_DEFAULT,
      default: MATCH_MODEL_DEFAULT,
    })
    console.info(
      `[job-matching] Using model ${model} (${options?.modelQuality || 'default'}) for job ${jobId}`,
    )

    const diagnosticsCompletion = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: MATCHING_SYSTEM_PROMPT },
        { role: 'user', content: diagnosticsPrompt },
      ],
    })

    const diagnosticsPayload = diagnosticsCompletion.choices[0]?.message?.content
    if (!diagnosticsPayload) {
      return {
        success: false,
        error: 'AI returned an empty diagnostic response',
      }
    }

    const diagnostics = mergeCoverage(
      normalizeDiagnostics(JSON.parse(diagnosticsPayload)),
      skillCoverage,
    )
    console.info(
      '[job-matching] diagnostics',
      jobId,
      JSON.stringify(diagnostics),
    )
    const score = scoreFromDiagnostics(diagnostics)

    const explanationPrompt = buildExplanationPrompt({
      candidate: candidateProfile,
      job: jobProfile,
      diagnostics,
      score,
      companyName: company?.name,
    })

    const explanationCompletion = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: MATCHING_EXPLANATION_PROMPT },
        { role: 'user', content: explanationPrompt },
      ],
    })

    const explanationPayload =
      explanationCompletion.choices[0]?.message?.content
    if (!explanationPayload) {
      return {
        success: false,
        error: 'AI returned an empty explanation response',
      }
    }

    const explanation = JSON.parse(explanationPayload)
    let hardBlockers = parseArrayField(explanation.hard_blockers)
    if (!hardBlockers.length && diagnostics.blocking_issues.length) {
      hardBlockers = diagnostics.blocking_issues
    }

    await supabase
      .from('jobs')
      .update({
        score_you: score,
        score_reasoning: explanation.reasoning || null,
        score_strengths: explanation.strengths
          ? JSON.stringify(explanation.strengths)
          : null,
        score_gaps: explanation.gaps ? JSON.stringify(explanation.gaps) : null,
        score_hard_blockers: hardBlockers.length
          ? JSON.stringify(hardBlockers)
          : null,
        score_diagnostics: diagnostics,
        score_last_updated: new Date().toISOString(),
      })
      .eq('id', jobId)

    return {
      success: true,
      score,
      reasoning: explanation.reasoning,
      strengths: parseArrayField(explanation.strengths),
      gaps: parseArrayField(explanation.gaps),
      hard_blockers: hardBlockers,
    }
  } catch (error) {
    console.error('[job-matching] scoring failed', error)
    const message = error instanceof Error ? error.message : 'Unknown AI error'
    return { success: false, error: `AI scoring failed: ${message}` }
  }
}
