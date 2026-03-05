'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { Components } from 'react-markdown'

export interface MessageContentProps {
    content: string
    role: 'user' | 'assistant'
    isStreaming?: boolean
}

function CodeBlock({ children, className }: { children: string; className?: string }) {
    const [copied, setCopied] = useState(false)
    const match = /language-(\w+)/.exec(className || '')
    const lang = match ? match[1] : 'text'

    const handleCopy = () => {
        navigator.clipboard.writeText(children).catch(() => { })
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    return (
        <div className="relative my-2">
            <button
                onClick={handleCopy}
                className="absolute top-2 right-2 text-[10px] text-[var(--hg-text-tertiary)] hover:text-[var(--hg-text-primary)] z-10 px-1.5 py-0.5 bg-[#1e1e2e] border border-[var(--hg-border)] transition-colors"
            >
                {copied ? 'Copied!' : 'Copy'}
            </button>
            <SyntaxHighlighter
                style={oneDark}
                language={lang}
                PreTag="div"
                customStyle={{ margin: 0, fontSize: '0.82em', borderRadius: 0 }}
            >
                {children}
            </SyntaxHighlighter>
        </div>
    )
}

const markdownComponents: Components = {
    code({ node, className, children, ...props }) {
        const lang = className?.match(/language-(\w+)/)?.[1]
        const isBlock = !!lang || String(children).includes('\n')
        if (isBlock) {
            return <CodeBlock className={className ?? ''}>{String(children).replace(/\n$/, '')}</CodeBlock>
        }
        return (
            <code
                className="bg-[var(--hg-surface)] px-1 py-0.5 text-[var(--hg-accent)] font-mono text-[0.85em] rounded-sm"
            >
                {children}
            </code>
        )
    },
    a({ children, href }) {
        return (
            <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--hg-accent)] hover:underline"
            >
                {children}
            </a>
        )
    },
    blockquote({ children }) {
        return (
            <blockquote className="border-l-2 border-[var(--hg-border-subtle)] pl-4 text-[var(--hg-text-secondary)] my-2">
                {children}
            </blockquote>
        )
    },
    table({ children }) {
        return (
            <div className="overflow-x-auto my-3">
                <table className="text-sm border-collapse">{children}</table>
            </div>
        )
    },
    th({ children }) {
        return (
            <th className="bg-[var(--hg-surface)] border border-[var(--hg-border)] px-3 py-1.5 text-left font-medium text-[var(--hg-text-primary)]">
                {children}
            </th>
        )
    },
    td({ children }) {
        return (
            <td className="border border-[var(--hg-border)] px-3 py-1.5 text-[var(--hg-text-secondary)]">
                {children}
            </td>
        )
    },
    h1({ children }) {
        return <h1 className="text-lg font-medium mt-4 mb-2 text-[var(--hg-text-primary)]">{children}</h1>
    },
    h2({ children }) {
        return <h2 className="text-base font-medium mt-3 mb-1.5 text-[var(--hg-text-primary)]">{children}</h2>
    },
    h3({ children }) {
        return <h3 className="text-sm font-medium mt-2 mb-1 text-[var(--hg-text-primary)]">{children}</h3>
    },
    p({ children }) {
        return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
    },
    ul({ children }) {
        return <ul className="list-disc list-inside mb-2 space-y-0.5 text-[var(--hg-text-primary)]">{children}</ul>
    },
    ol({ children }) {
        return <ol className="list-decimal list-inside mb-2 space-y-0.5 text-[var(--hg-text-primary)]">{children}</ol>
    },
    li({ children }) {
        return <li className="text-[var(--hg-text-primary)]">{children}</li>
    },
}

export function MessageContent({ content, role, isStreaming }: MessageContentProps) {
    if (role === 'user') {
        return (
            <span className="whitespace-pre-wrap text-[var(--hg-text-primary)]">
                {content}
            </span>
        )
    }

    return (
        <div className="prose prose-invert max-w-none text-sm text-[var(--hg-text-primary)]">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={markdownComponents}
            >
                {content}
            </ReactMarkdown>
            {isStreaming && (
                <span className="animate-pulse text-[var(--hg-accent)]">|</span>
            )}
        </div>
    )
}
