import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import path from 'path'

export const dynamic = 'force-dynamic'

function runAnalyzer(): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'scripts', 'analyze-benchmarks.js')
    exec(`node "${scriptPath}"`, { timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message))
        return
      }
      resolve(stdout)
    })
  })
}

export async function POST() {
  try {
    const output = await runAnalyzer()
    return NextResponse.json({ success: true, output })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

