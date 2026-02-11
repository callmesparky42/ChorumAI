'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Download, Upload, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'

interface ProjectSummary {
    id: string
    name: string
}

interface ImportAnalyzeResult {
    success: boolean
    format: string
    domainSignal: {
        primary: string
        domains: { domain: string; confidence: number; evidence: number }[]
        conversationsAnalyzed: number
        computedAt: string
    }
    stats: {
        conversationsProcessed: number
        conversationsSkipped: number
        learningsStored: number
        duplicatesFound: number
        learningsMerged: number
        errors: string[]
    }
    parseWarnings: string[]
}

export default function MigratePage() {
    const [projects, setProjects] = useState<ProjectSummary[]>([])
    const [projectId, setProjectId] = useState<string>('')
    const [rawData, setRawData] = useState<Record<string, unknown> | null>(null)
    const [fileName, setFileName] = useState<string | null>(null)
    const [storeConversations, setStoreConversations] = useState(false)
    const [maxConversations, setMaxConversations] = useState<string>('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<ImportAnalyzeResult | null>(null)
    const [parseWarnings, setParseWarnings] = useState<string[]>([])
    const fileInputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const res = await fetch('/api/projects')
                if (res.ok) {
                    const data = await res.json()
                    setProjects(data)
                    if (data.length > 0) {
                        setProjectId(data[0].id)
                    }
                }
            } catch (e) {
                console.error('Failed to load projects:', e)
            }
        }
        fetchProjects()
    }, [])

    const dropZoneLabel = useMemo(() => {
        if (fileName) return `Loaded: ${fileName}`
        return 'Drop your export JSON here or click to browse'
    }, [fileName])

    const resetResult = () => {
        setResult(null)
        setParseWarnings([])
        setError(null)
    }

    const handleFile = async (file: File) => {
        resetResult()
        try {
            const text = await file.text()
            const parsed = JSON.parse(text)
            setRawData(parsed)
            setFileName(file.name)
        } catch (e) {
            setRawData(null)
            setFileName(null)
            setError('Could not parse JSON. Please provide a valid export file.')
        }
    }

    const handleBrowse = () => fileInputRef.current?.click()

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault()
        if (!event.dataTransfer.files?.length) return
        const file = event.dataTransfer.files[0]
        if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
            setError('Only JSON export files are supported.')
            return
        }
        handleFile(file)
    }

    const handleAnalyze = async () => {
        if (!projectId) {
            setError('Select a target project before analyzing.')
            return
        }
        if (!rawData) {
            setError('Upload an export file first.')
            return
        }

        setLoading(true)
        setError(null)
        setResult(null)

        try {
            const res = await fetch('/api/import/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectId,
                    data: rawData,
                    storeConversations,
                    maxConversations: maxConversations ? Number(maxConversations) : undefined
                })
            })

            const payload = await res.json()
            if (!res.ok) {
                throw new Error(payload.error || 'Import failed')
            }

            setResult(payload)
            setParseWarnings(payload.parseWarnings || [])
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Import failed')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#0f1218] text-white p-6 md:p-10">
            <div className="max-w-4xl mx-auto space-y-10">
                <header className="space-y-3">
                    <h1 className="text-3xl md:text-4xl font-semibold text-[#E6EDF6]">Import Your AI History</h1>
                    <p className="text-[#9AA6BA] text-base md:text-lg">
                        Bring conversations from ChatGPT, Claude Desktop, Perplexity, or any JSON with messages.
                        Chorum will infer the domain and extract learnings that matter.
                    </p>
                </header>

                <section className="grid md:grid-cols-[1.2fr_0.8fr] gap-6">
                    <div className="space-y-4">
                        <div
                            onDrop={handleDrop}
                            onDragOver={(event) => event.preventDefault()}
                            onClick={handleBrowse}
                            className={clsx(
                                'border border-dashed rounded-2xl p-8 cursor-pointer transition-colors',
                                rawData ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-[#2D3645] bg-[#141A24] hover:border-[#3C485C]'
                            )}
                        >
                            <div className="flex flex-col items-center gap-3 text-center">
                                <Upload className="w-8 h-8 text-[#6FA2ED]" />
                                <div>
                                    <p className="text-sm md:text-base text-[#DCE5F3] font-medium">
                                        {dropZoneLabel}
                                    </p>
                                    <p className="text-xs text-[#7E8CA5] mt-1">Supported: .json exports</p>
                                </div>
                            </div>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="application/json,.json"
                            className="hidden"
                            onChange={(event) => {
                                const file = event.target.files?.[0]
                                if (file) handleFile(file)
                            }}
                        />

                        <div className="space-y-3 bg-[#141A24] border border-[#2D3645] rounded-xl p-5">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-[#9AA6BA]">Target project</span>
                                <select
                                    value={projectId}
                                    onChange={(event) => setProjectId(event.target.value)}
                                    className="bg-[#0f1218] border border-[#2D3645] rounded-lg px-3 py-2 text-sm text-white min-w-[180px]"
                                >
                                    {projects.map(project => (
                                        <option key={project.id} value={project.id}>
                                            {project.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <label className="flex items-center gap-2 text-sm text-[#9AA6BA]">
                                <input
                                    type="checkbox"
                                    checked={storeConversations}
                                    onChange={(event) => setStoreConversations(event.target.checked)}
                                    className="h-4 w-4 rounded border-[#2D3645] bg-[#0f1218] text-blue-500"
                                />
                                Also import conversation history
                            </label>
                            <div className="flex items-center justify-between text-sm text-[#9AA6BA]">
                                <span>Max conversations (optional)</span>
                                <input
                                    type="number"
                                    min="1"
                                    placeholder="All"
                                    value={maxConversations}
                                    onChange={(event) => setMaxConversations(event.target.value)}
                                    className="bg-[#0f1218] border border-[#2D3645] rounded-lg px-3 py-1.5 text-sm text-white w-28"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleAnalyze}
                            disabled={loading || !rawData}
                            className="w-full flex items-center justify-center gap-2 bg-[#2E5CF6] hover:bg-[#3C6CFF] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl px-4 py-3 text-sm font-medium transition-colors"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Analyze & Import
                        </button>

                        {error && (
                            <div className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                                <AlertTriangle className="w-4 h-4 mt-0.5" />
                                <span>{error}</span>
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="bg-[#141A24] border border-[#2D3645] rounded-2xl p-6 space-y-4">
                            <h2 className="text-lg font-semibold text-[#E6EDF6]">Results</h2>
                            {loading && (
                                <div className="text-sm text-[#9AA6BA] flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Running analysis. This can take a few minutes for large exports.
                                </div>
                            )}
                            {!loading && !result && (
                                <p className="text-sm text-[#7E8CA5]">
                                    Upload a file to see inferred domain and extraction stats.
                                </p>
                            )}
                            {result && (
                                <div className="space-y-3 text-sm text-[#9AA6BA]">
                                    <div className="flex items-center gap-2 text-emerald-300">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Import complete ({result.format})
                                    </div>
                                    <div>
                                        Domain inferred: <span className="text-white">{result.domainSignal.primary}</span>
                                        {result.domainSignal.domains?.length > 1 && (
                                            <span className="text-[#7E8CA5]">
                                                {' '}({result.domainSignal.domains.slice(0, 3).map(d => `${d.domain} ${d.confidence.toFixed(2)}`).join(', ')})
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs text-[#7E8CA5]">
                                        <div>{result.stats.conversationsProcessed} conversations processed</div>
                                        <div>{result.stats.learningsStored} learnings stored</div>
                                        <div>{result.stats.duplicatesFound} duplicates skipped</div>
                                        <div>{result.stats.learningsMerged} merged</div>
                                    </div>
                                    {result.stats.errors.length > 0 && (
                                        <div className="text-xs text-red-300">
                                            {result.stats.errors.length} errors encountered (see logs)
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {parseWarnings.length > 0 && (
                            <div className="bg-[#1B1F2B] border border-[#3D4759] rounded-xl p-4 text-sm text-[#C9D4E5] space-y-2">
                                <h3 className="font-medium">Parse warnings</h3>
                                <ul className="list-disc list-inside text-xs text-[#9AA6BA] space-y-1">
                                    {parseWarnings.map((warning, index) => (
                                        <li key={`${warning}-${index}`}>{warning}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </section>

                <div className="flex items-center justify-between text-xs text-[#7E8CA5]">
                    <span>Need help? Use a JSON export from your provider settings.</span>
                    <Link href="/app" className="text-[#6FA2ED] hover:text-white transition-colors">
                        Back to Chat
                    </Link>
                </div>
            </div>
        </div>
    )
}
