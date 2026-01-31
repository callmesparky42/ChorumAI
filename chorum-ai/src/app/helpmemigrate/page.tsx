'use client'

import Link from 'next/link'

export default function MigratePage() {
    return (
        <div className="min-h-screen bg-[#0f1218] text-white flex flex-col items-center justify-center p-8">
            <div className="max-w-2xl text-center">
                <h1 className="text-4xl font-bold mb-6 text-[#E1E7EF]">Migration Guide</h1>
                <p className="text-xl text-[#94A3B8] mb-8">
                    We're working on a detailed guide to help you migrate your context and history from other providers to Chorum.
                </p>
                <div className="bg-[#1A1F2B] p-6 rounded-lg border border-[#2E3645] mb-8 text-left">
                    <h3 className="text-lg font-semibold text-[#6FA2ED] mb-2">Coming Soon</h3>
                    <ul className="list-disc list-inside space-y-2 text-[#94A3B8]">
                        <li>Import from ChatGPT history export</li>
                        <li>Import from Claude JSON export</li>
                        <li>Migrate local Ollama models</li>
                    </ul>
                </div>
                <Link href="/" className="bg-[#2E3645] hover:bg-[#3D4759] text-white px-6 py-3 rounded-lg transition-colors">
                    Back to Home
                </Link>
            </div>
        </div>
    )
}
