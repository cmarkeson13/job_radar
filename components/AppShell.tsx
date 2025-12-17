'use client'

import Link from 'next/link'
import { useState } from 'react'

const navItems = [
  { href: '/', label: 'Home' },
  { href: '/companies', label: 'Companies' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/resume', label: 'Resume' },
  { href: '/top-matches', label: 'Top Matches' },
  { href: '/test-benchmarks', label: 'Test Benchmarks' },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative min-h-screen bg-gray-50">
      <button
        aria-label="Open navigation menu"
        className="fixed top-4 left-4 z-50 inline-flex items-center justify-center w-10 h-10 rounded-md bg-white shadow border border-gray-200 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        onClick={() => setOpen(true)}
      >
        <span className="sr-only">Open navigation</span>
        <div className="space-y-1.5">
          <span className="block h-0.5 w-5 bg-gray-800" />
          <span className="block h-0.5 w-5 bg-gray-800" />
          <span className="block h-0.5 w-5 bg-gray-800" />
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-30"
          role="presentation"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-white shadow-xl transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Navigation"
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200">
          <span className="text-lg font-semibold text-gray-900">Navigation</span>
          <button
            aria-label="Close navigation"
            className="text-gray-500 hover:text-gray-700 focus:outline-none"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>
        <nav className="px-4 py-4 space-y-2">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded px-3 py-2 text-sm font-medium text-gray-800 hover:bg-indigo-50 hover:text-indigo-700"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="min-h-screen">{children}</main>
    </div>
  )
}

