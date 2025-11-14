'use client'

export default function TestEnvPage() {
  // Client-side env vars (NEXT_PUBLIC_*)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Environment Variables Check</h1>
      <div className="space-y-2 mb-4">
        <p><strong>NEXT_PUBLIC_SUPABASE_URL:</strong> {supabaseUrl ? '✅ Set' : '❌ Missing'}</p>
        {supabaseUrl && <p className="text-xs text-gray-500 ml-4">Value: {supabaseUrl.substring(0, 50)}...</p>}
        <p><strong>NEXT_PUBLIC_SUPABASE_ANON_KEY:</strong> {supabaseAnonKey ? '✅ Set' : '❌ Missing'}</p>
        {supabaseAnonKey && <p className="text-xs text-gray-500 ml-4">Length: {supabaseAnonKey.length} chars</p>}
      </div>
      
      {!supabaseUrl || !supabaseAnonKey ? (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded">
          <p className="font-bold text-red-800">Variables Missing!</p>
          <p className="mt-2">Try this:</p>
          <ol className="list-decimal list-inside mt-2 space-y-1">
            <li>Make sure file is named <code className="bg-gray-200 px-1">.env.local</code></li>
            <li>Format: <code className="bg-gray-200 px-1">NEXT_PUBLIC_SUPABASE_URL=your_url</code> (no quotes, no spaces around =)</li>
            <li>If quotes worked in other apps, try: <code className="bg-gray-200 px-1">NEXT_PUBLIC_SUPABASE_URL="your_url"</code></li>
            <li>Restart dev server completely (stop with Ctrl+C, then <code className="bg-gray-200 px-1">npm run dev</code>)</li>
            <li>Hard refresh browser (Ctrl+Shift+R or Ctrl+F5)</li>
          </ol>
        </div>
      ) : (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded">
          <p className="font-bold text-green-800">✅ All variables loaded!</p>
          <p className="mt-2">You can now go to <a href="/companies" className="text-blue-600 underline">Companies</a> or <a href="/jobs" className="text-blue-600 underline">Jobs</a></p>
        </div>
      )}
    </div>
  )
}

