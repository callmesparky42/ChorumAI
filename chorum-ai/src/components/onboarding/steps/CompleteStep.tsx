'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOnboardingStore } from '@/lib/onboarding'
import { theme, cn } from '@/lib/theme'
import { ProviderBadge, PROVIDER_INFO } from '../shared'
import {
  CheckCircle2,
  Settings,
  MessageSquare,
  Loader2,
  PartyPopper,
} from 'lucide-react'

export function CompleteStep() {
  const router = useRouter()
  const { formData, setSubmitting, isSubmitting, reset } = useOnboardingStore()
  const [error, setError] = useState<string | null>(null)

  // Summarize configuration
  const primaryProvider = formData.primaryProvider
  const primaryInfo = primaryProvider ? PROVIDER_INFO[primaryProvider] : null

  // Complete onboarding and redirect
  const handleComplete = useCallback(async () => {
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || data.error || 'Failed to complete onboarding')
      }

      // Clear persisted state
      reset()

      // Redirect to main app
      router.push('/')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }, [setSubmitting, reset, router])

  return (
    <div className="space-y-8">
      {/* Success hero */}
      <div className="text-center py-6">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/25">
            <PartyPopper className="w-10 h-10 text-white" />
          </div>
        </div>
        <h2 className={cn('text-2xl font-bold mb-2', theme.text.primary)}>
          You&apos;re All Set!
        </h2>
        <p className={cn('text-lg', theme.text.secondary)}>
          ChorumAI is configured and ready to use.
        </p>
      </div>

      {/* Configuration summary */}
      <div
        className={cn(
          'p-6 rounded-xl border',
          theme.bg.elevated,
          theme.border.default
        )}
      >
        <h3 className={cn('font-medium mb-4', theme.text.primary)}>
          Configuration Summary
        </h3>

        <div className="space-y-4">
          {/* Providers */}
          <div className="flex items-start justify-between">
            <div>
              <p className={cn('text-sm font-medium', theme.text.secondary)}>
                LLM Providers
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.providers.map((provider, index) => (
                  <ProviderBadge
                    key={`${provider.provider}-${index}`}
                    provider={provider.provider}
                    validated={provider.validated}
                  />
                ))}
              </div>
            </div>
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          </div>

          {/* Primary provider */}
          {primaryInfo && (
            <div className="flex items-center justify-between pt-3 border-t border-gray-800">
              <div>
                <p className={cn('text-sm font-medium', theme.text.secondary)}>
                  Primary Provider
                </p>
                <p className={cn('mt-1', theme.text.primary)}>
                  {primaryInfo.name}
                </p>
              </div>
              <CheckCircle2 className="w-5 h-5 text-green-400" />
            </div>
          )}

          {/* Features enabled */}
          <div className="pt-3 border-t border-gray-800">
            <p className={cn('text-sm font-medium mb-2', theme.text.secondary)}>
              Features Enabled
            </p>
            <div className="flex flex-wrap gap-2">
              {formData.preferences.memorySettings.autoLearn && (
                <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-400">
                  Auto-Learn
                </span>
              )}
              {formData.preferences.fallbackSettings.enabled && (
                <span className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-400">
                  Auto-Fallback
                </span>
              )}
              {formData.preferences.securitySettings.enforceHttps && (
                <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">
                  HTTPS Only
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div
          className={cn(
            'p-4 rounded-xl border',
            'bg-red-500/10 border-red-500/20'
          )}
        >
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={handleComplete}
          disabled={isSubmitting}
          className={cn(
            'flex items-center justify-center gap-2 px-6 py-4 rounded-xl',
            'bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium',
            'hover:from-blue-500 hover:to-purple-500 transition-all',
            'shadow-lg shadow-blue-500/25',
            isSubmitting && 'opacity-50 cursor-not-allowed'
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Finalizing...
            </>
          ) : (
            <>
              <MessageSquare className="w-5 h-5" />
              Start Chatting
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => router.push('/settings')}
          disabled={isSubmitting}
          className={cn(
            'flex items-center justify-center gap-2 px-6 py-4',
            theme.button.secondary,
            isSubmitting && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Settings className="w-5 h-5" />
          Go to Settings
        </button>
      </div>

      {/* Tip */}
      <div className={cn('text-center pt-4', theme.text.muted)}>
        <p className="text-sm">
          <span className="text-gray-400">Tip:</span> Press{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 font-mono text-xs">
            ⌘K
          </kbd>{' '}
          anytime to switch models quickly
        </p>
      </div>
    </div>
  )
}
