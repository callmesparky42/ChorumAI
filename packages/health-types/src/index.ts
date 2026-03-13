// @chorum/health-types
// Shared types for Chorum Health API/routes/apps.

// ---------------------------------------------------------------------------
// Snapshot types
// ---------------------------------------------------------------------------

export type HealthSnapshotType =
  | 'garmin_daily'
  | 'garmin_hrv'
  | 'labs'
  | 'icd_report'
  | 'vitals'
  | 'mychart'
  | 'checkup_result'
  | 'ocr_document'

export type HealthSnapshotSource =
  | 'garmin'
  | 'health_connect'
  | 'ocr'
  | 'manual'
  | 'mychart'
  | 'file_upload'
  | 'system'

export interface HealthSnapshot {
  id: string
  userId: string
  type: HealthSnapshotType
  recordedAt: string
  source: HealthSnapshotSource
  payloadHash: string
  storagePath: string | null
  createdAt: string
}

export interface HealthSnapshotWithPayload extends HealthSnapshot {
  payload: HealthPayload
}

// ---------------------------------------------------------------------------
// Payload shapes
// ---------------------------------------------------------------------------

// Implementation names are authoritative and align with Garmin field semantics.
export interface GarminDailyPayload {
  date: string
  heartRateAvgBpm: number | null
  heartRateRestingBpm: number | null
  heartRateMaxBpm: number | null
  stepsTotal: number | null
  distanceMeters: number | null
  activeCalories: number | null
  totalCalories: number | null
  sleepDurationMinutes: number | null
  sleepScore: number | null
  stressAvg: number | null
  bodyBatteryEnd: number | null
  // Backward-compatible aliases used by older clients.
  activeMinutes?: number | null
  calories?: number | null
  stressLevel?: number | null
}

export interface GarminHRVPayload {
  date: string
  hrvRmssdMs: number | null
  hrvStatus: string | null
  hrvWeeklyAvg?: number | null
  hrvLastNight?: number | null
}

export interface LabResultItem {
  name: string
  value: number
  unit: string
  refRangeLow: number | null
  refRangeHigh: number | null
  flag: 'H' | 'L' | 'HH' | 'LL' | null
}

export interface LabResultPayload {
  reportDate: string
  labName: string
  orderingPhysician: null
  results: LabResultItem[]
  // Backward-compatible alias used by existing trend extractors.
  values?: Array<{
    name: string
    value: number | null
    unit: string
    referenceMin?: number | null
    referenceMax?: number | null
    flag?: 'H' | 'L' | 'HH' | 'LL' | null
  }>
}

export interface ICDReportPayload {
  reportDate: string
  deviceModel: string
  batteryPct: number
  ertIndicator: boolean
  nsVtEpisodes: number
  svtEpisodes: number
  reviewerNotes: string
  storagePages: string[]
}

export interface VitalSignsPayload {
  recordedAt: string
  systolicBP: number | null
  diastolicBP: number | null
  heartRate: number | null
  o2Sat: number | null
  temperatureF: number | null
  weightLbs: number | null
  bloodGlucose: number | null
}

export interface OcrDocumentPayload {
  source: string
  rawText: string
  parsedFields: Record<string, string>
}

export interface CheckupResultPayload {
  periodStart?: string
  periodEnd?: string
  summary: string
  findings?: string[]
  recommendations?: string[]
}

export type HealthPayload =
  | GarminDailyPayload
  | GarminHRVPayload
  | LabResultPayload
  | ICDReportPayload
  | VitalSignsPayload
  | OcrDocumentPayload
  | CheckupResultPayload
  | Record<string, unknown>

// ---------------------------------------------------------------------------
// API contracts
// ---------------------------------------------------------------------------

export interface CreateSnapshotRequest {
  type: HealthSnapshotType
  recordedAt: string
  source: HealthSnapshotSource
  payload: HealthPayload
  storagePath?: string
}

export interface CreateSnapshotResponse {
  id: string
  created: boolean
}

export interface ListSnapshotsRequest {
  type?: HealthSnapshotType
  source?: HealthSnapshotSource
  fromDate?: string
  toDate?: string
  limit?: number
  offset?: number
}

export interface ListSnapshotsResponse {
  snapshots: HealthSnapshotWithPayload[]
  total: number
  failedCount?: number
}

export interface PresignUploadRequest {
  filename: string
  contentType: string
  fileSizeBytes: number
}

export interface PresignUploadResponse {
  uploadUrl: string
  storageKey: string
}

export interface ConfirmUploadRequest {
  storageKey: string
  type: HealthSnapshotType
  recordedAt: string
  source: HealthSnapshotSource
  metadata?: Record<string, unknown>
}

export interface ConfirmUploadResponse {
  snapshotId: string
  tiffPages?: string[]
  tiffError?: boolean
}

// ---------------------------------------------------------------------------
// Chart data interfaces
// ---------------------------------------------------------------------------

export interface HRChartPoint {
  date: string
  avgHR: number
  restingHR: number
  maxHR: number
}

export interface HRVChartPoint {
  date: string
  avgHRV: number
  sdnn: number | null
}

export interface SleepChartPoint {
  date: string
  deepMinutes: number
  remMinutes: number
  lightMinutes: number
  awakeMinutes: number
}

export interface StepsChartPoint {
  date: string
  steps: number
  goal: number
}

export interface LabValuePoint {
  date: string
  name: string
  value: number
  unit: string
  refLow: number | null
  refHigh: number | null
  flag: string | null
}

export interface ICDTimelinePoint {
  date: string
  nsVt: number
  svt: number
  batteryPct: number
}

// ---------------------------------------------------------------------------
// Dashboard types
// ---------------------------------------------------------------------------

export interface LatestVitalValue {
  value: number
  unit: string
  recordedAt: string
}

export interface LatestVitals {
  restingHR: LatestVitalValue | null
  avgHRV: LatestVitalValue | null
  steps: LatestVitalValue | null
  sleepScore: LatestVitalValue | null
  systolicBP: LatestVitalValue | null
  diastolicBP: LatestVitalValue | null
  lastSnapshotAt: string | null
}

export interface SnapshotSummary {
  id: string
  type: HealthSnapshotType
  source: HealthSnapshotSource
  recordedAt: string
  summary: string
  storagePath: string | null
  tiffPageUrls: string[] | null
  flagCount: number
}

export interface HealthDashboardData {
  vitals: LatestVitals
  hrChart: HRChartPoint[]
  hrvChart: HRVChartPoint[]
  sleepChart: SleepChartPoint[]
  stepsChart: StepsChartPoint[]
  recentSnapshots: SnapshotSummary[]
  totalSnapshots: number
}

// ---------------------------------------------------------------------------
// Existing trend contracts used by current endpoints
// ---------------------------------------------------------------------------

export interface TrendPoint {
  date: string
  value: number
}

export interface TrendAnomaly extends TrendPoint {
  deviation: number
}

export interface TrendResult {
  type: string
  days: number
  points: TrendPoint[]
  movingAverage7: TrendPoint[]
  movingAverage30: TrendPoint[]
  anomalies: TrendAnomaly[]
  baseline: { mean: number; stdDev: number } | null
}
