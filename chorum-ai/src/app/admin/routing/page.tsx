
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface RoutingLog {
    id: string
    projectId: string
    projectName: string | null
    taskType: string | null
    selectedProvider: string
    reasoning: string | null
    alternatives: { provider: string; cost: number }[] | null
    userOverride: boolean
    createdAt: string
}

export default function RoutingDebugPage() {
    const [logs, setLogs] = useState<RoutingLog[]>([])
    const [loading, setLoading] = useState(true)

    const fetchLogs = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/router-logs')
            if (res.ok) {
                const data = await res.json()
                setLogs(data)
            }
        } catch (e) {
            console.error('Failed to fetch logs', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchLogs()
    }, [])

    return (
        <div className="container mx-auto p-6 max-w-7xl">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        Routing Intelligence
                    </h1>
                    <p className="text-gray-400">Real-time visibility into model selection decisions</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={fetchLogs}
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm"
                    >
                        Refresh
                    </button>
                    <Link
                        href="/"
                        className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm"
                    >
                        Back to Chat
                    </Link>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-500">Loading decisions...</div>
            ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-950 text-gray-400 font-medium">
                                <tr>
                                    <th className="px-6 py-4">Time</th>
                                    <th className="px-6 py-4">Project</th>
                                    <th className="px-6 py-4">Decision</th>
                                    <th className="px-6 py-4">Reasoning</th>
                                    <th className="px-6 py-4 text-right">Cost Savings</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {logs.map((log) => {
                                    const selectedCost = log.alternatives?.find(a => a.provider === log.selectedProvider)?.cost || 0
                                    const maxCost = Math.max(...(log.alternatives?.map(a => a.cost) || [0]), selectedCost)
                                    const savings = maxCost > 0 ? ((maxCost - selectedCost) / maxCost) * 100 : 0

                                    return (
                                        <tr key={log.id} className="hover:bg-gray-800/50 transition-colors">
                                            <td className="px-6 py-4 text-gray-400 font-mono text-xs">
                                                {new Date(log.createdAt).toLocaleTimeString()}
                                            </td>
                                            <td className="px-6 py-4 text-gray-300">
                                                {log.projectName || 'Unknown Project'}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium w-fit
                                                        ${log.userOverride ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                                                            'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                                                        {log.selectedProvider}
                                                        {log.userOverride && ' (Override)'}
                                                    </span>
                                                    {log.alternatives && log.alternatives.length > 0 && (
                                                        <span className="text-xs text-gray-500">
                                                            vs {log.alternatives.filter(a => a.provider !== log.selectedProvider).map(a => a.provider).join(', ')}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-400 max-w-md">
                                                {log.reasoning}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-xs">
                                                {savings > 0 ? (
                                                    <span className="text-green-400">
                                                        {savings.toFixed(1)}%
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-600">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
