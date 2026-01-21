'use client'

import { onboarding as onboardingTheme, cn } from '@/lib/theme'
import { Check, X, Loader2, Circle } from 'lucide-react'
import type { ValidationState } from '@/lib/onboarding/store'

interface ValidationIndicatorProps {
  state: ValidationState
  showMessage?: boolean
  size?: 'sm' | 'md'
}

export function ValidationIndicator({
  state,
  showMessage = true,
  size = 'md',
}: ValidationIndicatorProps) {
  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'

  return (
    <div className="flex items-center gap-2">
      {/* Icon */}
      {state.status === 'idle' && (
        <Circle className={cn(iconSize, onboardingTheme.validation.idle)} />
      )}
      {state.status === 'checking' && (
        <Loader2
          className={cn(iconSize, 'animate-spin', onboardingTheme.validation.checking)}
        />
      )}
      {state.status === 'valid' && (
        <Check className={cn(iconSize, onboardingTheme.validation.valid)} />
      )}
      {state.status === 'invalid' && (
        <X className={cn(iconSize, onboardingTheme.validation.invalid)} />
      )}

      {/* Message */}
      {showMessage && state.message && (
        <span
          className={cn(
            'text-sm',
            state.status === 'valid' && onboardingTheme.validation.valid,
            state.status === 'invalid' && onboardingTheme.validation.invalid,
            state.status === 'checking' && onboardingTheme.validation.checking,
            state.status === 'idle' && onboardingTheme.validation.idle
          )}
        >
          {state.message}
        </span>
      )}
    </div>
  )
}

// Compact inline validation for form fields
interface InlineValidationProps {
  status: 'idle' | 'checking' | 'valid' | 'invalid'
  message?: string
}

export function InlineValidation({ status, message }: InlineValidationProps) {
  if (status === 'idle') return null

  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      {status === 'checking' && (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
      )}
      {status === 'valid' && <Check className="w-3.5 h-3.5 text-green-400" />}
      {status === 'invalid' && <X className="w-3.5 h-3.5 text-red-400" />}
      {message && (
        <span
          className={cn(
            'text-xs',
            status === 'valid' && 'text-green-400',
            status === 'invalid' && 'text-red-400',
            status === 'checking' && 'text-blue-400'
          )}
        >
          {message}
        </span>
      )}
    </div>
  )
}
