'use client'

import { useOnboardingStore } from '@/lib/onboarding'
import { ONBOARDING_STEPS, STEP_CONFIG, type OnboardingStep } from '@/lib/onboarding/types'
import { theme, onboarding as onboardingTheme, cn } from '@/lib/theme'
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import Image from 'next/image'

interface WizardContainerProps {
  children: React.ReactNode
}

export function WizardContainer({ children }: WizardContainerProps) {
  const {
    currentStep,
    completedSteps,
    isSubmitting,
    nextStep,
    prevStep,
    stepValidation,
  } = useOnboardingStore()

  const currentStepConfig = STEP_CONFIG[ONBOARDING_STEPS[currentStep]]
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1
  const currentStepName = ONBOARDING_STEPS[currentStep]
  const canProceed = stepValidation[currentStepName]?.isValid ?? false

  return (
    <div className={cn('min-h-screen flex flex-col', theme.bg.base)}>
      {/* Header */}
      <header className={cn('border-b py-4 px-6', theme.border.default)}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="ChorumAI"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className={cn('font-semibold text-lg', theme.text.primary)}>
              ChorumAI
            </span>
          </div>
          <span className={cn('text-sm', theme.text.muted)}>
            Setup Wizard
          </span>
        </div>
      </header>

      {/* Progress indicator */}
      <div className={cn('border-b py-6 px-6', theme.border.default)}>
        <div className="max-w-4xl mx-auto">
          <StepIndicator
            steps={ONBOARDING_STEPS}
            currentStep={currentStep}
            completedSteps={completedSteps}
          />
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 py-8 px-6">
        <div className="max-w-2xl mx-auto">
          {/* Step header */}
          <div className="mb-8">
            <h1 className={cn('text-2xl font-semibold mb-2', theme.text.primary)}>
              {currentStepConfig.title}
            </h1>
            <p className={theme.text.secondary}>
              {currentStepConfig.description}
            </p>
          </div>

          {/* Step content */}
          <div className="min-h-[400px]">{children}</div>
        </div>
      </main>

      {/* Footer navigation */}
      <footer className={cn('border-t py-4 px-6', theme.border.default)}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          {/* Back button */}
          <button
            onClick={prevStep}
            disabled={isFirstStep || isSubmitting}
            className={cn(
              'flex items-center gap-2 px-4 py-2',
              theme.button.ghost,
              (isFirstStep || isSubmitting) && 'opacity-50 cursor-not-allowed'
            )}
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {/* Step count */}
          <span className={cn('text-sm', theme.text.muted)}>
            Step {currentStep + 1} of {ONBOARDING_STEPS.length}
          </span>

          {/* Continue button */}
          {!isLastStep ? (
            <button
              onClick={nextStep}
              disabled={!canProceed || isSubmitting}
              className={cn(
                'flex items-center gap-2 px-6 py-2',
                theme.button.primary,
                (!canProceed || isSubmitting) && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          ) : (
            <button
              disabled={isSubmitting}
              className={cn(
                'flex items-center gap-2 px-6 py-2',
                theme.button.primary,
                isSubmitting && 'opacity-50 cursor-not-allowed'
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Finishing...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Complete Setup
                </>
              )}
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}

interface StepIndicatorProps {
  steps: readonly OnboardingStep[]
  currentStep: number
  completedSteps: OnboardingStep[]
}

function StepIndicator({ steps, currentStep, completedSteps }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-between">
      {steps.map((step, index) => {
        const isCompleted = completedSteps.includes(step)
        const isCurrent = index === currentStep
        const config = STEP_CONFIG[step]

        return (
          <div key={step} className="flex items-center flex-1">
            {/* Step circle */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all',
                  isCompleted && onboardingTheme.step.completed,
                  isCurrent && !isCompleted && onboardingTheme.step.current,
                  !isCompleted && !isCurrent && onboardingTheme.step.upcoming
                )}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={cn(
                  'mt-2 text-xs font-medium',
                  isCurrent ? theme.text.primary : theme.text.muted
                )}
              >
                {config.title}
              </span>
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-0.5 mx-2',
                  isCompleted
                    ? onboardingTheme.step.connector.completed
                    : onboardingTheme.step.connector.upcoming
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
