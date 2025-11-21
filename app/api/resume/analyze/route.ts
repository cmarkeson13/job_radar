import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import OpenAI from 'openai'

function extractSection(summary: string, heading: string): string | null {
  const regex = new RegExp(`\\*\\*${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*:?\\s*([\\s\\S]*?)(?=\\n\\*\\*|$)`, 'i')
  const match = summary.match(regex)
  if (!match) return null
  return match[1].trim()
}

function parsePreferences(summary: string) {
  return {
    jobPreferences: extractSection(summary, 'Job Preferences'),
    locationPreferences: extractSection(summary, 'Location Preferences'),
    seniorityPreference: extractSection(summary, 'Seniority Level'),
  }
}

export async function POST(request: NextRequest) {
  console.log('[ANALYZE] ========================================')
  console.log('[ANALYZE] ===== RESUME ANALYZE API CALLED =====')
  console.log('[ANALYZE] ========================================')
  
  try {
    // Debug: Log all OpenAI-related env vars (without exposing the key)
    console.log('[ANALYZE] Environment check:', {
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      keyLength: process.env.OPENAI_API_KEY?.length || 0,
      keyPrefix: process.env.OPENAI_API_KEY?.substring(0, 7) || 'none',
      model: process.env.NEXT_PUBLIC_OPENAI_MODEL,
      allOpenAIKeys: Object.keys(process.env).filter(k => k.includes('OPENAI')),
    })

    // Initialize OpenAI client with error handling
    if (!process.env.OPENAI_API_KEY) {
      console.error('[ANALYZE] ERROR: OpenAI API key not found in environment variables')
      console.error('[ANALYZE] Available env vars with OPENAI:', Object.keys(process.env).filter(k => k.includes('OPENAI')))
      return NextResponse.json({ 
        error: 'OpenAI API key not configured. Please check your .env.local file and restart the server.',
        debug: 'Visit /api/test-openai to check environment variables'
      }, { status: 500 })
    }

    let openai: OpenAI
    try {
      console.log('[ANALYZE] Initializing OpenAI client...')
      openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      })
      console.log('[ANALYZE] OpenAI client initialized successfully')
    } catch (initError) {
      console.error('[ANALYZE] ERROR: Failed to initialize OpenAI client:', initError)
      return NextResponse.json({ error: 'Failed to initialize AI service' }, { status: 500 })
    }

    console.log('[ANALYZE] Parsing request body...')
    const { userId } = await request.json()
    console.log('[ANALYZE] User ID from request:', userId)

    if (!userId) {
      console.error('[ANALYZE] ERROR: User ID not provided')
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    // Get user's resume file
    console.log('[ANALYZE] Creating Supabase client...')
    const supabase = createServerClient()
    console.log('[ANALYZE] Querying user_profiles table for userId:', userId)
    
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('resume_file_url, resume_text')
      .eq('user_id', userId)
      .single()

    console.log('[ANALYZE] Database query result:', {
      hasProfile: !!profile,
      hasError: !!profileError,
      errorCode: profileError?.code,
      errorMessage: profileError?.message,
      hasResumeFileUrl: !!profile?.resume_file_url,
      resumeFileUrlLength: profile?.resume_file_url?.length || 0,
    })

    if (profileError || !profile || !profile.resume_file_url) {
      console.error('[ANALYZE] ERROR: Resume not found in database')
      console.error('[ANALYZE] Profile error:', profileError)
      return NextResponse.json({ error: 'Resume not found. Please upload a resume first.' }, { status: 404 })
    }

    // For PDF/DOCX files, we can't extract text easily here
    // Instead, we'll use OpenAI's file reading capabilities or note that analysis happens during job ranking
    // For now, let's return a helpful message that analysis will happen during job ranking
    if (!profile.resume_file_url) {
      console.error('[ANALYZE] ERROR: resume_file_url is empty')
      return NextResponse.json({ error: 'Resume file not found' }, { status: 400 })
    }

    // Check if it's a PDF or DOCX by the data URL
    const isPDF = profile.resume_file_url.includes('application/pdf')
    const isDOCX = profile.resume_file_url.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    console.log('[ANALYZE] File type detection:', { isPDF, isDOCX, fileUrlStart: profile.resume_file_url.substring(0, 100) })
    
    if (isPDF || isDOCX) {
      console.log('[ANALYZE] ===== STARTING PDF/DOCX ANALYSIS =====')
      console.log('[ANALYZE] File type:', isPDF ? 'PDF' : 'DOCX')
      console.log('[ANALYZE] Resume file URL length:', profile.resume_file_url?.length || 0)
      console.log('[ANALYZE] Resume file URL starts with data:', profile.resume_file_url?.startsWith('data:') || false)
      
      // Simple approach: Extract text from PDF/DOCX first, then send to OpenAI Chat API
      // This is much simpler and more reliable than using Assistants API
      const base64Match = profile.resume_file_url.match(/base64,(.+)/)
      console.log('[ANALYZE] Base64 match found:', !!base64Match)
      if (!base64Match) {
        console.error('[ANALYZE] ERROR: Could not extract base64 from file URL')
        return NextResponse.json({ error: 'Could not read PDF file' }, { status: 400 })
      }

      try {
        console.log('[ANALYZE] Step 1: Converting base64 to buffer...')
        console.log('[ANALYZE] Base64 string length:', base64Match[1]?.length || 0)
        
        // Convert base64 to buffer
        const fileBuffer = Buffer.from(base64Match[1], 'base64')
        console.log('[ANALYZE] Buffer created, size:', fileBuffer.length, 'bytes')
        
        let extractedText = ''
        
        if (isPDF) {
          console.log('[ANALYZE] Step 2: Extracting text from PDF using pdf-parse (node build)...')
          const pdfParseModule = await import('pdf-parse/lib/pdf-parse.js').then(mod => mod.default || mod)
          console.log('[ANALYZE] pdfParseModule type:', typeof pdfParseModule)
          console.log('[ANALYZE] pdfParseModule is function:', typeof pdfParseModule === 'function')
          
          try {
            const pdfData = await pdfParseModule(fileBuffer)
            console.log('[ANALYZE] PDF parsed successfully')
            console.log('[ANALYZE] PDF pages:', pdfData.numpages)
            console.log('[ANALYZE] PDF info:', pdfData.info)
            extractedText = pdfData.text
            console.log(`[ANALYZE] Extracted ${extractedText.length} characters from PDF`)
            console.log('[ANALYZE] First 200 chars of extracted text:', extractedText.substring(0, 200))
          } catch (pdfError) {
            console.error('[ANALYZE] ERROR in pdf-parse:', pdfError)
            console.error('[ANALYZE] pdfError type:', typeof pdfError)
            console.error('[ANALYZE] pdfError message:', pdfError instanceof Error ? pdfError.message : String(pdfError))
            console.error('[ANALYZE] pdfError stack:', pdfError instanceof Error ? pdfError.stack : 'No stack')
            throw new Error(`PDF extraction failed: ${pdfError instanceof Error ? pdfError.message : String(pdfError)}`)
          }
        } else if (isDOCX) {
          console.log('[ANALYZE] Step 2: Extracting text from DOCX using mammoth (dynamic import)...')
          const mammothModule = await import('mammoth')
          console.log('[ANALYZE] mammothModule type:', typeof mammothModule)
          console.log('[ANALYZE] mammothModule.extractRawText type:', typeof mammothModule?.extractRawText)
          
          try {
            const result = await mammothModule.extractRawText({ buffer: fileBuffer })
            console.log('[ANALYZE] DOCX parsed successfully')
            extractedText = result.value
            console.log(`[ANALYZE] Extracted ${extractedText.length} characters from DOCX`)
            console.log('[ANALYZE] First 200 chars of extracted text:', extractedText.substring(0, 200))
          } catch (docxError) {
            console.error('[ANALYZE] ERROR in mammoth:', docxError)
            console.error('[ANALYZE] docxError message:', docxError instanceof Error ? docxError.message : String(docxError))
            throw new Error(`DOCX extraction failed: ${docxError instanceof Error ? docxError.message : String(docxError)}`)
          }
        }

        if (!extractedText || extractedText.length < 50) {
          console.error('[ANALYZE] ERROR: Extracted text too short or empty')
          console.error('[ANALYZE] Extracted text length:', extractedText?.length || 0)
          throw new Error('Failed to extract text from file - result too short or empty')
        }

        console.log('[ANALYZE] Step 3: Preparing OpenAI analysis prompt...')
        // Now analyze the extracted text with OpenAI Chat API (simple and reliable)
        const analysisPrompt = `Analyze this resume and provide a thorough analysis including:

1. **Skills**: List all technical skills, tools, and technologies mentioned
2. **Experience**: Years of total experience and key roles/positions
3. **Industries**: Industries or domains the person has worked in
4. **Job Preferences**: Inferred preferences based on resume (e.g., remote work, company size, role types)
5. **Location Preferences**: Any location preferences mentioned or inferred
6. **Seniority Level**: Estimated level (junior, mid, senior, lead)
7. **Summary**: A brief 2-3 sentence professional summary

Format the response as clear, structured text.`

        console.log('[ANALYZE] Step 4: Calling OpenAI Chat API...')
        console.log('[ANALYZE] Model:', process.env.NEXT_PUBLIC_OPENAI_MODEL || 'gpt-3.5-turbo')
        console.log('[ANALYZE] Extracted text length to send:', extractedText.length)
        console.log('[ANALYZE] OpenAI client initialized:', !!openai)
        
        try {
          const completion = await openai.chat.completions.create({
            model: process.env.NEXT_PUBLIC_OPENAI_MODEL || 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: analysisPrompt },
              { role: 'user', content: extractedText },
            ],
            temperature: parseFloat(process.env.NEXT_PUBLIC_LLM_DEFAULT_TEMPERATURE || '0.7'),
          })
          
          console.log('[ANALYZE] OpenAI API call successful')
          console.log('[ANALYZE] Completion object:', {
            hasChoices: !!completion?.choices,
            choicesLength: completion?.choices?.length || 0,
            firstChoiceHasMessage: !!completion?.choices?.[0]?.message,
            firstChoiceHasContent: !!completion?.choices?.[0]?.message?.content
          })

          const summary = completion.choices[0]?.message?.content || ''
          console.log(`[ANALYZE] Generated summary length: ${summary.length} characters`)
          console.log('[ANALYZE] First 200 chars of summary:', summary.substring(0, 200))

          if (!summary || summary.length < 50) {
            console.error('[ANALYZE] ERROR: Summary too short')
            throw new Error('Failed to generate summary - result too short')
          }

          const { jobPreferences, locationPreferences, seniorityPreference } = parsePreferences(summary)

          console.log('[ANALYZE] Step 5: Saving to database...')
          console.log('[ANALYZE] User ID:', userId)
          console.log('[ANALYZE] Extracted text length to save:', extractedText.length)
          console.log('[ANALYZE] Summary length to save:', summary.length)

          // Save both extracted text (for job scoring) and summary (for display)
          const { error: updateError } = await supabase
            .from('user_profiles')
            .update({ 
              resume_text: extractedText, // Store full extracted text for job scoring
              resume_summary: summary,
              job_preferences: jobPreferences,
              location_preferences: locationPreferences,
              seniority_preference: seniorityPreference,
            })
            .eq('user_id', userId)

          if (updateError) {
            console.error('[ANALYZE] ERROR updating database:', updateError)
            console.error('[ANALYZE] Update error code:', updateError.code)
            console.error('[ANALYZE] Update error message:', updateError.message)
            console.error('[ANALYZE] Update error details:', updateError.details)
            return NextResponse.json({ error: `Failed to save: ${updateError.message}` }, { status: 500 })
          }

          console.log('[ANALYZE] ===== SUCCESS: Analysis complete =====')
          return NextResponse.json({
            success: true,
            summary,
            jobPreferences,
            locationPreferences,
            seniorityPreference,
          })
        } catch (openaiError) {
          console.error('[ANALYZE] ERROR in OpenAI API call:', openaiError)
          console.error('[ANALYZE] OpenAI error type:', typeof openaiError)
          console.error('[ANALYZE] OpenAI error message:', openaiError instanceof Error ? openaiError.message : String(openaiError))
          console.error('[ANALYZE] OpenAI error stack:', openaiError instanceof Error ? openaiError.stack : 'No stack')
          throw new Error(`OpenAI API failed: ${openaiError instanceof Error ? openaiError.message : String(openaiError)}`)
        }

      } catch (error) {
        console.error('[ANALYZE] ===== FATAL ERROR IN PDF/DOCX ANALYSIS =====')
        console.error('[ANALYZE] Error type:', typeof error)
        console.error('[ANALYZE] Error is Error instance:', error instanceof Error)
        console.error('[ANALYZE] Error message:', error instanceof Error ? error.message : String(error))
        console.error('[ANALYZE] Error stack:', error instanceof Error ? error.stack : 'No stack')
        console.error('[ANALYZE] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
        
        return NextResponse.json({ 
          error: `Could not analyze ${isPDF ? 'PDF' : 'DOCX'} file: ${error instanceof Error ? error.message : 'Unknown error'}. Please try uploading a text (.txt) version of your resume.`,
        }, { status: 500 })
      }
    }

    // For text files, we can extract and analyze
    let resumeContent: string
    if (profile.resume_file_url.startsWith('data:')) {
      const base64Match = profile.resume_file_url.match(/base64,(.+)/)
      if (base64Match) {
        try {
          resumeContent = Buffer.from(base64Match[1], 'base64').toString('utf-8')
        } catch (e) {
          return NextResponse.json({ 
            error: 'Could not read resume file' 
          }, { status: 400 })
        }
      } else {
        return NextResponse.json({ error: 'Could not read resume file' }, { status: 400 })
      }
    } else {
      return NextResponse.json({ error: 'Resume file format not supported' }, { status: 400 })
    }

    // Call OpenAI to analyze resume
    const model = process.env.NEXT_PUBLIC_OPENAI_MODEL || 'gpt-3.5-turbo' // Use gpt-3.5-turbo as default (more reliable)
    
    const prompt = `Analyze this resume and extract the following information in a structured format:

1. **Skills**: List all technical skills, tools, and technologies mentioned
2. **Experience**: Years of total experience and key roles/positions
3. **Industries**: Industries or domains the person has worked in
4. **Job Preferences**: Inferred preferences based on resume (e.g., remote work, company size, role types)
5. **Location Preferences**: Any location preferences mentioned or inferred
6. **Seniority Level**: Estimated level (junior, mid, senior, lead)
7. **Summary**: A brief 2-3 sentence professional summary

Format the response as clear, structured text that can be easily parsed.`

    let completion
    try {
      completion = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: resumeContent },
        ],
        temperature: parseFloat(process.env.NEXT_PUBLIC_LLM_DEFAULT_TEMPERATURE || '0.7'),
      })
    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError)
      const errorMessage = openaiError instanceof Error ? openaiError.message : 'Unknown OpenAI error'
      return NextResponse.json({ 
        error: `AI analysis failed: ${errorMessage}. Please check your OpenAI API key and model configuration.` 
      }, { status: 500 })
    }

    const summary = completion.choices[0]?.message?.content || ''

    if (!summary || summary.length < 50) {
      return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 })
    }

    const { jobPreferences, locationPreferences, seniorityPreference } = parsePreferences(summary)

    // Update profile with summary + resume text
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ 
        resume_summary: summary,
        resume_text: resumeContent,
        job_preferences: jobPreferences,
        location_preferences: locationPreferences,
        seniority_preference: seniorityPreference,
      })
      .eq('user_id', userId)

    if (updateError) {
      console.error('Error updating resume summary:', updateError)
      return NextResponse.json({ error: `Failed to save summary: ${updateError.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      summary,
      jobPreferences,
      locationPreferences,
      seniorityPreference,
    })
  } catch (error) {
    console.error('Resume analysis error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

