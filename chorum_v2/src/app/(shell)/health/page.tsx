import { getHealthDashboardData, getSnapshotPage } from '@/lib/shell/health-actions'
import { HealthPageClient } from '@/components/shell/health/HealthPageClient'
import { VitalsStrip } from '@/components/shell/health/VitalsStrip'
import { SnapshotTimeline } from '@/components/shell/health/SnapshotTimeline'

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: rawPage = '1' } = await searchParams
  const page = Math.max(1, Number.parseInt(rawPage, 10) || 1)
  const offset = (page - 1) * 20

  const dashboardData = await getHealthDashboardData()
  const paginated = page > 1
    ? await getSnapshotPage(offset, 20)
    : { snapshots: dashboardData.recentSnapshots, total: dashboardData.totalSnapshots }

  const dataForPage = {
    ...dashboardData,
    recentSnapshots: paginated.snapshots,
    totalSnapshots: paginated.total,
  }

  return (
    <HealthPageClient
      dashboardData={dataForPage}
      vitalsStrip={<VitalsStrip vitals={dashboardData.vitals} />}
      snapshotTimeline={
        <SnapshotTimeline
          snapshots={paginated.snapshots}
          total={paginated.total}
          currentPage={page}
        />
      }
    />
  )
}
