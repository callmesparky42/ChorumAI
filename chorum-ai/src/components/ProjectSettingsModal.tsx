'use client'

import { useState } from 'react'
import { X, Download, Loader2, FileJson, Archive } from 'lucide-react'
import clsx from 'clsx'

interface Project {
    id: string
    name: string
    description?: string
}

interface Props {
    project: Project
    onClose: () => void
}

export function ProjectSettingsModal({ project, onClose }: Props) {
    const [isExporting, setIsExporting] = useState(false)
    const [includeConversations, setIncludeConversations] = useState(false)
    const [includeAgents, setIncludeAgents] = useState(true)

    const handleExport = async () => {
        setIsExporting(true)
        try {
            const res = await fetch('/api/export/project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId: project.id,
                    options: {
                        includeConversations,
                        includeAgents
                    }
                })
            })

            if (!res.ok) throw new Error('Export failed')

            // Trigger download
            const blob = await res.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url

            // Get filename from header or default
            const contentDisposition = res.headers.get('Content-Disposition')
            let filename = `chorum_export_${project.id.slice(0, 8)}.json`
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/)
                if (match) filename = match[1]
            }

            a.download = filename
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)

            // Close after success? Or stay open?
            // Usually stay open in case they want to change options
        } catch (error) {
            console.error('Export error:', error)
            alert('Failed to export project')
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-gray-800 flex items-center justify-between bg-gray-950">
                    <h3 className="font-medium text-white">Project Settings</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto">
                    <div>
                        <h4 className="text-sm font-medium text-gray-300 mb-2">{project.name}</h4>
                        <p className="text-xs text-gray-500">{project.description || 'No description'}</p>
                        <p className="text-xs text-gray-600 mt-1 font-mono">ID: {project.id}</p>
                    </div>

                    <div className="p-4 bg-gray-950 rounded-lg border border-gray-800 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/10 rounded-lg">
                                <Archive className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                                <h5 className="text-sm font-medium text-white">Export Project</h5>
                                <p className="text-xs text-gray-500">Download a portable backup of this project.</p>
                            </div>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-gray-800">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${includeConversations ? 'bg-blue-600 border-blue-600' : 'border-gray-600 group-hover:border-gray-500'}`}>
                                    {includeConversations && <div className="w-2 h-2 bg-white rounded-[1px]" />}
                                </div>
                                <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={includeConversations}
                                    onChange={e => setIncludeConversations(e.target.checked)}
                                />
                                <span className="text-xs text-gray-300">Include chat history (may contain PII)</span>
                            </label>

                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${includeAgents ? 'bg-blue-600 border-blue-600' : 'border-gray-600 group-hover:border-gray-500'}`}>
                                    {includeAgents && <div className="w-2 h-2 bg-white rounded-[1px]" />}
                                </div>
                                <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={includeAgents}
                                    onChange={e => setIncludeAgents(e.target.checked)}
                                />
                                <span className="text-xs text-gray-300">Include custom agents</span>
                            </label>
                        </div>

                        <button
                            onClick={handleExport}
                            disabled={isExporting}
                            className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium text-white transition-colors flex items-center justify-center gap-2"
                        >
                            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {isExporting ? 'Exporting...' : 'Download Export'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
