export type ModelQuality = 'economy' | 'premium'

const ECONOMY_DEFAULT =
  process.env.OPENAI_MODEL_ECONOMY ||
  process.env.NEXT_PUBLIC_OPENAI_MODEL ||
  'gpt-3.5-turbo'

const PREMIUM_DEFAULT =
  process.env.OPENAI_MODEL_PREMIUM ||
  process.env.OPENAI_RESUME_MODEL ||
  process.env.NEXT_PUBLIC_OPENAI_MODEL ||
  'gpt-4o-mini'

type OverrideMap = {
  economy?: string
  premium?: string
  default?: string
}

export function resolveModel(
  quality?: ModelQuality,
  overrides?: OverrideMap
): string {
  if (quality === 'economy') {
    return overrides?.economy || ECONOMY_DEFAULT
  }
  if (quality === 'premium') {
    return overrides?.premium || PREMIUM_DEFAULT
  }
  return (
    overrides?.default ||
    overrides?.premium ||
    overrides?.economy ||
    PREMIUM_DEFAULT
  )
}


