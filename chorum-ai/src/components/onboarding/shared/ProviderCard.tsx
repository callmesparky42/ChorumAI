'use client'

import { onboarding as onboardingTheme, theme, cn } from '@/lib/theme'
import { Check } from 'lucide-react'

// Provider metadata for display
export const PROVIDER_INFO: Record<
  string,
  {
    name: string
    icon: string // Path to icon in /public/providers/
    color: string
    description: string
    isLocal: boolean
    keyPrefix?: string
    helpUrl: string
  }
> = {
  anthropic: {
    name: 'Anthropic',
    icon: '/providers/anthropic.svg',
    color: 'bg-orange-500/20',
    description: 'Claude models - excellent for reasoning',
    isLocal: false,
    keyPrefix: 'sk-ant-',
    helpUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    name: 'OpenAI',
    icon: '/providers/openai.svg',
    color: 'bg-green-500/20',
    description: 'GPT models - versatile and widely used',
    isLocal: false,
    keyPrefix: 'sk-',
    helpUrl: 'https://platform.openai.com/api-keys',
  },
  google: {
    name: 'Google AI',
    icon: '/providers/google.svg',
    color: 'bg-blue-500/20',
    description: 'Gemini models - long context, multimodal',
    isLocal: false,
    helpUrl: 'https://aistudio.google.com/app/apikey',
  },
  perplexity: {
    name: 'Perplexity',
    icon: '/providers/perplexity.svg',
    color: 'bg-teal-500/20',
    description: 'Search-augmented AI - real-time knowledge',
    isLocal: false,
    keyPrefix: 'pplx-',
    helpUrl: 'https://www.perplexity.ai/settings/api',
  },
  deepseek: {
    name: 'DeepSeek',
    icon: '/providers/deepseek.svg',
    color: 'bg-cyan-500/20',
    description: 'Cost-effective - great for code',
    isLocal: false,
    helpUrl: 'https://platform.deepseek.com/api_keys',
  },
  ollama: {
    name: 'Ollama',
    icon: '/providers/ollama.svg',
    color: 'bg-gray-500/20',
    description: 'Run models locally - privacy first',
    isLocal: true,
    helpUrl: 'https://ollama.com/download',
  },
  lmstudio: {
    name: 'LM Studio',
    icon: '/providers/lmstudio.svg',
    color: 'bg-indigo-500/20',
    description: 'Local models with GUI',
    isLocal: true,
    helpUrl: 'https://lmstudio.ai/',
  },
}

interface ProviderCardProps {
  provider: string
  selected: boolean
  onSelect: () => void
  disabled?: boolean
}

export function ProviderCard({
  provider,
  selected,
  onSelect,
  disabled = false,
}: ProviderCardProps) {
  const info = PROVIDER_INFO[provider]
  if (!info) return null

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        onboardingTheme.provider.card,
        selected && onboardingTheme.provider.selected,
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={cn(onboardingTheme.provider.icon, info.color)}>
          {/* Fallback to initials if no icon */}
          <span className={cn('text-lg font-bold', theme.text.primary)}>
            {info.name.charAt(0)}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className={cn('font-medium', theme.text.primary)}>
              {info.name}
            </span>
            {info.isLocal && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                Local
              </span>
            )}
          </div>
          <p className={cn('text-sm mt-1', theme.text.secondary)}>
            {info.description}
          </p>
        </div>

        {/* Selection indicator */}
        {selected && (
          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
            <Check className="w-4 h-4 text-white" />
          </div>
        )}
      </div>
    </button>
  )
}

// Compact version for showing configured providers
interface ProviderBadgeProps {
  provider: string
  validated?: boolean
  onRemove?: () => void
}

export function ProviderBadge({ provider, validated, onRemove }: ProviderBadgeProps) {
  const info = PROVIDER_INFO[provider]
  if (!info) return null

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg',
        theme.bg.muted,
        'border',
        theme.border.default
      )}
    >
      <span className={cn('text-sm', theme.text.primary)}>{info.name}</span>
      {validated && <Check className="w-3.5 h-3.5 text-green-400" />}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-gray-500 hover:text-red-400 transition-colors"
        >
          ×
        </button>
      )}
    </div>
  )
}
