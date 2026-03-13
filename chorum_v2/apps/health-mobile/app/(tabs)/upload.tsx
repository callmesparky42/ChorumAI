import React, { useState } from 'react'
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Plus } from 'lucide-react-native'

import { BiometricGate } from '@/components/BiometricGate'
import { UploadSheet } from '@/components/UploadSheet'

interface RecentUpload {
  id: string
  documentType: string
  uploadedAt: Date
}

export default function UploadTab() {
  const [showSheet, setShowSheet] = useState(false)
  const [uploads, setUploads] = useState<RecentUpload[]>([])

  function handleUploaded(id: string, documentType: string) {
    setUploads((prev) => [{ id, documentType, uploadedAt: new Date() }, ...prev])
    setShowSheet(false)
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Text style={s.heading}>Upload</Text>
        <TouchableOpacity style={s.addButton} onPress={() => setShowSheet(true)}>
          <Plus size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {uploads.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No uploads yet</Text>
          <Text style={s.emptySubtitle}>
            Tap + to scan a lab result, ICD report, or other health document.
          </Text>
          <TouchableOpacity style={s.emptyButton} onPress={() => setShowSheet(true)}>
            <Text style={s.emptyButtonText}>Scan Document</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={uploads}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={s.uploadRow}>
              <Text style={s.uploadType}>{item.documentType.replace(/_/g, ' ')}</Text>
              <Text style={s.uploadDate}>{item.uploadedAt.toLocaleString()}</Text>
            </View>
          )}
        />
      )}

      {showSheet && (
        <BiometricGate
          prompt="Confirm identity to upload a health document"
          onDenied={() => setShowSheet(false)}
        >
          <UploadSheet
            onClose={() => setShowSheet(false)}
            onUploaded={handleUploaded}
          />
        </BiometricGate>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 8,
  },
  heading: {
    color: '#f9fafb',
    fontSize: 22,
    fontWeight: '700',
  },
  addButton: {
    backgroundColor: '#2563eb',
    padding: 8,
    borderRadius: 8,
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
  },
  emptySubtitle: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: 24,
    backgroundColor: '#2563eb',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  uploadRow: {
    backgroundColor: '#111827',
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
  },
  uploadType: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  uploadDate: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 4,
  },
})
