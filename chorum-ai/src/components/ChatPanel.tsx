'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, Users, Plus, X, Image as ImageIcon, PanelRight, PanelRightClose, Zap, Paperclip } from 'lucide-react'
import { Message } from './Message'
import { ProviderSelector } from './ProviderSelector'
import { AgentSelector } from './AgentSelector'
import { CostMeter } from './CostMeter'
import { ChoralThinking } from './ChoralSpinner'
import { useChorumStore } from '@/lib/store'
import { useReviewStore } from '@/lib/review/store'
import clsx from 'clsx'

export type Attachment = {
    type: 'image' | 'text' | 'code' | 'markdown' | 'json' | 'pdf';
    name: string;
    content: string; // base64 for images/pdf, text for others
    mimeType: string;
}

export function ChatPanel({ projectId }: { projectId?: string }) {
    const [message, setMessage] = useState('')
    const [selectedProvider, setSelectedProvider] = useState<string>('auto')
    const [selectedAgent, setSelectedAgent] = useState<string>('none')
    const [attachments, setAttachments] = useState<Attachment[]>([])
    const [isDragging, setIsDragging] = useState(false)

    const messagesEndRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const { messages, sendMessage, isLoading, isAgentPanelOpen, toggleAgentPanel } = useChorumStore()
    const { config: reviewConfig, updateConfig: updateReviewConfig } = useReviewStore()

    // Get responding agent from most recent assistant message (not selection)
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant')
    const respondingAgent = lastAssistantMessage?.agentName ? {
        name: lastAssistantMessage.agentName,
        icon: lastAssistantMessage.agentIcon || '🤖',
        tier: lastAssistantMessage.agentTier
    } : null

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files) return
        processFiles(files)
        // Reset input so same file can be selected again if needed
        e.target.value = ''
    }

    const processFiles = (files: FileList | File[]) => {
        Array.from(files).forEach(file => {
            const isImage = file.type.startsWith('image/')
            const isPdf = file.type === 'application/pdf'
            const isText = file.type.startsWith('text/') ||
                file.name.endsWith('.md') ||
                file.name.endsWith('.json') ||
                file.name.endsWith('.ts') ||
                file.name.endsWith('.tsx') ||
                file.name.endsWith('.js') ||
                file.name.endsWith('.py')

            // Size limits: 5MB for images/PDFs, 100KB for text
            const limit = (isImage || isPdf) ? 5 * 1024 * 1024 : 100 * 1024

            if (file.size > limit) {
                alert(`File ${file.name} too large (max ${isImage || isPdf ? '5MB' : '100KB'})`)
                return
            }

            const reader = new FileReader()
            reader.onload = (e) => {
                const result = e.target?.result as string
                let type: Attachment['type'] = 'text'
                let content = result

                if (isImage) {
                    type = 'image'
                    // Result is already base64 data url
                } else if (isPdf) {
                    type = 'pdf'
                    // Result is data url, keep as is
                } else {
                    // Refine text type based on extension
                    if (file.name.endsWith('.md')) type = 'markdown'
                    else if (file.name.endsWith('.json')) type = 'json'
                    else if (['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs'].some(ext => file.name.endsWith(ext))) type = 'code'

                    // For text files, we want the raw text content, not data URL
                    // But FileReader.readAsText is async. 
                    // Let's use readAsText for text files below
                }

                // If it was read as DataURL but we want text (shouldn't happen with logic below)
                setAttachments(prev => {
                    // Avoid duplicates
                    if (prev.some(a => a.name === file.name && a.content === content)) return prev
                    return [...prev, {
                        type,
                        name: file.name,
                        content,
                        mimeType: file.type
                    }].slice(-5) // Limit to 5 attachments at once
                })
            }

            if (isImage || isPdf) {
                reader.readAsDataURL(file)
            } else {
                reader.readAsText(file)
            }
        })
    }

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index))
    }

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const onDragLeave = () => {
        setIsDragging(false)
    }

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        if (e.dataTransfer.files) {
            processFiles(Array.from(e.dataTransfer.files))
        }
    }

    const handleSend = async () => {
        if (!message.trim() && attachments.length === 0) return
        if (!projectId) return

        const content = message
        const currentAttachments = attachments.length > 0 ? attachments : undefined

        // Backward compatibility for images
        const currentImages = attachments
            .filter(a => a.type === 'image')
            .map(a => a.content)

        // Clear input immediately
        setMessage('')
        setAttachments([])

        await sendMessage({
            projectId,
            content,
            images: currentImages.length > 0 ? currentImages : undefined,
            attachments: currentAttachments, // Pass enhanced attachments
            providerOverride: selectedProvider === 'auto' ? undefined : selectedProvider,
            agentOverride: selectedAgent
        })
    }

    // File icon helper
    const getFileIcon = (type: Attachment['type']) => {
        switch (type) {
            case 'image': return <ImageIcon className="w-4 h-4" />
            case 'pdf': return <span className="font-bold text-[10px]">PDF</span>
            case 'code': return <span className="font-mono text-[10px]">&lt;/&gt;</span>
            case 'markdown': return <span className="font-bold text-[10px]">MD</span>
            case 'json': return <span className="font-mono text-[10px]">{'{ }'}</span>
            default: return <Paperclip className="w-4 h-4" />
        }
    }

    return (
        <div className="flex-1 flex flex-col bg-gray-950 min-h-0">
            {/* Header */}
            <div className="h-14 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-950/50 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    {/* Show responding agent (from last message), not selected agent */}
                    {respondingAgent && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 rounded-full border border-gray-700">
                            <span className="text-base">{respondingAgent.icon}</span>
                            <span className="text-sm text-gray-300">{respondingAgent.name}</span>
                            {respondingAgent.tier && (
                                <span className={clsx(
                                    'text-xs px-1.5 py-0.5 rounded',
                                    respondingAgent.tier === 'reasoning' && 'bg-purple-500/20 text-purple-400',
                                    respondingAgent.tier === 'balanced' && 'bg-blue-500/20 text-blue-400',
                                    respondingAgent.tier === 'fast' && 'bg-green-500/20 text-green-400'
                                )}>
                                    {respondingAgent.tier}
                                </span>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => updateReviewConfig({ enabled: !reviewConfig.enabled })}
                        className={clsx(
                            'hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                            reviewConfig.enabled
                                ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                                : 'bg-gray-800/50 text-gray-500 hover:text-gray-400 border border-gray-700'
                        )}
                        title="Phone a Friend - Get second opinion from another LLM"
                    >
                        <Users className="w-4 h-4" />
                        <span className="hidden lg:inline">Review</span>
                    </button>

                    <button
                        onClick={toggleAgentPanel}
                        className={clsx(
                            "p-2 rounded-lg transition-colors border",
                            isAgentPanelOpen
                                ? "bg-blue-600/10 text-blue-400 border-blue-500/30"
                                : "text-gray-500 hover:text-gray-400 border-transparent hover:bg-gray-800"
                        )}
                        title={isAgentPanelOpen ? "Close Agent Drawer" : "Open Agent Drawer"}
                    >
                        {isAgentPanelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRight className="w-5 h-5" />}
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 space-y-6 min-h-0">
                {messages.map((msg, index) => {
                    // Find the most recent user message before this one
                    const previousUserMessage = messages
                        .slice(0, index)
                        .reverse()
                        .find(m => m.role === 'user')?.content
                    return (
                        <Message
                            key={msg.id}
                            message={msg}
                            previousUserMessage={previousUserMessage}
                        />
                    )
                })}
                {messages.length === 0 && !isLoading && (
                    <div className="text-center text-gray-500 mt-20">
                        <p className="text-gray-400 italic">the choir is waiting</p>
                    </div>
                )}
                {/* Choral Spinner - shows while waiting for response */}
                {isLoading && (
                    <div className="flex justify-start pl-2">
                        <ChoralThinking />
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-800 p-6 bg-gray-950">
                <div className="max-w-4xl mx-auto">
                    <div
                        className={clsx(
                            "relative flex flex-col bg-gray-900 border border-gray-800 rounded-xl transition-all shadow-sm",
                            "focus-within:border-gray-700 focus-within:ring-1 focus-within:ring-gray-800",
                            isDragging && "ring-2 ring-blue-500/50 border-blue-500 bg-blue-500/5"
                        )}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                    >
                        {/* Omnibar Header: Agent & Context */}
                        <div className="flex items-center gap-2 p-1.5 border-b border-gray-800/50">
                            <AgentSelector
                                value={selectedAgent}
                                onChange={setSelectedAgent}
                                mode="omnibar"
                            />

                            {/* Context Indicator - show when agent selected (not 'none' control mode) */}
                            {selectedAgent !== 'none' && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-medium border border-blue-500/20">
                                    <Zap className="w-3 h-3" />
                                    <span>Context Active</span>
                                </div>
                            )}
                        </div>

                        {/* Input Area */}
                        <div className="p-3">
                            {/* Attachment Previews */}
                            {attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {attachments.map((att, idx) => (
                                        <div key={idx} className="relative group/att w-16 h-16 rounded-lg overflow-hidden border border-gray-700 shadow-sm bg-gray-800 flex flex-col items-center justify-center text-xs text-gray-400">
                                            {att.type === 'image' ? (
                                                <img src={att.content} alt="preview" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-1 p-1 w-full text-center">
                                                    <div className="w-6 h-6 flex items-center justify-center bg-gray-700 rounded text-gray-300">
                                                        {getFileIcon(att.type)}
                                                    </div>
                                                    <span className="truncate w-full text-[9px] px-1">{att.name}</span>
                                                </div>
                                            )}
                                            <button
                                                onClick={() => removeAttachment(idx)}
                                                className="absolute top-0.5 right-0.5 p-0.5 bg-black/50 text-white rounded-full opacity-0 group-hover/att:opacity-100 transition-opacity hover:bg-red-500 z-10"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handleSend()
                                    }
                                }}
                                placeholder={selectedAgent === 'none'
                                    ? "Type a message (direct LLM)..."
                                    : "Type a message..."
                                }
                                className="w-full bg-transparent border-none text-gray-200 placeholder-gray-500 focus:ring-0 resize-none p-0 text-base min-h-[60px]"
                                rows={1}
                                style={{ minHeight: '60px' }}
                            />
                        </div>

                        {/* Omnibar Footer: Actions & Send */}
                        <div className="flex items-center justify-between p-2 pt-0">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-2 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-gray-300 transition-colors"
                                    title="Attach file (Image, PDF, Code, Text)"
                                >
                                    <Paperclip className="w-4 h-4" />
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileSelect}
                                    accept="image/*,.pdf,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.c,.cpp,.h,.css,.html,.xml,.yaml,.yml,.toml,.sql,.sh,.bash,.ps1"
                                    multiple
                                    className="hidden"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <ProviderSelector
                                    value={selectedProvider}
                                    onChange={setSelectedProvider}
                                    mode="omnibar"
                                />
                                <div className="h-4 w-px bg-gray-800 mx-1" />
                                <button
                                    onClick={handleSend}
                                    disabled={(!message.trim() && attachments.length === 0) || isLoading}
                                    className="p-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg transition-colors flex items-center justify-center text-white shadow-sm"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="text-center mt-3">
                        <div className="text-[10px] text-gray-600">
                            <strong>Enter</strong> to send, <strong>Shift + Enter</strong> for new line
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
