'use client'

import { useEffect, useCallback, useState } from 'react'
import { useOnboardingStore, type ProviderConfig } from '@/lib/onboarding'
import { theme, cn } from '@/lib/theme'
import { ProviderCard, ProviderBadge, PROVIDER_INFO, SecretInput, TextInput } from '../shared'
import {
  Plus,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

const CLOUD_PROVIDERS = ['anthropic', 'openai', 'google', 'perplexity', 'deepseek']
const LOCAL_PROVIDERS = ['ollama', 'lmstudio']

// Default models per provider
const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  google: 'gemini-1.5-flash',
  perplexity: 'llama-3.1-sonar-large-128k-online',
  deepseek: 'deepseek-chat',
  ollama: 'llama3',
  lmstudio: 'local-model',
}

export function ProvidersStep() {
  const {
    formData,
    addProvider,
    removeProvider,
    fieldValidation,
    setFieldValidation,
    setStepValidation,
    markStepComplete,
    isSubmitting,
    setSubmitting,
  } = useOnboardingStore()

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [modelInput, setModelInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  // Validate step - need at least one provider
  useEffect(() => {
    const hasProvider = formData.providers.length > 0
    const allValidated = formData.providers.every((p) => p.validated)

    setStepValidation('providers', {
      isValid: hasProvider && allValidated,
      errors: hasProvider ? [] : ['Add at least one LLM provider'],
      warnings: hasProvider && !allValidated ? ['Some providers not validated'] : [],
    })

    if (hasProvider && allValidated) {
      markStepComplete('providers')
    }
  }, [formData.providers, setStepValidation, markStepComplete])

  // Handle provider selection
  const handleSelectProvider = useCallback((provider: string) => {
    setSelectedProvider(provider)
    setApiKeyInput('')
    setModelInput(DEFAULT_MODELS[provider] || '')
    setBaseUrlInput(
      provider === 'ollama'
        ? 'http://localhost:11434'
        : provider === 'lmstudio'
          ? 'http://localhost:1234'
          : ''
    )
    setTestResult(null)
    setShowAdvanced(false)
  }, [])

  // Test and add provider
  const handleAddProvider = useCallback(async () => {
    if (!selectedProvider) return

    const info = PROVIDER_INFO[selectedProvider]
    const isLocal = info?.isLocal ?? false

    // Validation
    if (!isLocal && !apiKeyInput) {
      setFieldValidation('providerApiKey', {
        status: 'invalid',
        message: 'API key is required',
      })
      return
    }

    setSubmitting(true)
    setTestResult(null)

    try {
      // Test the provider
      const res = await fetch('/api/onboarding/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey: isLocal ? undefined : apiKeyInput,
          model: modelInput || DEFAULT_MODELS[selectedProvider],
          baseUrl: baseUrlInput || undefined,
        }),
      })

      const data = await res.json()

      if (data.success) {
        // Add to providers list
        const newProvider: ProviderConfig = {
          provider: selectedProvider,
          apiKey: apiKeyInput,
          model: modelInput || DEFAULT_MODELS[selectedProvider],
          baseUrl: baseUrlInput || undefined,
          isLocal,
          validated: true,
        }
        addProvider(newProvider)

        // Reset form
        setSelectedProvider(null)
        setApiKeyInput('')
        setModelInput('')
        setBaseUrlInput('')
        setTestResult({ success: true, message: 'Provider added successfully!' })
      } else {
        setTestResult({
          success: false,
          message: data.error || data.details || 'Validation failed',
        })
        setFieldValidation('providerApiKey', {
          status: 'invalid',
          message: data.details || 'Invalid API key',
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      setTestResult({ success: false, message })
    } finally {
      setSubmitting(false)
    }
  }, [
    selectedProvider,
    apiKeyInput,
    modelInput,
    baseUrlInput,
    setSubmitting,
    setFieldValidation,
    addProvider,
  ])

  // Cancel adding provider
  const handleCancel = useCallback(() => {
    setSelectedProvider(null)
    setApiKeyInput('')
    setModelInput('')
    setBaseUrlInput('')
    setTestResult(null)
  }, [])

  return (
    <div className="space-y-6">
      {/* Configured providers */}
      {formData.providers.length > 0 && (
        <div className="space-y-3">
          <h3 className={cn('text-sm font-medium', theme.text.secondary)}>
            Configured Providers
          </h3>
          <div className="flex flex-wrap gap-2">
            {formData.providers.map((provider, index) => (
              <ProviderBadge
                key={`${provider.provider}-${index}`}
                provider={provider.provider}
                validated={provider.validated}
                onRemove={() => removeProvider(index)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Provider selection */}
      {!selectedProvider && (
        <div className="space-y-4">
          <h3 className={cn('text-sm font-medium', theme.text.secondary)}>
            Cloud Providers
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {CLOUD_PROVIDERS.filter(
              (p) => !formData.providers.some((fp) => fp.provider === p)
            ).map((provider) => (
              <ProviderCard
                key={provider}
                provider={provider}
                selected={false}
                onSelect={() => handleSelectProvider(provider)}
              />
            ))}
          </div>

          <h3 className={cn('text-sm font-medium mt-6', theme.text.secondary)}>
            Local Providers
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {LOCAL_PROVIDERS.filter(
              (p) => !formData.providers.some((fp) => fp.provider === p)
            ).map((provider) => (
              <ProviderCard
                key={provider}
                provider={provider}
                selected={false}
                onSelect={() => handleSelectProvider(provider)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Provider configuration form */}
      {selectedProvider && (
        <div
          className={cn(
            'p-6 rounded-xl border space-y-4',
            theme.bg.elevated,
            theme.border.default
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <span className="font-bold text-blue-400">
                  {PROVIDER_INFO[selectedProvider]?.name.charAt(0) || '?'}
                </span>
              </div>
              <div>
                <h3 className={cn('font-medium', theme.text.primary)}>
                  Configure {PROVIDER_INFO[selectedProvider]?.name}
                </h3>
                <p className={cn('text-sm', theme.text.muted)}>
                  {PROVIDER_INFO[selectedProvider]?.isLocal
                    ? 'Local provider - no API key needed'
                    : 'Enter your API key to connect'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              className={cn('p-2', theme.button.ghost)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* API Key (for cloud providers) */}
          {!PROVIDER_INFO[selectedProvider]?.isLocal && (
            <SecretInput
              label="API Key"
              value={apiKeyInput}
              onChange={(value) => {
                setApiKeyInput(value)
                setFieldValidation('providerApiKey', { status: 'idle' })
              }}
              placeholder={`${PROVIDER_INFO[selectedProvider]?.keyPrefix || ''}...`}
              hint={`Get your key from ${PROVIDER_INFO[selectedProvider]?.name}`}
              helpLink={{
                text: 'Where do I find this?',
                url: PROVIDER_INFO[selectedProvider]?.helpUrl || '#',
              }}
              validation={fieldValidation.providerApiKey}
            />
          )}

          {/* Advanced options toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={cn(
              'flex items-center gap-2 text-sm',
              theme.text.secondary,
              'hover:text-white transition-colors'
            )}
          >
            {showAdvanced ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            Advanced options
          </button>

          {/* Advanced options */}
          {showAdvanced && (
            <div className="space-y-4 pt-2">
              <TextInput
                label="Model"
                value={modelInput}
                onChange={setModelInput}
                placeholder={DEFAULT_MODELS[selectedProvider]}
                hint="Leave empty to use the default model"
              />

              {(PROVIDER_INFO[selectedProvider]?.isLocal ||
                selectedProvider === 'openai-compatible') && (
                  <TextInput
                    label="Base URL"
                    value={baseUrlInput}
                    onChange={setBaseUrlInput}
                    placeholder={
                      selectedProvider === 'ollama'
                        ? 'http://localhost:11434'
                        : 'http://localhost:1234'
                    }
                    hint="Custom endpoint URL"
                    type="url"
                  />
                )}
            </div>
          )}

          {/* Test result */}
          {testResult && (
            <div
              className={cn(
                'p-3 rounded-lg flex items-center gap-2',
                testResult.success
                  ? 'bg-green-500/10 text-green-400'
                  : 'bg-red-500/10 text-red-400'
              )}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              <span className="text-sm">{testResult.message}</span>
            </div>
          )}

          {/* Add button */}
          <button
            type="button"
            onClick={handleAddProvider}
            disabled={isSubmitting}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-3',
              theme.button.primary,
              isSubmitting && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Plus className="w-5 h-5" />
                Add Provider
              </>
            )}
          </button>
        </div>
      )}

      {/* Empty state */}
      {formData.providers.length === 0 && !selectedProvider && (
        <div
          className={cn(
            'p-4 rounded-xl border flex items-start gap-3',
            'bg-amber-500/10 border-amber-500/20'
          )}
        >
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className={cn('text-sm', theme.text.primary)}>
              Add at least one provider to continue.
            </p>
            <p className={cn('text-sm mt-1', theme.text.muted)}>
              Select a cloud provider above or use Ollama for local models.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
