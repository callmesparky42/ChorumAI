import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users, type OnboardingData } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createInitialOnboardingData, ONBOARDING_STEPS } from '@/lib/onboarding/types'

/**
 * POST /api/onboarding/complete
 *
 * Marks onboarding as complete and redirects user to main app.
 * Validates that required steps are completed before allowing completion.
 */
export async function POST() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current user data
    const [user] = await db.select().from(users).where(eq(users.id, session.user.id))

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const currentData: OnboardingData = user.onboardingData ?? createInitialOnboardingData()

    // Validate required steps are complete
    const requiredSteps = ['welcome', 'environment', 'database', 'providers'] as const
    const missingSteps = requiredSteps.filter((step) => !currentData.completedSteps.includes(step))

    if (missingSteps.length > 0) {
      return NextResponse.json(
        {
          error: 'Required steps not completed',
          missingSteps,
          message: `Please complete these steps first: ${missingSteps.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Mark onboarding as complete
    currentData.completedAt = new Date().toISOString()

    // Ensure all steps are marked complete
    for (const step of ONBOARDING_STEPS) {
      if (!currentData.completedSteps.includes(step)) {
        currentData.completedSteps.push(step)
      }
    }

    await db
      .update(users)
      .set({
        onboardingCompleted: true,
        onboardingStep: ONBOARDING_STEPS.length,
        onboardingData: currentData,
      })
      .where(eq(users.id, session.user.id))

    return NextResponse.json({
      success: true,
      redirectTo: '/',
      message: 'Onboarding complete! Welcome to ChorumAI.',
    })
  } catch (error) {
    console.error('Complete onboarding error:', error)
    return NextResponse.json({ error: 'Failed to complete onboarding' }, { status: 500 })
  }
}
