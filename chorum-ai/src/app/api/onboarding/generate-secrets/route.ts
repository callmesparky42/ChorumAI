import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { randomBytes } from 'crypto'
import type { GenerateSecretsRequest, GenerateSecretsResponse } from '@/lib/onboarding/types'

/**
 * POST /api/onboarding/generate-secrets
 *
 * Generates cryptographically secure secrets for ENCRYPTION_KEY and AUTH_SECRET.
 * Returns the generated values along with instructions for adding them to .env.local.
 *
 * Security note: These secrets are generated server-side and returned once.
 * The user must copy them to their .env.local file manually.
 * We don't write to .env.local directly for security reasons.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as GenerateSecretsRequest
    const { variables = ['ENCRYPTION_KEY', 'AUTH_SECRET'] } = body

    const generated: Record<string, string> = {}

    for (const varName of variables) {
      switch (varName) {
        case 'ENCRYPTION_KEY':
          // 32 bytes = 64 hex characters for AES-256
          generated.ENCRYPTION_KEY = randomBytes(32).toString('hex')
          break

        case 'AUTH_SECRET':
          // 32 bytes base64 encoded for NextAuth
          generated.AUTH_SECRET = randomBytes(32).toString('base64')
          break

        default:
          // Skip unknown variables
          break
      }
    }

    // Build .env.local snippet
    const envLines = Object.entries(generated)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')

    const writeInstructions = `Add the following to your .env.local file:

\`\`\`
${envLines}
\`\`\`

Important:
- These secrets are generated fresh each time
- Copy them now - they won't be shown again
- Never commit .env.local to version control
- Restart your development server after changes`

    const response: GenerateSecretsResponse = {
      generated,
      writeInstructions,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Generate secrets error:', error)
    return NextResponse.json({ error: 'Failed to generate secrets' }, { status: 500 })
  }
}
