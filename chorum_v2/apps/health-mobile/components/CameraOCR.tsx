import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'

import { healthApi } from '@/lib/api'

interface CameraOCRProps {
  onComplete: (result: { id: string; documentType: string; confidence: 'high' | 'medium' | 'low' }) => void
  onCancel: () => void
  autoLaunchLibrary?: boolean
}

type Stage = 'preview' | 'uploading' | 'processing' | 'error'

export function CameraOCR({ onComplete, onCancel, autoLaunchLibrary = false }: CameraOCRProps) {
  const cameraRef = useRef<CameraView>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const [stage, setStage] = useState<Stage>('preview')
  const [error, setError] = useState<string | null>(null)
  const [libraryLaunched, setLibraryLaunched] = useState(false)

  async function uploadAndProcess(uri: string, filename: string, contentType: 'image/jpeg' | 'image/png') {
    try {
      setError(null)
      setStage('uploading')

      const fileResponse = await fetch(uri)
      const blob = await fileResponse.blob()
      const fileSizeBytes = typeof blob.size === 'number' && blob.size > 0 ? blob.size : 5 * 1024 * 1024

      const presign = await healthApi.presignUpload({
        filename,
        contentType,
        fileSizeBytes,
      })

      const uploadResponse = await fetch(presign.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob,
      })
      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with status ${uploadResponse.status}`)
      }

      const confirm = await healthApi.confirmUpload({
        storageKey: presign.storageKey,
        type: 'ocr_document',
        recordedAt: new Date().toISOString(),
        source: 'ocr',
      })

      setStage('processing')
      const ocr = await healthApi.triggerOCR({
        storageKey: presign.storageKey,
        snapshotId: confirm.snapshotId,
      })

      onComplete({
        id: ocr.id,
        documentType: ocr.documentType,
        confidence: ocr.confidence,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed')
      setStage('error')
    }
  }

  async function takePhoto() {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.85 })
    if (!photo) return
    await uploadAndProcess(photo.uri, `capture_${Date.now()}.jpg`, 'image/jpeg')
  }

  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    })
    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    const filename = asset.fileName ?? asset.uri.split('/').pop() ?? `pick_${Date.now()}.jpg`
    const mimeType = asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
    await uploadAndProcess(asset.uri, filename, mimeType)
  }

  useEffect(() => {
    if (!autoLaunchLibrary || libraryLaunched) return
    if (!permission?.granted) return
    setLibraryLaunched(true)
    void pickFromLibrary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLaunchLibrary, libraryLaunched, permission?.granted])

  if (!permission) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#60a5fa" />
      </View>
    )
  }

  if (!permission.granted) {
    return (
      <View style={s.center}>
        <Text style={s.text}>Camera permission required</Text>
        <TouchableOpacity style={s.primaryButton} onPress={requestPermission}>
          <Text style={s.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.secondaryButton} onPress={pickFromLibrary}>
          <Text style={s.buttonText}>Choose from Library</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel}>
          <Text style={[s.text, { marginTop: 12 }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (stage === 'uploading' || stage === 'processing') {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#60a5fa" />
        <Text style={[s.text, { marginTop: 16 }]}>
          {stage === 'uploading' ? 'Uploading...' : 'Extracting data...'}
        </Text>
      </View>
    )
  }

  if (stage === 'error') {
    return (
      <View style={s.center}>
        <Text style={[s.text, { color: '#f87171', textAlign: 'center' }]}>
          {error ?? 'Unknown error'}
        </Text>
        <TouchableOpacity style={s.primaryButton} onPress={() => setStage('preview')}>
          <Text style={s.buttonText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel}>
          <Text style={[s.text, { marginTop: 12 }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
      <View style={s.controls}>
        <TouchableOpacity style={s.secondaryButton} onPress={onCancel}>
          <Text style={s.buttonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.captureButton} onPress={takePhoto} />
        <TouchableOpacity style={s.secondaryButton} onPress={pickFromLibrary}>
          <Text style={s.buttonText}>Library</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
    padding: 24,
  },
  text: {
    color: '#e5e7eb',
    fontSize: 15,
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  secondaryButton: {
    marginTop: 8,
    backgroundColor: '#1f2937',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  captureButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: '#60a5fa',
  },
})
