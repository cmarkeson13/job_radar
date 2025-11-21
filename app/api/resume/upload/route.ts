import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const userId = formData.get('userId') as string

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    // Validate file type (PDF, DOCX, or TXT)
    const fileType = file.type
    const fileName = file.name.toLowerCase()
    const isPDF = fileType === 'application/pdf' || fileName.endsWith('.pdf')
    const isDOCX = fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx')
    const isTXT = fileType === 'text/plain' || fileName.endsWith('.txt')

    if (!isPDF && !isDOCX && !isTXT) {
      return NextResponse.json({ error: 'Only PDF, DOCX, and TXT files are supported' }, { status: 400 })
    }

    // Validate file size (max 10MB - increased since we're storing the file)
    const maxSize = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 })
    }

    // Convert file to base64 for storage (AI can read base64 encoded files)
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64File = buffer.toString('base64')
    const mimeType = file.type || (isPDF ? 'application/pdf' : isDOCX ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/plain')

    // Store in database
    const supabase = createServerClient()
    
    // Check if profile exists
    const { data: existingProfile, error: checkError } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('user_id', userId)
      .single()
    
    // If table doesn't exist, return helpful error
    if (checkError && checkError.code === '42P01') {
      return NextResponse.json({ 
        error: 'Database table not found. Please run the migration: supabase/migration_add_user_profiles.sql' 
      }, { status: 500 })
    }

    const profileData = {
      user_id: userId,
      resume_text: base64File, // Store base64 encoded file
      resume_file_url: `data:${mimeType};base64,${base64File}`, // Data URL for easy access
      resume_uploaded_at: new Date().toISOString(),
    }

    let result
    if (existingProfile) {
      // Update existing profile
      result = await supabase
        .from('user_profiles')
        .update(profileData)
        .eq('id', existingProfile.id)
        .select()
        .single()
    } else {
      // Create new profile
      result = await supabase
        .from('user_profiles')
        .insert(profileData)
        .select()
        .single()
    }

    if (result.error) {
      console.error('Error saving resume:', result.error)
      return NextResponse.json({ error: `Failed to save resume: ${result.error.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileSize: file.size,
      fileType: mimeType,
      uploadedAt: profileData.resume_uploaded_at,
    })
  } catch (error) {
    console.error('Resume upload error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Full error details:', { errorMessage, error })
    return NextResponse.json(
      { error: `Server error: ${errorMessage}` },
      { status: 500 }
    )
  }
}

