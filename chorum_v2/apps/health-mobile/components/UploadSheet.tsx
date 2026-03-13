import React, { useCallback, useRef, useState } from 'react'
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet'
import { Camera, FileText, Heart } from 'lucide-react-native'

import { CameraOCR } from '@/components/CameraOCR'

interface UploadSheetProps {
  onClose: () => void
  onUploaded: (id: string, documentType: string) => void
}

export function UploadSheet({ onClose, onUploaded }: UploadSheetProps) {
  const sheetRef = useRef<BottomSheet>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [launchLibrary, setLaunchLibrary] = useState(false)

  const handleCameraComplete = useCallback((result: { id: string; documentType: string }) => {
    setShowCamera(false)
    setLaunchLibrary(false)
    onUploaded(result.id, result.documentType)
  }, [onUploaded])

  if (showCamera) {
    return (
      <Modal animationType="slide" presentationStyle="fullScreen">
        <CameraOCR
          autoLaunchLibrary={launchLibrary}
          onComplete={handleCameraComplete}
          onCancel={() => {
            setShowCamera(false)
            setLaunchLibrary(false)
          }}
        />
      </Modal>
    )
  }

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={['40%']}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={s.sheetBackground}
      handleIndicatorStyle={s.handleIndicator}
    >
      <BottomSheetView style={s.content}>
        <Text style={s.title}>Add Health Document</Text>

        <TouchableOpacity
          style={s.option}
          onPress={() => {
            setLaunchLibrary(false)
            setShowCamera(true)
          }}
        >
          <Camera size={24} color="#60a5fa" />
          <View style={s.optionText}>
            <Text style={s.optionTitle}>Scan Document</Text>
            <Text style={s.optionSubtitle}>Camera OCR for labs and reports</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.option}
          onPress={() => {
            setLaunchLibrary(true)
            setShowCamera(true)
          }}
        >
          <FileText size={24} color="#a78bfa" />
          <View style={s.optionText}>
            <Text style={s.optionTitle}>Choose File</Text>
            <Text style={s.optionSubtitle}>Use an image from your library</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.option}
          onPress={onClose}
        >
          <Heart size={24} color="#34d399" />
          <View style={s.optionText}>
            <Text style={s.optionTitle}>Manual Entry</Text>
            <Text style={s.optionSubtitle}>Vitals form arrives in Phase 6</Text>
          </View>
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheet>
  )
}

const s = StyleSheet.create({
  sheetBackground: {
    backgroundColor: '#111827',
  },
  handleIndicator: {
    backgroundColor: '#374151',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    color: '#e5e7eb',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 20,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  optionText: {
    marginLeft: 14,
  },
  optionTitle: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '600',
  },
  optionSubtitle: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 2,
  },
})
