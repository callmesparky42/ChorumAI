import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import type { TrendResult } from '@chorum/health-types'

import { HealthCharts } from '@/components/HealthCharts'
import { VitalsCards } from '@/components/VitalsCards'
import { healthApi } from '@/lib/api'
import { requestHealthPermissions, syncHealthConnectToChorum } from '@/lib/health-connect'

interface DashboardData {
  hrTrend: TrendResult | null
  sleepTrend: TrendResult | null
  stepsTrend: TrendResult | null
}

export default function DashboardScreen() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setError(null)
    try {
      const [hrTrend, sleepTrend, stepsTrend] = await Promise.allSettled([
        healthApi.getTrends('hr', 14),
        healthApi.getTrends('sleep', 14),
        healthApi.getTrends('steps', 14),
      ])

      setData({
        hrTrend: hrTrend.status === 'fulfilled' ? hrTrend.value : null,
        sleepTrend: sleepTrend.status === 'fulfilled' ? sleepTrend.value : null,
        stepsTrend: stepsTrend.status === 'fulfilled' ? stepsTrend.value : null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    void loadData()
  }, [loadData])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      const granted = await requestHealthPermissions()
      if (!granted) {
        Alert.alert(
          'Permissions Required',
          'Grant Health Connect access to sync your health data. Go to Settings -> Health Connect -> App permissions.',
          [{ text: 'OK' }],
        )
        return
      }

      const result = await syncHealthConnectToChorum(7)
      Alert.alert(
        'Sync Complete',
        `${result.synced} new records synced. ${result.skipped} already up to date.`,
        [{ text: 'OK', onPress: () => { void loadData() } }],
      )
    } catch (err) {
      Alert.alert('Sync Failed', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSyncing(false)
    }
  }, [loadData])

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#e0c060" size="large" />
      </View>
    )
  }

  const latestHR = data?.hrTrend?.points?.at(-1)?.value ?? null
  const latestSleep = data?.sleepTrend?.points?.at(-1)?.value ?? null
  const latestSteps = data?.stepsTrend?.points?.at(-1)?.value ?? null

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#e0c060"
        />
      }
    >
      <View style={styles.topBar}>
        <Text style={styles.title}>Health</Text>
        <TouchableOpacity style={styles.syncButton} onPress={handleSync} disabled={syncing}>
          {syncing ? (
            <ActivityIndicator size="small" color="#0a0a0a" />
          ) : (
            <Text style={styles.syncText}>Sync</Text>
          )}
        </TouchableOpacity>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <VitalsCards
        heartRate={latestHR}
        hrv={null}
        sleepMinutes={latestSleep}
        steps={latestSteps}
      />

      {data && (
        <HealthCharts
          hrTrend={data.hrTrend}
          sleepTrend={data.sleepTrend}
          stepsTrend={data.stepsTrend}
        />
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#ffffff', letterSpacing: -0.5 },
  syncButton: { backgroundColor: '#e0c060', paddingHorizontal: 16, paddingVertical: 8 },
  syncText: { color: '#0a0a0a', fontWeight: '700', fontSize: 14 },
  errorBanner: { backgroundColor: '#2a1a1a', margin: 16, padding: 12 },
  errorText: { color: '#ff6666', fontSize: 13 },
})
