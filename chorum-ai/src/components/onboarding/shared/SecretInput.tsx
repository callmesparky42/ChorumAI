'use client'

import { useState, useCallback } from 'react'
import { onboarding as onboardingTheme, theme, cn } from '@/lib/theme'
import { Eye, EyeOff, Copy, Check, RefreshCw, Loader2 } from 'lucide-react'
import { InlineValidation } from './ValidationIndicator'

interface SecretInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label: string
  hint?: string
  helpLink?: {
    text: string
    url: string
  }
  validation?: {
    status: 'idle' | 'checking' | 'valid' | 'invalid'
    message?: string
  }
  onGenerate?: () => Promise<string>
  generateLabel?: string
  disabled?: boolean
  className?: string
}

export function SecretInput({
  value,
  onChange,
  placeholder = '••••••••',
  label,
  hint,
  helpLink,
  validation,
  onGenerate,
  generateLabel = 'Generate',
  disabled = false,
  className,
}: SecretInputProps) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [generating, setGenerating] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [value])

  const handleGenerate = useCallback(async () => {
    if (!onGenerate) return
    setGenerating(true)
    try {
      const generated = await onGenerate()
      onChange(generated)
    } finally {
      setGenerating(false)
    }
  }, [onGenerate, onChange])

  return (
    <div className={cn('space-y-2', className)}>
      {/* Label and help link */}
      <div className="flex items-center justify-between">
        <label className={cn('text-sm font-medium', theme.text.primary)}>
          {label}
        </label>
        {helpLink && (
          <a
            href={helpLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('text-xs', theme.text.accent, 'hover:underline')}
          >
            {helpLink.text}
          </a>
        )}
      </div>

      {/* Input container */}
      <div
        className={cn(
          'flex items-center',
          onboardingTheme.secretInput.container,
          validation?.status === 'invalid' && 'border-red-500',
          validation?.status === 'valid' && 'border-green-500/50',
          disabled && 'opacity-50'
        )}
      >
        <input
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            onboardingTheme.secretInput.input,
            'w-full'
          )}
        />

        {/* Action buttons */}
        <div className="flex items-center gap-1 pr-2">
          {/* Generate button */}
          {onGenerate && (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={disabled || generating}
              className={cn(
                onboardingTheme.secretInput.button,
                'flex items-center gap-1 text-xs'
              )}
              title={generateLabel}
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={!value || disabled}
            className={cn(
              onboardingTheme.secretInput.button,
              !value && 'opacity-30 cursor-not-allowed'
            )}
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>

          {/* Reveal toggle */}
          <button
            type="button"
            onClick={() => setRevealed(!revealed)}
            disabled={disabled}
            className={onboardingTheme.secretInput.button}
            title={revealed ? 'Hide' : 'Reveal'}
          >
            {revealed ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Hint text */}
      {hint && !validation?.message && (
        <p className={cn('text-xs', theme.text.muted)}>{hint}</p>
      )}

      {/* Validation feedback */}
      {validation && (
        <InlineValidation
          status={validation.status}
          message={validation.message}
        />
      )}
    </div>
  )
}

// Simpler variant for non-secret inputs with same styling
interface TextInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label: string
  hint?: string
  helpLink?: {
    text: string
    url: string
  }
  validation?: {
    status: 'idle' | 'checking' | 'valid' | 'invalid'
    message?: string
  }
  type?: 'text' | 'url' | 'email'
  disabled?: boolean
  className?: string
}

export function TextInput({
  value,
  onChange,
  placeholder,
  label,
  hint,
  helpLink,
  validation,
  type = 'text',
  disabled = false,
  className,
}: TextInputProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {/* Label and help link */}
      <div className="flex items-center justify-between">
        <label className={cn('text-sm font-medium', theme.text.primary)}>
          {label}
        </label>
        {helpLink && (
          <a
            href={helpLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('text-xs', theme.text.accent, 'hover:underline')}
          >
            {helpLink.text}
          </a>
        )}
      </div>

      {/* Input */}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          theme.input.base,
          'w-full',
          validation?.status === 'invalid' && theme.input.error,
          validation?.status === 'valid' && 'border-green-500/50',
          disabled && 'opacity-50'
        )}
      />

      {/* Hint text */}
      {hint && !validation?.message && (
        <p className={cn('text-xs', theme.text.muted)}>{hint}</p>
      )}

      {/* Validation feedback */}
      {validation && (
        <InlineValidation
          status={validation.status}
          message={validation.message}
        />
      )}
    </div>
  )
}
