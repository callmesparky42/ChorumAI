import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users, type OnboardingData } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import {
  type UpdateOnboardingRequest,
  type OnboardingStatus,
  STEP_CONFIG,
  getStepIndex,
  getNextIncompleteStep,
  calculateProgress,
  createInitialOnboardingData,
} from '@/lib/onboarding/types'

/**
 * POST /api/onboarding/update
 *
 * Updates the user's onboarding progress for a specific step.
 * Call this when a user completes or skips a step.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await req.json()) as UpdateOnboardingRequest
    const { step, data: stepData } = body

    if (!step || !STEP_CONFIG[step]) {
      return NextResponse.json({ error: 'Invalid step' }, { status: 400 })
    }

    // Get current user data
    const [user] = await db.select().from(users).where(eq(users.id, session.user.id))

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Initialize or update onboarding data
    const currentData: OnboardingData = user.onboardingData ?? createInitialOnboardingData()

    // Mark step as completed if not already
    if (!currentData.completedSteps.includes(step)) {
      currentData.completedSteps.push(step)
    }

    // Merge any additional step data
    if (stepData) {
      Object.assign(currentData, stepData)
    }

    // Update step-specific fields
    switch (step) {
      case 'environment':
        currentData.envConfigured = true
        currentData.envValidatedAt = new Date().toISOString()
        break
      case 'database':
        currentData.databaseConnected = true
        currentData.databaseTestedAt = new Date().toISOString()
        break
      case 'preferences':
        currentData.preferencesSet = true
        break
    }

    // Calculate new step index
    const stepIndex = getStepIndex(step) + 1

    // Update user record
    await db
      .update(users)
      .set({
        onboardingStep: stepIndex,
        onboardingData: currentData,
      })
      .where(eq(users.id, session.user.id))

    // Build response
    const currentStepName = getNextIncompleteStep(currentData)
    const progress = calculateProgress(currentData)

    const status: OnboardingStatus = {
      completed: false,
      currentStep: stepIndex,
      currentStepName,
      data: currentData,
      progress,
      nextAction: STEP_CONFIG[currentStepName].description,
    }

    return NextResponse.json({ success: true, status })
  } catch (error) {
    console.error('Update onboarding error:', error)
    return NextResponse.json({ error: 'Failed to update onboarding' }, { status: 500 })
  }
}
