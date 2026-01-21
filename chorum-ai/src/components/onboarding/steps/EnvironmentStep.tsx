'use client'

import { useEffect, useCallback, useState } from 'react'
import { useOnboardingStore } from '@/lib/onboarding'
import { theme, cn } from '@/lib/theme'
import { SecretInput } from '../shared'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

export function EnvironmentStep() {
  const {
    formData,
    updateFormData,
    fieldValidation,
    setFieldValidation,
    setStepValidation,
    markStepComplete,
  } = useOnboardingStore()

  const [envStatus, setEnvStatus] = useState<{
    loaded: boolean
    existing: Record<string, boolean>
  }>({ loaded: false, existing: {} })

  // Check existing environment on mount
  useEffect(() => {
    async function checkEnv() {
      try {
        const res = await fetch('/api/onboarding/validate-env')
        if (res.ok) {
          const data = await res.json()
          const existing: Record<string, boolean> = {}
          data.variables.forEach((v: { name: string; status: string }) => {
            existing[v.name] = v.status === 'present'
          })
          setEnvStatus({ loaded: true, existing })
        }
      } catch {
        setEnvStatus({ loaded: true, existing: {} })
      }
    }
    checkEnv()
  }, [])

  // Validate step whenever form data changes
  useEffect(() => {
    const hasEncryptionKey = formData.encryptionKey.length === 64
    const hasAuthSecret = formData.authSecret.length >= 32

    const errors: string[] = []
    if (!hasEncryptionKey && !envStatus.existing.ENCRYPTION_KEY) {
      errors.push('ENCRYPTION_KEY is required (64 hex characters)')
    }
    if (!hasAuthSecret && !envStatus.existing.AUTH_SECRET) {
      errors.push('AUTH_SECRET is required (32+ characters)')
    }

    const isValid =
      (hasEncryptionKey || envStatus.existing.ENCRYPTION_KEY) &&
      (hasAuthSecret || envStatus.existing.AUTH_SECRET)

    setStepValidation('environment', {
      isValid,
      errors,
      warnings: [],
    })

    if (isValid) {
      markStepComplete('environment')
    }
  }, [
    formData.encryptionKey,
    formData.authSecret,
    envStatus.existing,
    setStepValidation,
    markStepComplete,
  ])

  // Generate encryption key
  const handleGenerateEncryptionKey = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/generate-secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables: ['ENCRYPTION_KEY'] }),
      })
      if (res.ok) {
        const data = await res.json()
        setFieldValidation('encryptionKey', {
          status: 'valid',
          message: 'Generated securely',
        })
        return data.generated.ENCRYPTION_KEY
      }
    } catch {
      setFieldValidation('encryptionKey', {
        status: 'invalid',
        message: 'Failed to generate',
      })
    }
    return ''
  }, [setFieldValidation])

  // Generate auth secret
  const handleGenerateAuthSecret = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/generate-secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables: ['AUTH_SECRET'] }),
      })
      if (res.ok) {
        const data = await res.json()
        setFieldValidation('authSecret', {
          status: 'valid',
          message: 'Generated securely',
        })
        return data.generated.AUTH_SECRET
      }
    } catch {
      setFieldValidation('authSecret', {
        status: 'invalid',
        message: 'Failed to generate',
      })
    }
    return ''
  }, [setFieldValidation])

  // Validate encryption key format
  const validateEncryptionKey = useCallback(
    (value: string) => {
      if (!value) {
        setFieldValidation('encryptionKey', { status: 'idle' })
        return
      }
      const isValid = /^[0-9a-f]{64}$/i.test(value)
      setFieldValidation('encryptionKey', {
        status: isValid ? 'valid' : 'invalid',
        message: isValid ? '64 hex characters ✓' : 'Must be 64 hex characters',
      })
    },
    [setFieldValidation]
  )

  // Validate auth secret
  const validateAuthSecret = useCallback(
    (value: string) => {
      if (!value) {
        setFieldValidation('authSecret', { status: 'idle' })
        return
      }
      const isValid = value.length >= 32
      setFieldValidation('authSecret', {
        status: isValid ? 'valid' : 'invalid',
        message: isValid ? 'Valid length ✓' : 'Must be at least 32 characters',
      })
    },
    [setFieldValidation]
  )

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div
        className={cn(
          'p-4 rounded-xl border flex items-start gap-3',
          'bg-blue-500/10 border-blue-500/20'
        )}
      >
        <CheckCircle2 className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className={cn('text-sm', theme.text.primary)}>
            These secrets encrypt your API keys and secure your sessions.
            They&apos;ll be stored in your <code className="text-blue-400">.env.local</code> file.
          </p>
        </div>
      </div>

      {/* Existing environment warning */}
      {envStatus.loaded &&
        (envStatus.existing.ENCRYPTION_KEY || envStatus.existing.AUTH_SECRET) && (
          <div
            className={cn(
              'p-4 rounded-xl border flex items-start gap-3',
              'bg-amber-500/10 border-amber-500/20'
            )}
          >
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className={cn('text-sm', theme.text.primary)}>
                Some environment variables are already configured:
              </p>
              <ul className="mt-2 text-sm text-gray-400">
                {envStatus.existing.ENCRYPTION_KEY && (
                  <li>• ENCRYPTION_KEY is set</li>
                )}
                {envStatus.existing.AUTH_SECRET && (
                  <li>• AUTH_SECRET is set</li>
                )}
              </ul>
              <p className={cn('mt-2 text-sm', theme.text.muted)}>
                You can skip these or generate new values to replace them.
              </p>
            </div>
          </div>
        )}

      {/* Encryption Key */}
      <SecretInput
        label="Encryption Key"
        value={formData.encryptionKey}
        onChange={(value) => {
          updateFormData('encryptionKey', value)
          validateEncryptionKey(value)
        }}
        placeholder={
          envStatus.existing.ENCRYPTION_KEY
            ? '(already configured)'
            : 'Click Generate or paste a 64-character hex string'
        }
        hint="Used to encrypt your API keys. 64 hexadecimal characters (32 bytes)."
        onGenerate={handleGenerateEncryptionKey}
        generateLabel="Generate"
        validation={fieldValidation.encryptionKey}
        disabled={!envStatus.loaded}
      />

      {/* Auth Secret */}
      <SecretInput
        label="Auth Secret"
        value={formData.authSecret}
        onChange={(value) => {
          updateFormData('authSecret', value)
          validateAuthSecret(value)
        }}
        placeholder={
          envStatus.existing.AUTH_SECRET
            ? '(already configured)'
            : 'Click Generate or paste a base64 string'
        }
        hint="Used to secure your authentication sessions."
        onGenerate={handleGenerateAuthSecret}
        generateLabel="Generate"
        validation={fieldValidation.authSecret}
        disabled={!envStatus.loaded}
      />

      {/* Help text */}
      <div className={cn('pt-4 border-t', theme.border.default)}>
        <p className={cn('text-sm', theme.text.muted)}>
          <span className="text-gray-300">Tip:</span> Click &quot;Generate&quot; to create
          cryptographically secure values. Copy them before proceeding—they
          won&apos;t be shown again.
        </p>
      </div>
    </div>
  )
}
