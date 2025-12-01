'use client'

import { useEffect, useState } from 'react'
import type { ModelQuality } from '@/lib/model-selection'

const STORAGE_KEY = 'modelPreference'

export function useModelPreference(defaultValue: ModelQuality = 'economy') {
  const [modelQuality, setModelQualityState] = useState<ModelQuality>(defaultValue)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'economy' || stored === 'premium') {
      setModelQualityState(stored)
    }
  }, [])

  const setModelQuality = (value: ModelQuality) => {
    setModelQualityState(value)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, value)
    }
  }

  return { modelQuality, setModelQuality }
}

export function ModelToggle({
  value,
  onChange,
}: {
  value: ModelQuality
  onChange: (value: ModelQuality) => void
}) {
  const options: Array<{ label: string; value: ModelQuality; helper: string }> = [
    { label: 'Economy', value: 'economy', helper: 'Cheaper (GPT-3.5)' },
    { label: 'Premium', value: 'premium', helper: 'Higher quality (GPT-4o)' },
  ]

  return (
    <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1 text-sm">
      <span className="font-medium text-gray-700">LLM:</span>
      {options.map(option => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-3 py-1 rounded-full border text-xs transition ${
            value === option.value
              ? 'bg-purple-600 border-purple-600 text-white'
              : 'bg-white border-gray-300 text-gray-700 hover:border-purple-400'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}


