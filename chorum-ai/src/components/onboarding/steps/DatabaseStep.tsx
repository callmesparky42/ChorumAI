'use client'

import { useEffect, useCallback, useState } from 'react'
import { useOnboardingStore } from '@/lib/onboarding'
import { theme, cn } from '@/lib/theme'
import { TextInput } from '../shared'
import { Database, CheckCircle2, XCircle, Loader2, Server } from 'lucide-react'

interface ConnectionResult {
  success: boolean
  latencyMs: number
  version?: string
  error?: string
  details?: string
}

export function DatabaseStep() {
  const {
    formData,
    updateFormData,
    fieldValidation,
    setFieldValidation,
    setStepValidation,
    markStepComplete,
    setSubmitting,
    isSubmitting,
  } = useOnboardingStore()

  const [connectionResult, setConnectionResult] = useState<ConnectionResult | null>(null)
  const [hasExistingConnection, setHasExistingConnection] = useState(false)

  // Check if we already have a database connection
  useEffect(() => {
    async function checkExisting() {
      try {
        const res = await fetch('/api/onboarding/test-connection', {
          method: 'POST',
        })
        if (res.ok) {
          const data = await res.json()
          if (data.success) {
            setHasExistingConnection(true)
            setConnectionResult(data)
            setStepValidation('database', {
              isValid: true,
              errors: [],
              warnings: [],
            })
            markStepComplete('database')
          }
        }
      } catch {
        // Silently fail - user will need to configure
      }
    }
    checkExisting()
  }, [setStepValidation, markStepComplete])

  // Validate database URL format
  const validateDatabaseUrl = useCallback(
    (value: string) => {
      if (!value) {
        setFieldValidation('databaseUrl', { status: 'idle' })
        return false
      }

      const isValid =
        value.startsWith('postgresql://') || value.startsWith('postgres://')

      setFieldValidation('databaseUrl', {
        status: isValid ? 'valid' : 'invalid',
        message: isValid
          ? 'Valid PostgreSQL URL format'
          : 'Must start with postgresql:// or postgres://',
      })

      return isValid
    },
    [setFieldValidation]
  )

  // Test database connection
  const handleTestConnection = useCallback(async () => {
    setSubmitting(true)
    setConnectionResult(null)

    try {
      const res = await fetch('/api/onboarding/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionString: formData.databaseUrl || undefined,
        }),
      })

      const data: ConnectionResult = await res.json()
      setConnectionResult(data)

      if (data.success) {
        setStepValidation('database', {
          isValid: true,
          errors: [],
          warnings: [],
        })
        markStepComplete('database')
      } else {
        setStepValidation('database', {
          isValid: false,
          errors: [data.error || 'Connection failed'],
          warnings: [],
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Connection test failed'
      setConnectionResult({
        success: false,
        latencyMs: 0,
        error: errorMessage,
        details: 'Could not reach the server',
      })
      setStepValidation('database', {
        isValid: false,
        errors: [errorMessage],
        warnings: [],
      })
    } finally {
      setSubmitting(false)
    }
  }, [formData.databaseUrl, setSubmitting, setStepValidation, markStepComplete])

  return (
    <div className="space-y-6">
      {/* Success state - already connected */}
      {hasExistingConnection && connectionResult?.success && (
        <div
          className={cn(
            'p-6 rounded-xl border text-center',
            'bg-green-500/10 border-green-500/20'
          )}
        >
          <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
          <h3 className={cn('text-lg font-medium mb-2', theme.text.primary)}>
            Database Connected
          </h3>
          <p className={theme.text.secondary}>
            Your database is already configured and working.
          </p>
          <div className="mt-4 flex items-center justify-center gap-4 text-sm">
            <span className="text-gray-400">
              {connectionResult.version}
            </span>
            <span className="text-green-400">
              {connectionResult.latencyMs}ms latency
            </span>
          </div>
        </div>
      )}

      {/* Configuration form */}
      {!hasExistingConnection && (
        <>
          {/* Info */}
          <div
            className={cn(
              'p-4 rounded-xl border flex items-start gap-3',
              'bg-gray-800/50 border-gray-700'
            )}
          >
            <Database className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className={cn('text-sm', theme.text.primary)}>
                ChorumAI uses PostgreSQL to store your conversations, settings,
                and learning data.
              </p>
              <p className={cn('text-sm mt-2', theme.text.muted)}>
                If you already have DATABASE_URL configured in your environment,
                we&apos;ll use that.
              </p>
            </div>
          </div>

          {/* Database URL input */}
          <TextInput
            label="Database URL"
            value={formData.databaseUrl}
            onChange={(value) => {
              updateFormData('databaseUrl', value)
              validateDatabaseUrl(value)
            }}
            placeholder="postgresql://user:password@localhost:5432/chorumai"
            hint="Your PostgreSQL connection string. Leave empty to use existing DATABASE_URL."
            validation={fieldValidation.databaseUrl}
            type="url"
          />

          {/* Test connection button */}
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isSubmitting}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-3',
              theme.button.secondary,
              isSubmitting && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Testing connection...
              </>
            ) : (
              <>
                <Server className="w-5 h-5" />
                Test Connection
              </>
            )}
          </button>
        </>
      )}

      {/* Connection result */}
      {connectionResult && !hasExistingConnection && (
        <div
          className={cn(
            'p-4 rounded-xl border',
            connectionResult.success
              ? 'bg-green-500/10 border-green-500/20'
              : 'bg-red-500/10 border-red-500/20'
          )}
        >
          <div className="flex items-start gap-3">
            {connectionResult.success ? (
              <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            )}
            <div className="flex-1">
              <p
                className={cn(
                  'font-medium',
                  connectionResult.success ? 'text-green-400' : 'text-red-400'
                )}
              >
                {connectionResult.success ? 'Connection successful!' : 'Connection failed'}
              </p>
              <p className={cn('text-sm mt-1', theme.text.secondary)}>
                {connectionResult.details}
              </p>
              {connectionResult.success && connectionResult.version && (
                <p className={cn('text-sm mt-2', theme.text.muted)}>
                  Version: {connectionResult.version} • Latency: {connectionResult.latencyMs}ms
                </p>
              )}
              {!connectionResult.success && connectionResult.error && (
                <p className={cn('text-sm mt-2 font-mono', 'text-red-300/70')}>
                  {connectionResult.error}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
