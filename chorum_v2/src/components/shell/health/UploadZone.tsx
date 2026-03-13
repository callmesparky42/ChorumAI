'use client'

import { useMemo, useRef, useState } from 'react'
import type { HealthSnapshotType } from '@chorum/health-types'
import { confirmHealthUpload, presignHealthUpload } from '@/lib/shell/health-actions'

type UploadState = 'idle' | 'selected' | 'uploading' | 'confirming' | 'done' | 'error'

const MAX_BYTES = 52_428_800

const typeOptions: Array<{ value: HealthSnapshotType; label: string }> = [
  { value: 'garmin_daily', label: 'Garmin Daily Activity' },
  { value: 'garmin_hrv', label: 'Garmin HRV' },
  { value: 'labs', label: 'Lab Result' },
  { value: 'icd_report', label: 'ICD Device Report' },
  { value: 'vitals', label: 'Vital Signs' },
  { value: 'mychart', label: 'MyChart Document' },
  { value: 'ocr_document', label: 'Scanned Document' },
]

function inferTypeFromExtension(filename: string): HealthSnapshotType | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.tiff') || lower.endsWith('.tif')) return 'icd_report'
  if (lower.endsWith('.pdf') || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'mychart'
  if (lower.endsWith('.csv')) return 'labs'
  if (lower.endsWith('.fit')) return 'garmin_daily'
  return null
}

function guessContentType(file: File): string {
  if (file.type) return file.type
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.tiff') || lower.endsWith('.tif')) return 'image/tiff'
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.csv')) return 'text/csv'
  if (lower.endsWith('.fit')) return 'application/octet-stream'
  return 'application/octet-stream'
}

function uploadFileWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', guessContentType(file))
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const pct = Math.round((event.loaded / event.total) * 100)
        onProgress(pct)
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`upload_status_${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error('upload_network_error'))
    xhr.send(file)
  })
}

export function UploadZone({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [selectedType, setSelectedType] = useState<HealthSnapshotType>('mychart')
  const [recordedDate, setRecordedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const accepted = useMemo(
    () => '.tiff,.tif,.pdf,.png,.jpg,.jpeg,.csv,.fit',
    [],
  )

  function reset() {
    setState('idle')
    setDragOver(false)
    setFile(null)
    setProgress(0)
    setError(null)
  }

  function applyFile(next: File) {
    setError(null)
    if (next.size > MAX_BYTES) {
      setState('error')
      setError('File exceeds 50 MB limit')
      return
    }

    const inferred = inferTypeFromExtension(next.name)
    if (!inferred) {
      setState('error')
      setError('Unsupported file type')
      return
    }

    setFile(next)
    setSelectedType(inferred)
    setState('selected')
  }

  async function handleUpload() {
    if (!file) return

    try {
      setError(null)
      setState('uploading')
      setProgress(0)

      const contentType = guessContentType(file)
      const presigned = await presignHealthUpload(file.name, contentType, file.size)

      await uploadFileWithProgress(presigned.uploadUrl, file, setProgress)

      setState('confirming')
      await confirmHealthUpload(
        presigned.storageKey,
        selectedType,
        `${recordedDate}T00:00:00.000Z`,
        'file_upload',
        { filename: file.name, contentType, fileSizeBytes: file.size },
      )

      setState('done')
      onUploaded()
      reset()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown_error'
      setState('error')
      if (message.includes('unsupported_type')) setError('Unsupported file type')
      else if (message.includes('file_too_large')) setError('File exceeds 50 MB limit')
      else if (state === 'uploading') setError('Upload failed — check your connection')
      else if (state === 'confirming') setError('File uploaded but could not be saved — contact support')
      else setError('Upload setup failed — try again')
    }
  }

  return (
    <div className="border border-[var(--hg-border)] bg-[var(--hg-surface)]">
      <div className="px-4 py-3 border-b border-[var(--hg-border)] flex items-center justify-between">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--hg-text-tertiary)]">Upload</p>
        <button type="button" className="hg-btn text-xs" onClick={reset}>×</button>
      </div>

      <div className="p-4">
        <button
          type="button"
          className="w-full border border-dashed px-4 py-8 text-left transition-colors"
          style={{
            borderColor: dragOver ? 'var(--hg-accent)' : 'var(--hg-border-subtle)',
            background: dragOver ? 'var(--hg-accent-muted)' : 'transparent',
          }}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragOver(false)
            const dropped = event.dataTransfer.files?.[0]
            if (dropped) applyFile(dropped)
          }}
        >
          <p className="text-sm text-[var(--hg-text-primary)]">Drop a file here or click to browse</p>
          <p className="text-xs text-[var(--hg-text-tertiary)] mt-1">PDF · TIFF · PNG · JPG · CSV · FIT · max 50 MB</p>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept={accepted}
          className="hidden"
          onChange={(event) => {
            const next = event.target.files?.[0]
            if (next) applyFile(next)
          }}
        />

        {file && (
          <div className="mt-4 border border-[var(--hg-border)] p-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end">
              <div>
                <p className="text-xs text-[var(--hg-text-secondary)]">File</p>
                <p className="text-sm text-[var(--hg-text-primary)] truncate">{file.name}</p>
              </div>

              <label className="text-xs text-[var(--hg-text-secondary)] flex flex-col gap-1">
                Type
                <select
                  value={selectedType}
                  onChange={(event) => setSelectedType(event.target.value as HealthSnapshotType)}
                  className="bg-[var(--hg-bg)] border border-[var(--hg-border)] px-2 py-1 text-xs text-[var(--hg-text-primary)]"
                >
                  {typeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="text-xs text-[var(--hg-text-secondary)] flex flex-col gap-1">
                Date
                <input
                  type="date"
                  value={recordedDate}
                  onChange={(event) => setRecordedDate(event.target.value)}
                  className="bg-[var(--hg-bg)] border border-[var(--hg-border)] px-2 py-1 text-xs text-[var(--hg-text-primary)]"
                />
              </label>
            </div>

            {(state === 'uploading' || state === 'confirming') && (
              <div className="mt-3">
                <div className="h-2 border border-[var(--hg-border)] bg-[var(--hg-bg)]">
                  <div
                    className="h-full bg-[var(--hg-accent)] transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--hg-text-tertiary)] mt-1">
                  {state === 'uploading' ? `${progress}%` : 'Saving snapshot...'}
                </p>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs text-[var(--hg-destructive)]">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="hg-btn text-xs"
            onClick={reset}
            disabled={state === 'uploading' || state === 'confirming'}
          >
            Cancel
          </button>
          <button
            type="button"
            className="hg-btn hg-btn-accent text-xs"
            onClick={handleUpload}
            disabled={!file || state === 'uploading' || state === 'confirming'}
          >
            Upload
          </button>
        </div>
      </div>
    </div>
  )
}
