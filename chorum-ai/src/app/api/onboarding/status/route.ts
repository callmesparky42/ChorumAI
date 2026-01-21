import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import {
  type OnboardingStatus,
  getNextIncompleteStep,
  calculateProgress,
  STEP_CONFIG,
} from '@/lib/onboarding/types'

/**
 * GET /api/onboarding/status
 *
 * Returns the current onboarding status for the authenticated user.
 * Used to determine whether to show the wizard and which step to display.
 */
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [user] = await db.select().from(users).where(eq(users.id, session.user.id))

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const currentStepName = getNextIncompleteStep(user.onboardingData)
    const progress = calculateProgress(user.onboardingData)

    const status: OnboardingStatus = {
      completed: user.onboardingCompleted ?? false,
      currentStep: user.onboardingStep ?? 0,
      currentStepName,
      data: user.onboardingData ?? null,
      progress,
      nextAction: user.onboardingCompleted
        ? undefined
        : STEP_CONFIG[currentStepName].description,
    }

    return NextResponse.json(status)
  } catch (error) {
    console.error('Onboarding status error:', error)
    return NextResponse.json({ error: 'Failed to fetch onboarding status' }, { status: 500 })
  }
}
