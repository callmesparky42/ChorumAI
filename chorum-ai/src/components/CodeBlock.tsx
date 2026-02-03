'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface CodeBlockProps {
    className?: string
    children: React.ReactNode
}

export function CodeBlock({ className, children }: CodeBlockProps) {
    const [copied, setCopied] = useState(false)
    const match = /language-(\w+)/.exec(className || '')
    const language = match ? match[1] : ''
    const content = String(children).replace(/\n$/, '')

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(content)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy code:', err)
        }
    }

    return (
        <div className="relative group my-4 rounded-lg overflow-hidden border border-gray-700/50 bg-gray-950/50">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-gray-900/50 border-b border-gray-800 text-xs text-gray-400">
                <span className="font-mono">{language || 'text'}</span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 hover:text-white transition-colors"
                >
                    {copied ? (
                        <>
                            <Check className="w-3.5 h-3.5 text-green-500" />
                            <span className="text-green-500">Copied!</span>
                        </>
                    ) : (
                        <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                        </>
                    )}
                </button>
            </div>

            {/* Content */}
            <div className="overflow-x-auto p-4">
                <code className={className}>
                    {children}
                </code>
            </div>
        </div>
    )
}
