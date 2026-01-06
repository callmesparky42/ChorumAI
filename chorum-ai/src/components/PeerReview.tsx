'use client'

import { useState } from 'react'
import {
  Users,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  AlertCircle,
  Lightbulb,
  CheckCircle,
  Loader2,
  X,
  DollarSign
} from 'lucide-react'
import clsx from 'clsx'
import { ReviewResult, ReviewIssue, ReviewFocus } from '@/lib/review/types'

interface Props {
  review: ReviewResult | null
  isLoading: boolean
  onRequestReview?: () => void
  onDismiss?: () => void
}

const FOCUS_LABELS: Record<ReviewFocus, string> = {
  code: 'Code Review',
  security: 'Security Review',
  architecture: 'Architecture Review',
  accuracy: 'Accuracy Check',
  general: 'General Review'
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Claude',
  openai: 'GPT-4',
  google: 'Gemini'
}

const SEVERITY_CONFIG: Record<ReviewIssue['severity'], { icon: React.ReactNode; color: string; bg: string }> = {
  critical: {
    icon: <AlertCircle className="w-4 h-4" />,
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/30'
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/30'
  },
  suggestion: {
    icon: <Lightbulb className="w-4 h-4" />,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/30'
  }
}

export function PeerReview({ review, isLoading, onRequestReview, onDismiss }: Props) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [showFullSummary, setShowFullSummary] = useState(false)

  // Loading state
  if (isLoading) {
    return (
      <div className="mt-3 p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Getting second opinion...</span>
        </div>
      </div>
    )
  }

  // No review yet - show request button
  if (!review && onRequestReview) {
    return (
      <button
        onClick={onRequestReview}
        className="mt-2 flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
      >
        <Users className="w-3.5 h-3.5" />
        Get second opinion
      </button>
    )
  }

  if (!review) return null

  const hasIssues = review.issues.length > 0
  const criticalCount = review.issues.filter(i => i.severity === 'critical').length
  const warningCount = review.issues.filter(i => i.severity === 'warning').length

  return (
    <div className={clsx(
      'mt-3 rounded-lg border overflow-hidden transition-all',
      review.overallAssessment === 'critical-issues' && 'border-red-500/50 bg-red-500/5',
      review.overallAssessment === 'needs-changes' && 'border-amber-500/50 bg-amber-500/5',
      review.overallAssessment === 'approved' && 'border-green-500/50 bg-green-500/5'
    )}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-300">
            Peer Review
          </span>
          <span className="text-xs text-gray-500">
            ({PROVIDER_LABELS[review.reviewProvider] || review.reviewProvider})
          </span>

          {/* Status badges */}
          {review.overallAssessment === 'approved' && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
              <CheckCircle className="w-3 h-3" />
              Approved
            </span>
          )}
          {criticalCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
              <AlertCircle className="w-3 h-3" />
              {criticalCount} Critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full">
              <AlertTriangle className="w-3 h-3" />
              {warningCount} Warning{warningCount > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {review.costUsd && (
            <span className="flex items-center gap-0.5 text-xs text-green-500/70">
              <DollarSign className="w-3 h-3" />
              {review.costUsd.toFixed(4)}
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Issues */}
          {review.issues.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Issues Found</p>
              {review.issues.map((issue, index) => {
                const config = SEVERITY_CONFIG[issue.severity]
                return (
                  <div
                    key={index}
                    className={clsx('p-2 rounded border', config.bg)}
                  >
                    <div className={clsx('flex items-start gap-2', config.color)}>
                      {config.icon}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{issue.description}</p>
                        {issue.location && (
                          <p className="text-xs opacity-70 mt-0.5">{issue.location}</p>
                        )}
                        {issue.suggestion && (
                          <p className="text-xs text-gray-400 mt-1">
                            Suggestion: {issue.suggestion}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Approvals */}
          {review.approvals.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">What Looks Good</p>
              {review.approvals.map((approval, index) => (
                <div key={index} className="flex items-start gap-2 text-green-400/80">
                  <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <p className="text-sm">{approval}</p>
                </div>
              ))}
            </div>
          )}

          {/* Learned Patterns */}
          {review.learnedPatterns && review.learnedPatterns.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-gray-700/50">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center gap-1">
                <Lightbulb className="w-3 h-3" />
                Patterns to Remember
              </p>
              {review.learnedPatterns.map((pattern, index) => (
                <p key={index} className="text-xs text-gray-400 pl-4">
                  • {pattern}
                </p>
              ))}
              <p className="text-xs text-gray-600 italic mt-1">
                These patterns have been saved to project memory
              </p>
            </div>
          )}

          {/* Full summary toggle */}
          {review.summary && (
            <div className="pt-2 border-t border-gray-700/50">
              <button
                onClick={() => setShowFullSummary(!showFullSummary)}
                className="text-xs text-gray-500 hover:text-gray-400"
              >
                {showFullSummary ? 'Hide' : 'Show'} full review
              </button>
              {showFullSummary && (
                <div className="mt-2 p-2 bg-gray-900/50 rounded text-xs text-gray-400 whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {review.summary}
                </div>
              )}
            </div>
          )}

          {/* Dismiss */}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-400"
            >
              <X className="w-3 h-3" />
              Dismiss review
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Compact version for inline use
export function PeerReviewBadge({ review }: { review: ReviewResult | null }) {
  if (!review) return null

  const criticalCount = review.issues.filter(i => i.severity === 'critical').length
  const warningCount = review.issues.filter(i => i.severity === 'warning').length

  if (review.overallAssessment === 'approved') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
        <CheckCircle className="w-3 h-3" />
        Reviewed
      </span>
    )
  }

  if (criticalCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">
        <AlertCircle className="w-3 h-3" />
        {criticalCount} issue{criticalCount > 1 ? 's' : ''}
      </span>
    )
  }

  if (warningCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded">
        <AlertTriangle className="w-3 h-3" />
        {warningCount} warning{warningCount > 1 ? 's' : ''}
      </span>
    )
  }

  return null
}
