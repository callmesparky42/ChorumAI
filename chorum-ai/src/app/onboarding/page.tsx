'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useOnboardingStore, ONBOARDING_STEPS } from '@/lib/onboarding'
import {
  WizardContainer,
  WelcomeStep,
  EnvironmentStep,
  DatabaseStep,
  ProvidersStep,
  PreferencesStep,
  CompleteStep,
} from '@/components/onboarding'

// Map step names to components
const STEP_COMPONENTS: Record<string, React.ComponentType> = {
  welcome: WelcomeStep,
  environment: EnvironmentStep,
  database: DatabaseStep,
  providers: ProvidersStep,
  preferences: PreferencesStep,
}

export default function OnboardingPage() {
  const router = useRouter()
  const { currentStep } = useOnboardingStore()

  // Check if already completed onboarding
  useEffect(() => {
    async function checkOnboardingStatus() {
      try {
        const res = await fetch('/api/onboarding/status')
        if (res.ok) {
          const data = await res.json()
          if (data.completed) {
            // Already completed, redirect to main app
            router.replace('/')
          }
        }
      } catch {
        // If we can't check status, continue with onboarding
      }
    }
    checkOnboardingStatus()
  }, [router])

  // Get current step name and component
  const currentStepName = ONBOARDING_STEPS[currentStep]
  const isComplete = currentStep === ONBOARDING_STEPS.length - 1

  // For the complete step, render directly (different layout)
  if (isComplete) {
    return (
      <WizardContainer>
        <CompleteStep />
      </WizardContainer>
    )
  }

  // Get the component for the current step
  const StepComponent = STEP_COMPONENTS[currentStepName]

  if (!StepComponent) {
    return (
      <WizardContainer>
        <div className="text-center py-12 text-gray-400">
          Unknown step: {currentStepName}
        </div>
      </WizardContainer>
    )
  }

  return (
    <WizardContainer>
      <StepComponent />
    </WizardContainer>
  )
}
