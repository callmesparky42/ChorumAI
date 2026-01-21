/**
 * Onboarding Wizard State Management
 *
 * Zustand store for managing the onboarding wizard flow.
 * Persists progress to localStorage to allow resuming.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ONBOARDING_STEPS, type OnboardingStep } from './types'

// Provider configuration during onboarding
export interface ProviderConfig {
  provider: string
  apiKey: string
  model: string
  baseUrl?: string
  isLocal: boolean
  validated: boolean
}

// Form data collected during onboarding
export interface OnboardingFormData {
  // Environment variables
  databaseUrl: string
  encryptionKey: string
  authSecret: string
  googleClientId: string
  googleClientSecret: string
  nextAuthUrl: string

  // Provider configurations
  providers: ProviderConfig[]
  primaryProvider: string | null

  // Preferences
  preferences: {
    memorySettings: {
      autoLearn: boolean
      learningMode: 'sync' | 'async'
      injectContext: boolean
      autoSummarize: boolean
    }
    securitySettings: {
      enforceHttps: boolean
      anonymizePii: boolean
    }
    fallbackSettings: {
      enabled: boolean
      defaultProvider: string | null
    }
  }
}

// Validation state per field/step
export interface ValidationState {
  status: 'idle' | 'checking' | 'valid' | 'invalid'
  message?: string
  details?: Record<string, unknown>
}

// Step validation results
export interface StepValidation {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

interface OnboardingState {
  // Navigation
  currentStep: number
  completedSteps: OnboardingStep[]

  // Form data
  formData: OnboardingFormData

  // Validation
  fieldValidation: Record<string, ValidationState>
  stepValidation: Record<OnboardingStep, StepValidation>

  // UI state
  isSubmitting: boolean
  error: string | null

  // Installation tracking (for pre-auth)
  installationId: string

  // Actions - Navigation
  setStep: (step: number) => void
  nextStep: () => void
  prevStep: () => void
  markStepComplete: (step: OnboardingStep) => void

  // Actions - Form data
  updateFormData: <K extends keyof OnboardingFormData>(
    key: K,
    value: OnboardingFormData[K]
  ) => void
  updateNestedFormData: <K extends keyof OnboardingFormData>(
    key: K,
    nestedKey: string,
    value: unknown
  ) => void

  // Actions - Providers
  addProvider: (provider: ProviderConfig) => void
  removeProvider: (index: number) => void
  updateProvider: (index: number, updates: Partial<ProviderConfig>) => void
  setPrimaryProvider: (provider: string | null) => void

  // Actions - Validation
  setFieldValidation: (field: string, state: ValidationState) => void
  setStepValidation: (step: OnboardingStep, validation: StepValidation) => void

  // Actions - UI
  setSubmitting: (isSubmitting: boolean) => void
  setError: (error: string | null) => void

  // Actions - Reset
  reset: () => void
  clearProgress: () => void
}

const initialFormData: OnboardingFormData = {
  databaseUrl: '',
  encryptionKey: '',
  authSecret: '',
  googleClientId: '',
  googleClientSecret: '',
  nextAuthUrl: typeof window !== 'undefined' ? window.location.origin : '',
  providers: [],
  primaryProvider: null,
  preferences: {
    memorySettings: {
      autoLearn: true,
      learningMode: 'async',
      injectContext: true,
      autoSummarize: true,
    },
    securitySettings: {
      enforceHttps: true,
      anonymizePii: false,
    },
    fallbackSettings: {
      enabled: true,
      defaultProvider: null,
    },
  },
}

const initialStepValidation: Record<OnboardingStep, StepValidation> = {
  welcome: { isValid: true, errors: [], warnings: [] },
  environment: { isValid: false, errors: [], warnings: [] },
  database: { isValid: false, errors: [], warnings: [] },
  providers: { isValid: false, errors: [], warnings: [] },
  preferences: { isValid: true, errors: [], warnings: [] }, // Optional step
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentStep: 0,
      completedSteps: [],
      formData: initialFormData,
      fieldValidation: {},
      stepValidation: initialStepValidation,
      isSubmitting: false,
      error: null,
      installationId:
        typeof window !== 'undefined'
          ? crypto.randomUUID()
          : 'server-side',

      // Navigation actions
      setStep: (step) => set({ currentStep: step }),

      nextStep: () => {
        const { currentStep } = get()
        const maxStep = ONBOARDING_STEPS.length - 1
        if (currentStep < maxStep) {
          set({ currentStep: currentStep + 1 })
        }
      },

      prevStep: () => {
        const { currentStep } = get()
        if (currentStep > 0) {
          set({ currentStep: currentStep - 1 })
        }
      },

      markStepComplete: (step) => {
        const { completedSteps } = get()
        if (!completedSteps.includes(step)) {
          set({ completedSteps: [...completedSteps, step] })
        }
      },

      // Form data actions
      updateFormData: (key, value) => {
        set((state) => ({
          formData: { ...state.formData, [key]: value },
        }))
      },

      updateNestedFormData: (key, nestedKey, value) => {
        set((state) => ({
          formData: {
            ...state.formData,
            [key]: {
              ...(state.formData[key] as Record<string, unknown>),
              [nestedKey]: value,
            },
          },
        }))
      },

      // Provider actions
      addProvider: (provider) => {
        set((state) => ({
          formData: {
            ...state.formData,
            providers: [...state.formData.providers, provider],
            // Set as primary if first provider
            primaryProvider:
              state.formData.primaryProvider || provider.provider,
          },
        }))
      },

      removeProvider: (index) => {
        set((state) => {
          const newProviders = state.formData.providers.filter(
            (_, i) => i !== index
          )
          const removedProvider = state.formData.providers[index]
          return {
            formData: {
              ...state.formData,
              providers: newProviders,
              // Clear primary if removed
              primaryProvider:
                state.formData.primaryProvider === removedProvider?.provider
                  ? newProviders[0]?.provider || null
                  : state.formData.primaryProvider,
            },
          }
        })
      },

      updateProvider: (index, updates) => {
        set((state) => ({
          formData: {
            ...state.formData,
            providers: state.formData.providers.map((p, i) =>
              i === index ? { ...p, ...updates } : p
            ),
          },
        }))
      },

      setPrimaryProvider: (provider) => {
        set((state) => ({
          formData: { ...state.formData, primaryProvider: provider },
        }))
      },

      // Validation actions
      setFieldValidation: (field, state) => {
        set((s) => ({
          fieldValidation: { ...s.fieldValidation, [field]: state },
        }))
      },

      setStepValidation: (step, validation) => {
        set((state) => ({
          stepValidation: { ...state.stepValidation, [step]: validation },
        }))
      },

      // UI actions
      setSubmitting: (isSubmitting) => set({ isSubmitting }),
      setError: (error) => set({ error }),

      // Reset actions
      reset: () =>
        set({
          currentStep: 0,
          completedSteps: [],
          formData: initialFormData,
          fieldValidation: {},
          stepValidation: initialStepValidation,
          isSubmitting: false,
          error: null,
          installationId: crypto.randomUUID(),
        }),

      clearProgress: () =>
        set({
          currentStep: 0,
          completedSteps: [],
        }),
    }),
    {
      name: 'chorum-onboarding',
      // Only persist certain fields
      partialize: (state) => ({
        currentStep: state.currentStep,
        completedSteps: state.completedSteps,
        formData: state.formData,
        installationId: state.installationId,
      }),
    }
  )
)

// Selector hooks for common patterns
export const useCurrentStep = () => useOnboardingStore((s) => s.currentStep)
export const useFormData = () => useOnboardingStore((s) => s.formData)
export const useIsStepValid = (step: OnboardingStep) =>
  useOnboardingStore((s) => s.stepValidation[step]?.isValid ?? false)
export const useFieldValidation = (field: string) =>
  useOnboardingStore((s) => s.fieldValidation[field])
