'use client'

import { useEffect } from 'react'
import { useOnboardingStore } from '@/lib/onboarding'
import { theme, cn } from '@/lib/theme'
import { Zap, Shield, Layers, Clock } from 'lucide-react'
import Image from 'next/image'

const FEATURES = [
  {
    icon: Layers,
    title: 'Multi-Provider Routing',
    description: 'Connect OpenAI, Anthropic, Google, and more. Route requests intelligently.',
  },
  {
    icon: Zap,
    title: 'Cost Optimization',
    description: 'Automatically choose the most cost-effective model for each task.',
  },
  {
    icon: Shield,
    title: 'Privacy First',
    description: 'Your API keys are encrypted locally. No data sent to our servers.',
  },
  {
    icon: Clock,
    title: 'Smart Fallbacks',
    description: 'Automatic failover when providers are unavailable.',
  },
]

export function WelcomeStep() {
  const { setStepValidation, markStepComplete } = useOnboardingStore()

  // Welcome step is always valid
  useEffect(() => {
    setStepValidation('welcome', {
      isValid: true,
      errors: [],
      warnings: [],
    })
    markStepComplete('welcome')
  }, [setStepValidation, markStepComplete])

  return (
    <div className="space-y-8">
      {/* Hero section */}
      <div className="text-center py-8">
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Image
              src="/logo.png"
              alt="ChorumAI"
              width={48}
              height={48}
              className="rounded-lg"
            />
          </div>
        </div>
        <h2 className={cn('text-3xl font-bold mb-3', theme.text.primary)}>
          Welcome to ChorumAI
        </h2>
        <p className={cn('text-lg max-w-md mx-auto', theme.text.secondary)}>
          Your intelligent LLM router. Connect multiple AI providers,
          optimize costs, and build with confidence.
        </p>
      </div>

      {/* Features grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {FEATURES.map((feature) => (
          <div
            key={feature.title}
            className={cn(
              'p-4 rounded-xl border',
              theme.bg.elevated,
              theme.border.default
            )}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <feature.icon className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className={cn('font-medium mb-1', theme.text.primary)}>
                  {feature.title}
                </h3>
                <p className={cn('text-sm', theme.text.secondary)}>
                  {feature.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Time estimate */}
      <div className="text-center pt-4">
        <p className={cn('text-sm', theme.text.muted)}>
          Setup takes about <span className="text-white font-medium">2 minutes</span>
        </p>
      </div>
    </div>
  )
}
