/**
 * Onboarding Module
 *
 * Handles the multi-step wizard for new user setup.
 * Includes environment validation, provider configuration, and preferences.
 */

export * from './types'
export * from './store'

// Re-export OnboardingData type from schema for convenience
export type { OnboardingData } from '@/lib/db/schema'
