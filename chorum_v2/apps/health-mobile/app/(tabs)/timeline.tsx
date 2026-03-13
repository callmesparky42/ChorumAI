import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { HealthSnapshotWithPayload } from '@chorum/health-types'

import { TiffViewer } from '@/components/TiffViewer'
import { healthApi } from '@/lib/api'

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    garmin_daily: 'Garmin Daily',
    garmin_hrv: 'HRV',
    labs: 'Lab Result',
    icd_report: 'ICD Report',
    vitals: 'Vitals',
    mychart: 'MyChart',
    checkup_result: 'Weekly Checkup',
    ocr_document: 'Document',
  }
  return labels[type] ?? type
}

function getIcdPages(snapshot: HealthSnapshotWithPayload): string[] {
  const payload = snapshot.payload as Record<string, unknown>

  const fromPayload = Array.isArray(payload.storagePages)
    ? payload.storagePages
    : Array.isArray(payload.pngPages)
      ? payload.pngPages
      : []

  const payloadPages = fromPayload.filter((item): item is string => typeof item === 'string')
  if (payloadPages.length > 0) return payloadPages

  if (!snapshot.storagePath) return []
  try {
    const parsed = JSON.parse(snapshot.storagePath) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

export default function TimelineTab() {
  const [snapshots, setSnapshots] = useState<HealthSnapshotWithPayload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIcdPages, setSelectedIcdPages] = useState<string[] | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await healthApi.getSnapshots({ limit: 100 })
      setSnapshots(data.snapshots)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.heading}>Timeline</Text>
        <TouchableOpacity onPress={load}>
          <Text style={s.refresh}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#60a5fa" />
      ) : error ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>Could not load snapshots</Text>
          <Text style={s.emptySubtitle}>{error}</Text>
        </View>
      ) : snapshots.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No timeline entries yet</Text>
          <Text style={s.emptySubtitle}>Upload a document or sync Garmin to start your timeline.</Text>
        </View>
      ) : (
        <FlatList
          data={snapshots}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => {
            const icdPages = item.type === 'icd_report' ? getIcdPages(item) : []
            return (
              <TouchableOpacity
                style={s.row}
                activeOpacity={item.type === 'icd_report' ? 0.7 : 1}
                onPress={() => {
                  if (item.type === 'icd_report') setSelectedIcdPages(icdPages)
                }}
              >
                <View style={s.rowLeft}>
                  <Text style={s.rowType}>{typeLabel(item.type)}</Text>
                  <Text style={s.rowDate}>{new Date(item.recordedAt).toLocaleDateString()}</Text>
                </View>
                <View style={s.rowRight}>
                  <Text style={s.rowSource}>{item.source}</Text>
                  {item.type === 'icd_report' && (
                    <Text style={s.rowTap}>
                      {icdPages.length > 0 ? 'View pages ->' : 'No pages'}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}

      {selectedIcdPages !== null && (
        <Modal animationType="slide">
          <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
            <TouchableOpacity style={s.closeButton} onPress={() => setSelectedIcdPages(null)}>
              <Text style={s.closeButtonText}>Close</Text>
            </TouchableOpacity>
            <TiffViewer pngPaths={selectedIcdPages} title="ICD Report Pages" />
          </View>
        </Modal>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heading: {
    color: '#f9fafb',
    fontSize: 22,
    fontWeight: '700',
  },
  refresh: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: '600',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    color: '#e5e7eb',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
  },
  row: {
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowLeft: {
    flex: 1,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowType: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
  },
  rowDate: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 2,
  },
  rowSource: {
    color: '#4b5563',
    fontSize: 12,
  },
  rowTap: {
    color: '#60a5fa',
    fontSize: 12,
    marginTop: 4,
  },
  closeButton: {
    padding: 20,
  },
  closeButtonText: {
    color: '#60a5fa',
    fontSize: 15,
  },
})
