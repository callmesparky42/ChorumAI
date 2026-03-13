'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { HealthDashboardData } from '@chorum/health-types'
import { UploadZone } from './UploadZone'
import { HealthCharts } from './HealthCharts'

export function HealthPageClient({
  dashboardData,
  vitalsStrip,
  snapshotTimeline,
}: {
  dashboardData: HealthDashboardData
  vitalsStrip: ReactNode
  snapshotTimeline: ReactNode
}) {
  const [showUpload, setShowUpload] = useState(false)
  const router = useRouter()

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-4 border-b border-[var(--hg-border)] flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-sm font-medium text-[var(--hg-text-primary)]">Health</h1>
          {dashboardData.vitals.lastSnapshotAt && (
            <p className="text-xs text-[var(--hg-text-tertiary)] mt-0.5">
              last snapshot: {new Date(dashboardData.vitals.lastSnapshotAt).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/chat" className="hg-btn text-xs">
            Ask Health Monitor
          </Link>
          <button
            type="button"
            onClick={() => setShowUpload((prev) => !prev)}
            className="hg-btn hg-btn-accent text-xs"
          >
            {showUpload ? 'Cancel upload' : 'Upload'}
          </button>
        </div>
      </div>

      {showUpload && (
        <div className="px-6 py-4 border-b border-[var(--hg-border)]">
          <UploadZone
            onUploaded={() => {
              setShowUpload(false)
              router.refresh()
            }}
          />
        </div>
      )}

      <div className="px-6 py-4 border-b border-[var(--hg-border)]">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-3">
          Latest
        </p>
        {vitalsStrip}
      </div>

      <div className="px-6 py-4 border-b border-[var(--hg-border)]">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-3">
          Last 14 Days
        </p>
        <HealthCharts
          hrChart={dashboardData.hrChart}
          hrvChart={dashboardData.hrvChart}
          sleepChart={dashboardData.sleepChart}
          stepsChart={dashboardData.stepsChart}
        />
      </div>

      <div className="px-6 py-4">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)] mb-3">
          Snapshots ({dashboardData.totalSnapshots} total)
        </p>
        {snapshotTimeline}
      </div>
    </div>
  )
}
