/**
 * Onboarding Types and Validation
 *
 * Defines the shape of onboarding wizard data, step configurations,
 * and validation helpers for the setup flow.
 */

import type { OnboardingData } from '@/lib/db/schema'

// Wizard step definitions
export const ONBOARDING_STEPS = [
  'welcome',
  'environment',
  'database',
  'providers',
  'preferences',
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

export const STEP_CONFIG: Record<
  OnboardingStep,
  {
    index: number
    title: string
    description: string
    required: boolean
    canSkip: boolean
  }
> = {
  welcome: {
    index: 0,
    title: 'Welcome to ChorumAI',
    description: 'Your intelligent LLM router',
    required: true,
    canSkip: false,
  },
  environment: {
    index: 1,
    title: 'Environment Setup',
    description: 'Configure your application secrets',
    required: true,
    canSkip: false,
  },
  database: {
    index: 2,
    title: 'Database Connection',
    description: 'Verify your PostgreSQL connection',
    required: true,
    canSkip: false,
  },
  providers: {
    index: 3,
    title: 'LLM Providers',
    description: 'Add at least one AI provider',
    required: true,
    canSkip: false,
  },
  preferences: {
    index: 4,
    title: 'Preferences',
    description: 'Customize your experience',
    required: false,
    canSkip: true,
  },
}

// Environment validation types
export type EnvValidationResult = {
  valid: boolean
  configured: boolean // Has .env.local file
  variables: {
    name: string
    status: 'present' | 'missing' | 'invalid'
    required: boolean
    hint?: string
  }[]
  canProceed: boolean // All required vars present and valid
}

export type EnvVariable =
  | 'DATABASE_URL'
  | 'ENCRYPTION_KEY'
  | 'AUTH_SECRET'
  | 'GOOGLE_CLIENT_ID'
  | 'GOOGLE_CLIENT_SECRET'
  | 'NEXTAUTH_URL'
  | 'ANTHROPIC_API_KEY'
  | 'OPENAI_API_KEY'
  | 'GOOGLE_AI_API_KEY'

export const ENV_REQUIREMENTS: Record<
  EnvVariable,
  {
    required: boolean
    validation?: (value: string) => boolean
    hint: string
    generateable: boolean // Can be auto-generated
  }
> = {
  DATABASE_URL: {
    required: true,
    validation: (v) => v.startsWith('postgresql://') || v.startsWith('postgres://'),
    hint: 'PostgreSQL connection string (postgresql://user:pass@host:5432/db)',
    generateable: false,
  },
  ENCRYPTION_KEY: {
    required: true,
    validation: (v) => /^[a-f0-9]{64}$/i.test(v),
    hint: '64 hex characters (32 bytes) for AES-256 encryption',
    generateable: true,
  },
  AUTH_SECRET: {
    required: true,
    validation: (v) => v.length >= 32,
    hint: 'Base64 string for NextAuth session security',
    generateable: true,
  },
  GOOGLE_CLIENT_ID: {
    required: true,
    validation: (v) => v.endsWith('.apps.googleusercontent.com'),
    hint: 'From Google Cloud Console → APIs & Services → Credentials',
    generateable: false,
  },
  GOOGLE_CLIENT_SECRET: {
    required: true,
    validation: (v) => v.length > 10,
    hint: 'Client secret from Google Cloud Console',
    generateable: false,
  },
  NEXTAUTH_URL: {
    required: false,
    validation: (v) => v.startsWith('http://') || v.startsWith('https://'),
    hint: 'Your app URL (required for production)',
    generateable: false,
  },
  ANTHROPIC_API_KEY: {
    required: false,
    validation: (v) => v.startsWith('sk-ant-'),
    hint: 'From console.anthropic.com',
    generateable: false,
  },
  OPENAI_API_KEY: {
    required: false,
    validation: (v) => v.startsWith('sk-'),
    hint: 'From platform.openai.com',
    generateable: false,
  },
  GOOGLE_AI_API_KEY: {
    required: false,
    validation: (v) => v.length > 20,
    hint: 'From Google AI Studio',
    generateable: false,
  },
}

// Provider test types
export type ProviderTestResult = {
  success: boolean
  provider: string
  model?: string
  latencyMs?: number
  error?: string
  details?: string
}

// Database test types
export type DatabaseTestResult = {
  success: boolean
  latencyMs: number
  version?: string
  error?: string
  details?: string
}

// Onboarding status for API responses
export type OnboardingStatus = {
  completed: boolean
  currentStep: number
  currentStepName: OnboardingStep
  data: OnboardingData | null
  progress: {
    total: number
    completed: number
    percentage: number
  }
  nextAction?: string
}

// API request/response types
// API request/response types
export type ValidateEnvRequest = Record<string, never>

export type ValidateEnvResponse = EnvValidationResult

export type GenerateSecretsRequest = {
  variables: ('ENCRYPTION_KEY' | 'AUTH_SECRET')[]
}

export type GenerateSecretsResponse = {
  generated: Record<string, string>
  writeInstructions: string
}

export type TestDatabaseRequest = {
  connectionString?: string // Optional override for testing
}

export type TestDatabaseResponse = DatabaseTestResult

export type TestProviderRequest = {
  provider: string
  apiKey: string
  model?: string
  baseUrl?: string
}

export type TestProviderResponse = ProviderTestResult

export type UpdateOnboardingRequest = {
  step: OnboardingStep
  data?: Partial<OnboardingData>
}

export type UpdateOnboardingResponse = {
  success: boolean
  status: OnboardingStatus
}

export type CompleteOnboardingRequest = Record<string, never>

export type CompleteOnboardingResponse = {
  success: boolean
  redirectTo: string
}

// Helper functions
export function getStepIndex(step: OnboardingStep): number {
  return STEP_CONFIG[step].index
}

export function getStepByIndex(index: number): OnboardingStep | null {
  const entry = Object.entries(STEP_CONFIG).find(([, config]) => config.index === index)
  return entry ? (entry[0] as OnboardingStep) : null
}

export function isStepComplete(data: OnboardingData | null, step: OnboardingStep): boolean {
  if (!data) return false
  return data.completedSteps.includes(step)
}

export function getNextIncompleteStep(data: OnboardingData | null): OnboardingStep {
  if (!data) return 'welcome'

  for (const step of ONBOARDING_STEPS) {
    if (!data.completedSteps.includes(step)) {
      return step
    }
  }

  return 'preferences' // All complete, return last step
}

export function calculateProgress(data: OnboardingData | null): {
  total: number
  completed: number
  percentage: number
} {
  const total = ONBOARDING_STEPS.length
  const completed = data?.completedSteps.length ?? 0
  const percentage = Math.round((completed / total) * 100)

  return { total, completed, percentage }
}

export function createInitialOnboardingData(): OnboardingData {
  return {
    completedSteps: [],
    envConfigured: false,
    databaseConnected: false,
    providersConfigured: [],
    preferencesSet: false,
    startedAt: new Date().toISOString(),
    setupSource: 'wizard',
  }
}
