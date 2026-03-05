'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import clsx from 'clsx'

export interface OmnibarAttachment {
    type: 'image' | 'pdf' | 'text' | 'code' | 'markdown' | 'json'
    name: string
    content: string
    mimeType: string
    sizeBytes: number
}

export interface OmnibarProps {
    onSend: (content: string, attachments: OmnibarAttachment[]) => void
    isStreaming: boolean
    providers: string[]
    selectedProvider: string | null
    onProviderChange: (provider: string | null) => void
    projectName?: string
    disabled?: boolean
}

const ACCEPTED_TYPES = 'image/*,.pdf,.txt,.md,.json,.ts,.tsx,.js,.jsx,.py,.go,.rs,.sql,.yaml,.yml'
const MAX_TEXT_SIZE = 100 * 1024 // 100KB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_ATTACHMENTS = 5

function getAttachmentType(mimeType: string, name: string): OmnibarAttachment['type'] {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType === 'application/pdf') return 'pdf'
    if (mimeType === 'application/json' || name.endsWith('.json')) return 'json'
    if (name.endsWith('.md') || name.endsWith('.markdown')) return 'markdown'
    if (/\.(ts|tsx|js|jsx|py|go|rs|sql)$/.test(name)) return 'code'
    return 'text'
}

async function compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        const url = URL.createObjectURL(file)
        img.onload = () => {
            URL.revokeObjectURL(url)
            const MAX = 1568
            let w = img.width
            let h = img.height
            if (w > MAX || h > MAX) {
                if (w > h) { h = Math.round((h * MAX) / w); w = MAX }
                else { w = Math.round((w * MAX) / h); h = MAX }
            }
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')
            if (!ctx) { reject(new Error('canvas context unavailable')); return }
            ctx.drawImage(img, 0, 0, w, h)
            resolve(canvas.toDataURL('image/jpeg', 0.8))
        }
        img.onerror = reject
        img.src = url
    })
}

export function Omnibar({
    onSend,
    isStreaming,
    providers,
    selectedProvider,
    onProviderChange,
    projectName,
    disabled,
}: OmnibarProps) {
    const [content, setContent] = useState('')
    const [attachments, setAttachments] = useState<OmnibarAttachment[]>([])
    const [dragOver, setDragOver] = useState(false)
    const [toastMsg, setToastMsg] = useState<string | null>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const showToast = (msg: string) => {
        setToastMsg(msg)
        setTimeout(() => setToastMsg(null), 3000)
    }

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = '60px'
        el.style.height = Math.min(el.scrollHeight, 180) + 'px'
    }, [content])

    const handleSend = () => {
        if (isStreaming || disabled) return
        if (!content.trim() && attachments.length === 0) return
        onSend(content, attachments)
        setContent('')
        setAttachments([])
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const processFiles = useCallback(async (files: FileList | File[]) => {
        const fileArr = Array.from(files)
        if (attachments.length + fileArr.length > MAX_ATTACHMENTS) {
            showToast('Maximum 5 attachments per message.')
            return
        }

        for (const file of fileArr) {
            const isImage = file.type.startsWith('image/')
            const isPdf = file.type === 'application/pdf'
            const isText = !isImage && !isPdf

            if (isImage && file.size > MAX_IMAGE_SIZE) {
                showToast(`${file.name} exceeds 5MB limit.`)
                continue
            }
            if (!isImage && file.size > MAX_TEXT_SIZE) {
                showToast(`${file.name} exceeds 100KB limit.`)
                continue
            }

            try {
                let content: string
                if (isImage) {
                    content = await compressImage(file)
                } else {
                    content = await file.text()
                }

                const attachment: OmnibarAttachment = {
                    type: getAttachmentType(file.type, file.name),
                    name: file.name,
                    content,
                    mimeType: file.type,
                    sizeBytes: file.size,
                }
                setAttachments(prev => {
                    if (prev.length >= MAX_ATTACHMENTS) return prev
                    return [...prev, attachment]
                })
            } catch {
                showToast(`Failed to read ${file.name}.`)
            }
        }
    }, [attachments.length])

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            processFiles(e.target.files)
            e.target.value = ''
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files) processFiles(e.dataTransfer.files)
    }

    const removeAttachment = (idx: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== idx))
    }

    const canSend = !isStreaming && !disabled && (content.trim() !== '' || attachments.length > 0)

    return (
        <div className="relative">
            {toastMsg && (
                <div className="absolute bottom-full left-0 mb-2 px-3 py-1.5 bg-[var(--hg-surface)] border border-[var(--hg-border)] text-xs text-[var(--hg-text-secondary)] whitespace-nowrap">
                    {toastMsg}
                </div>
            )}

            <div
                className={clsx(
                    'border border-[var(--hg-border)] bg-[var(--hg-surface)] transition-colors',
                    dragOver && 'border-[var(--hg-accent)] ring-1 ring-[var(--hg-accent)]'
                )}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
            >
                {/* Attachment chips */}
                {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-3 pt-2.5 pb-1">
                        {attachments.map((att, i) => (
                            <span
                                key={i}
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--hg-surface-hover)] border border-[var(--hg-border)] text-[10px] text-[var(--hg-text-secondary)] max-w-[180px]"
                            >
                                <span className="text-[var(--hg-text-tertiary)]">📎</span>
                                <span className="truncate">{att.name}</span>
                                <button
                                    onClick={() => removeAttachment(i)}
                                    className="text-[var(--hg-text-tertiary)] hover:text-[var(--hg-destructive)] ml-0.5 shrink-0"
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                    </div>
                )}

                {/* Textarea */}
                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={projectName ? `Message ${projectName}...` : 'Message Chorum...'}
                    disabled={isStreaming || disabled}
                    className={clsx(
                        'w-full bg-transparent px-3 py-3 text-sm text-[var(--hg-text-primary)] outline-none resize-none',
                        'placeholder:text-[var(--hg-text-tertiary)]',
                        'min-h-[60px] max-h-[180px]',
                        (isStreaming || disabled) && 'opacity-60 cursor-not-allowed'
                    )}
                    rows={1}
                />

                {/* Footer toolbar */}
                <div className="flex items-center justify-between px-3 py-2 border-t border-[var(--hg-border)]">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isStreaming || disabled}
                            className="text-[var(--hg-text-tertiary)] hover:text-[var(--hg-text-secondary)] text-sm disabled:opacity-40 transition-colors"
                            title="Attach file"
                        >
                            📎
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept={ACCEPTED_TYPES}
                            onChange={handleFileChange}
                            className="hidden"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        {providers.length > 1 && (
                            <select
                                value={selectedProvider ?? ''}
                                onChange={e => onProviderChange(e.target.value || null)}
                                className="bg-transparent text-[10px] text-[var(--hg-text-tertiary)] outline-none cursor-pointer hover:text-[var(--hg-text-secondary)] border-none"
                            >
                                <option value="">auto</option>
                                {providers.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        )}

                        <button
                            type="button"
                            onClick={handleSend}
                            disabled={!canSend}
                            className={clsx(
                                'px-3 py-1 text-sm border transition-colors',
                                canSend
                                    ? 'border-[var(--hg-accent)] text-[var(--hg-accent)] hover:bg-[var(--hg-accent)] hover:text-[var(--hg-bg)]'
                                    : 'border-[var(--hg-border)] text-[var(--hg-text-tertiary)] cursor-not-allowed opacity-50'
                            )}
                        >
                            {isStreaming ? (
                                <span className="animate-pulse">·</span>
                            ) : '→'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
