import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  type EnvValidationResult,
  type EnvVariable,
  ENV_REQUIREMENTS,
} from '@/lib/onboarding/types'

/**
 * GET /api/onboarding/validate-env
 *
 * Validates current environment variables against requirements.
 * Returns status of each required and optional variable.
 *
 * Note: This endpoint reads server-side environment variables,
 * so it only works when running the actual server (not in browser).
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const variables: EnvValidationResult['variables'] = []
    let allRequiredPresent = true
    let allRequiredValid = true

    // Check each environment variable
    for (const [name, config] of Object.entries(ENV_REQUIREMENTS)) {
      const value = process.env[name]
      let status: 'present' | 'missing' | 'invalid' = 'missing'

      if (value) {
        if (config.validation) {
          status = config.validation(value) ? 'present' : 'invalid'
          if (status === 'invalid' && config.required) {
            allRequiredValid = false
          }
        } else {
          status = 'present'
        }
      } else if (config.required) {
        allRequiredPresent = false
      }

      variables.push({
        name,
        status,
        required: config.required,
        hint: config.hint,
      })
    }

    // Check if .env.local would be configured (heuristic: at least one required var present)
    const configured = variables.some((v) => v.required && v.status === 'present')

    // Check if at least one LLM provider is configured
    const llmProviders: EnvVariable[] = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_API_KEY']
    const hasLlmProvider = llmProviders.some((provider) => {
      const varInfo = variables.find((v) => v.name === provider)
      return varInfo?.status === 'present'
    })

    // Add a hint about LLM providers if none configured
    if (!hasLlmProvider) {
      const llmVars = variables.filter((v) => llmProviders.includes(v.name as EnvVariable))
      llmVars.forEach((v) => {
        v.hint = (v.hint ?? '') + ' (At least one LLM provider recommended)'
      })
    }

    const result: EnvValidationResult = {
      valid: allRequiredPresent && allRequiredValid,
      configured,
      variables,
      canProceed: allRequiredPresent && allRequiredValid,
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Validate env error:', error)
    return NextResponse.json({ error: 'Failed to validate environment' }, { status: 500 })
  }
}
