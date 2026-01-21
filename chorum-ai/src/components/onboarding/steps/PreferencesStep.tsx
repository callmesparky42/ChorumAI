'use client'

import { useEffect } from 'react'
import { useOnboardingStore } from '@/lib/onboarding'
import { theme, cn } from '@/lib/theme'
import { Brain, Shield, RefreshCw, Info } from 'lucide-react'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        checked ? 'bg-blue-600' : 'bg-gray-700',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  )
}

interface SettingRowProps {
  icon: React.ElementType
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}

function SettingRow({ icon: Icon, title, description, checked, onChange }: SettingRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-gray-400" />
        </div>
        <div>
          <h4 className={cn('font-medium', theme.text.primary)}>{title}</h4>
          <p className={cn('text-sm mt-0.5', theme.text.secondary)}>{description}</p>
        </div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

export function PreferencesStep() {
  const {
    formData,
    updateNestedFormData,
    setStepValidation,
    markStepComplete,
  } = useOnboardingStore()

  const { memorySettings, securitySettings, fallbackSettings } = formData.preferences

  // Preferences are always valid (optional step)
  useEffect(() => {
    setStepValidation('preferences', {
      isValid: true,
      errors: [],
      warnings: [],
    })
    markStepComplete('preferences')
  }, [setStepValidation, markStepComplete])

  return (
    <div className="space-y-6">
      {/* Info banner */}
      <div
        className={cn(
          'p-4 rounded-xl border flex items-start gap-3',
          'bg-blue-500/10 border-blue-500/20'
        )}
      >
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className={cn('text-sm', theme.text.primary)}>
            These are smart defaults that work for most users.
            You can adjust them anytime in Settings.
          </p>
        </div>
      </div>

      {/* Memory & Learning */}
      <div className={cn('rounded-xl border', theme.bg.elevated, theme.border.default)}>
        <div className="px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" />
            <h3 className={cn('font-medium', theme.text.primary)}>Memory & Learning</h3>
          </div>
        </div>
        <div className="px-4 divide-y divide-gray-800">
          <SettingRow
            icon={Brain}
            title="Auto-Learn"
            description="Extract patterns from conversations to improve responses"
            checked={memorySettings.autoLearn}
            onChange={(checked) =>
              updateNestedFormData('preferences', 'memorySettings', {
                ...memorySettings,
                autoLearn: checked,
              })
            }
          />
          <SettingRow
            icon={Brain}
            title="Inject Context"
            description="Use learned patterns to enhance prompts automatically"
            checked={memorySettings.injectContext}
            onChange={(checked) =>
              updateNestedFormData('preferences', 'memorySettings', {
                ...memorySettings,
                injectContext: checked,
              })
            }
          />
          <SettingRow
            icon={Brain}
            title="Auto-Summarize"
            description="Summarize old conversations to save context space"
            checked={memorySettings.autoSummarize}
            onChange={(checked) =>
              updateNestedFormData('preferences', 'memorySettings', {
                ...memorySettings,
                autoSummarize: checked,
              })
            }
          />
        </div>
      </div>

      {/* Security */}
      <div className={cn('rounded-xl border', theme.bg.elevated, theme.border.default)}>
        <div className="px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-green-400" />
            <h3 className={cn('font-medium', theme.text.primary)}>Security</h3>
          </div>
        </div>
        <div className="px-4 divide-y divide-gray-800">
          <SettingRow
            icon={Shield}
            title="Enforce HTTPS"
            description="Only allow secure connections to LLM providers"
            checked={securitySettings.enforceHttps}
            onChange={(checked) =>
              updateNestedFormData('preferences', 'securitySettings', {
                ...securitySettings,
                enforceHttps: checked,
              })
            }
          />
          <SettingRow
            icon={Shield}
            title="Anonymize PII"
            description="Redact personally identifiable information before sending"
            checked={securitySettings.anonymizePii}
            onChange={(checked) =>
              updateNestedFormData('preferences', 'securitySettings', {
                ...securitySettings,
                anonymizePii: checked,
              })
            }
          />
        </div>
      </div>

      {/* Resilience */}
      <div className={cn('rounded-xl border', theme.bg.elevated, theme.border.default)}>
        <div className="px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-blue-400" />
            <h3 className={cn('font-medium', theme.text.primary)}>Resilience</h3>
          </div>
        </div>
        <div className="px-4 divide-y divide-gray-800">
          <SettingRow
            icon={RefreshCw}
            title="Automatic Fallback"
            description="Switch to backup providers when the primary is unavailable"
            checked={fallbackSettings.enabled}
            onChange={(checked) =>
              updateNestedFormData('preferences', 'fallbackSettings', {
                ...fallbackSettings,
                enabled: checked,
              })
            }
          />
        </div>
      </div>
    </div>
  )
}
