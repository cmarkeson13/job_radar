import { NextResponse } from 'next/server'

export async function GET() {
  // Test if OpenAI API key is accessible
  const hasKey = !!process.env.OPENAI_API_KEY
  const keyLength = process.env.OPENAI_API_KEY?.length || 0
  const keyPrefix = process.env.OPENAI_API_KEY?.substring(0, 7) || 'none'
  
  // Check all env vars
  const envVars = {
    OPENAI_API_KEY: hasKey ? `Present (${keyLength} chars, starts with: ${keyPrefix})` : 'NOT FOUND',
    NEXT_PUBLIC_OPENAI_MODEL: process.env.NEXT_PUBLIC_OPENAI_MODEL || 'NOT SET',
    NEXT_PUBLIC_LLM_DEFAULT_TEMPERATURE: process.env.NEXT_PUBLIC_LLM_DEFAULT_TEMPERATURE || 'NOT SET',
  }

  return NextResponse.json({
    message: 'OpenAI Environment Variables Test',
    envVars,
    allEnvKeys: Object.keys(process.env).filter(key => key.includes('OPENAI') || key.includes('LLM')),
  })
}

