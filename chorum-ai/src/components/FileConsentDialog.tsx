'use client'

import { useState } from 'react'
import { X, FileText, Clock, Database, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import type { Attachment } from '@/lib/chat/types'

interface PendingFile {
    file: File
    attachment: Attachment
}

interface FileDecision {
    attachment: Attachment
    persistent: boolean
}

interface Props {
    pendingFiles: PendingFile[]
    onConfirm: (decisions: FileDecision[]) => void
    onCancel: () => void
}

export function FileConsentDialog({ pendingFiles, onConfirm, onCancel }: Props) {
    // Track persistent choice per file (default: false = ephemeral)
    const [decisions, setDecisions] = useState<Record<string, boolean>>(() => {
        const initial: Record<string, boolean> = {}
        pendingFiles.forEach((pf, idx) => {
            initial[idx] = false // Default to ephemeral
        })
        return initial
    })

    const handleToggle = (idx: number, persistent: boolean) => {
        setDecisions(prev => ({ ...prev, [idx]: persistent }))
    }

    const handleConfirm = () => {
        const result: FileDecision[] = pendingFiles.map((pf, idx) => ({
            attachment: pf.attachment,
            persistent: decisions[idx] ?? false
        }))
        onConfirm(result)
    }

    const getFileIcon = (type: Attachment['type']) => {
        switch (type) {
            case 'code': return <span className="font-mono text-xs">&lt;/&gt;</span>
            case 'markdown': return <span className="font-bold text-xs">MD</span>
            case 'json': return <span className="font-mono text-xs">{'{ }'}</span>
            default: return <FileText className="w-4 h-4" />
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-950">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/10 rounded-lg">
                            <AlertTriangle className="w-5 h-5 text-amber-400" />
                        </div>
                        <div>
                            <h3 className="font-medium text-white">File Upload Options</h3>
                            <p className="text-xs text-gray-500">Choose how to handle these files</p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                    {/* Info Banner */}
                    <div className="p-3 bg-blue-900/20 border border-blue-700/30 rounded-lg text-xs text-blue-300 space-y-1">
                        <p><strong>Ephemeral:</strong> File used for this conversation only. Excluded from learning extraction.</p>
                        <p><strong>Persistent:</strong> File stored in project. Available for future conversations with linked learnings.</p>
                    </div>

                    {/* File List */}
                    {pendingFiles.map((pf, idx) => (
                        <div key={idx} className="p-3 bg-gray-950 border border-gray-800 rounded-lg space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 flex items-center justify-center bg-gray-800 rounded text-gray-400">
                                    {getFileIcon(pf.attachment.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white truncate">{pf.attachment.name}</p>
                                    <p className="text-xs text-gray-500">
                                        {pf.attachment.type} &middot; {(pf.file.size / 1024).toFixed(1)} KB
                                    </p>
                                </div>
                            </div>

                            {/* Radio Options */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleToggle(idx, false)}
                                    className={clsx(
                                        "flex-1 flex items-center gap-2 p-2 rounded-lg border text-xs transition-colors",
                                        !decisions[idx]
                                            ? "bg-amber-500/10 border-amber-500/50 text-amber-400"
                                            : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600"
                                    )}
                                >
                                    <div className={clsx(
                                        "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                                        !decisions[idx] ? "border-amber-500" : "border-gray-600"
                                    )}>
                                        {!decisions[idx] && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                                    </div>
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>Ephemeral</span>
                                </button>

                                <button
                                    onClick={() => handleToggle(idx, true)}
                                    className={clsx(
                                        "flex-1 flex items-center gap-2 p-2 rounded-lg border text-xs transition-colors",
                                        decisions[idx]
                                            ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400"
                                            : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600"
                                    )}
                                >
                                    <div className={clsx(
                                        "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                                        decisions[idx] ? "border-emerald-500" : "border-gray-600"
                                    )}>
                                        {decisions[idx] && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                                    </div>
                                    <Database className="w-3.5 h-3.5" />
                                    <span>Persistent</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-4 border-t border-gray-800 flex gap-3">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium text-gray-300 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium text-white transition-colors"
                    >
                        Attach {pendingFiles.length} File{pendingFiles.length !== 1 ? 's' : ''}
                    </button>
                </div>
            </div>
        </div>
    )
}
