import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  ReviewConfig,
  ReviewResult,
  ReviewFocus,
  ReviewProvider,
  DEFAULT_REVIEW_CONFIG,
  RECOMMENDED_FRIENDS
} from './types'

interface ReviewStore {
  // Configuration
  config: ReviewConfig

  // Active reviews (keyed by message ID)
  reviews: Record<string, ReviewResult>

  // Loading states
  pendingReviews: Set<string>

  // Actions
  updateConfig: (updates: Partial<ReviewConfig>) => void
  requestReview: (params: {
    messageId: string
    originalTask: string
    response: string
    responseProvider: ReviewProvider
    projectContext?: string
    agentName?: string
    agentRole?: string
    focus?: ReviewFocus
  }) => Promise<ReviewResult | null>
  clearReview: (messageId: string) => void

  // Helpers
  getRecommendedFriend: (focus: ReviewFocus, primaryProvider: ReviewProvider) => ReviewProvider
  isReviewPending: (messageId: string) => boolean
}

export const useReviewStore = create<ReviewStore>()(
  persist(
    (set, get) => ({
      config: DEFAULT_REVIEW_CONFIG,
      reviews: {},
      pendingReviews: new Set(),

      updateConfig: (updates) => {
        set((state) => {
          const newConfig = { ...state.config, ...updates }
          // When enabling reviews, default to auto mode for convenience
          if (updates.enabled === true && state.config.mode === 'manual') {
            newConfig.mode = 'auto'
          }
          return { config: newConfig }
        })
      },

      requestReview: async (params) => {
        const { config } = get()
        if (!config.enabled && config.mode !== 'manual') {
          return null
        }

        const focus = params.focus || config.defaultFocus

        // Determine which provider to use for review
        let reviewProvider: ReviewProvider
        if (config.preferredFriend === 'auto') {
          reviewProvider = get().getRecommendedFriend(focus, params.responseProvider)
        } else {
          reviewProvider = config.preferredFriend
        }

        // Don't review with the same provider that generated the response
        if (reviewProvider === params.responseProvider) {
          // Pick a different one
          const alternatives: ReviewProvider[] = ['anthropic', 'openai', 'google']
          reviewProvider = alternatives.find(p => p !== params.responseProvider) || 'google'
        }

        // Mark as pending
        set((state) => ({
          pendingReviews: new Set([...state.pendingReviews, params.messageId])
        }))

        try {
          const response = await fetch('/api/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              originalTask: params.originalTask,
              response: params.response,
              responseProvider: params.responseProvider,
              projectContext: params.projectContext,
              agentName: params.agentName,
              agentRole: params.agentRole,
              focus,
              reviewProvider
            })
          })

          if (!response.ok) {
            throw new Error('Review request failed')
          }

          const result: ReviewResult = await response.json()

          // Store the review
          set((state) => ({
            reviews: { ...state.reviews, [params.messageId]: result },
            pendingReviews: new Set([...state.pendingReviews].filter(id => id !== params.messageId))
          }))

          // Write learned patterns to memory if enabled
          if (config.writeToMemory && result.learnedPatterns && result.learnedPatterns.length > 0) {
            writePatternToMemory(result.learnedPatterns, focus)
          }

          return result
        } catch (error) {
          console.error('Review failed:', error)

          // Remove from pending
          set((state) => ({
            pendingReviews: new Set([...state.pendingReviews].filter(id => id !== params.messageId))
          }))

          return null
        }
      },

      clearReview: (messageId) => {
        set((state) => {
          const { [messageId]: _, ...rest } = state.reviews
          return { reviews: rest }
        })
      },

      getRecommendedFriend: (focus, primaryProvider) => {
        const recommended = RECOMMENDED_FRIENDS[focus]

        // If recommended is same as primary, pick alternative
        if (recommended === primaryProvider) {
          const alternatives: ReviewProvider[] = ['anthropic', 'openai', 'google']
          return alternatives.find(p => p !== primaryProvider) || 'google'
        }

        return recommended
      },

      isReviewPending: (messageId) => {
        return get().pendingReviews.has(messageId)
      }
    }),
    {
      name: 'chorum-review',
      partialize: (state) => ({
        config: state.config
        // Don't persist reviews - they're session-specific
      })
    }
  )
)

// Helper to write learned patterns back to memory
async function writePatternToMemory(patterns: string[], focus: ReviewFocus) {
  try {
    await fetch('/api/memory/patterns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patterns,
        source: 'peer-review',
        focus
      })
    })
  } catch (error) {
    console.error('Failed to write patterns to memory:', error)
  }
}
