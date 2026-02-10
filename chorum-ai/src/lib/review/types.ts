// Peer Review ("Phone a Friend") Types

export type ReviewFocus =
  | 'code'        // Bugs, logic errors, edge cases
  | 'security'    // Vulnerabilities, OWASP issues
  | 'architecture' // Design flaws, scalability
  | 'accuracy'    // Factual errors, hallucinations
  | 'general'     // Overall sanity check

export type ReviewProvider = 'anthropic' | 'openai' | 'google'

export interface ReviewConfig {
  enabled: boolean
  mode: 'manual' | 'auto' | 'agent-initiated'
  defaultFocus: ReviewFocus
  preferredFriend: ReviewProvider | 'auto'  // 'auto' picks different from primary
  writeToMemory: boolean  // Write learned patterns back
}

export interface ReviewRequest {
  // What's being reviewed
  originalTask: string
  response: string
  responseProvider: ReviewProvider

  // Context
  projectId?: string  // For fetching project-specific learning context
  projectContext?: string
  agentName?: string
  agentRole?: string

  // Review parameters
  focus: ReviewFocus
  reviewProvider: ReviewProvider
}

export interface ReviewIssue {
  severity: 'critical' | 'warning' | 'suggestion'
  category: string
  description: string
  location?: string  // e.g., "line 42" or "auth flow"
  suggestion?: string
}

export interface ReviewResult {
  id: string
  reviewedAt: string
  reviewProvider: ReviewProvider
  focus: ReviewFocus

  // Findings
  issues: ReviewIssue[]
  approvals: string[]  // Things that look good

  // Summary
  overallAssessment: 'approved' | 'needs-changes' | 'critical-issues'
  confidence: 'high' | 'medium' | 'low'
  summary: string

  // For memory writeback
  learnedPatterns?: string[]

  // Cost tracking
  costUsd?: number
}

// Default review prompts by focus area
export const REVIEW_PROMPTS: Record<ReviewFocus, string> = {
  code: `You are a senior code reviewer. Analyze the following response for:
- Bugs and logic errors
- Edge cases not handled
- Code smells and anti-patterns
- Performance issues
- Best practices violations

Be specific about locations and provide fixes.`,

  security: `You are a security expert. Analyze the following response for:
- SQL injection vulnerabilities
- XSS vulnerabilities
- Authentication/authorization issues
- Data exposure risks
- OWASP Top 10 vulnerabilities
- Hardcoded secrets or credentials

Flag severity levels and provide secure alternatives.`,

  architecture: `You are a software architect. Analyze the following response for:
- Design flaws
- Scalability concerns
- Maintainability issues
- Coupling and cohesion problems
- Missing abstractions
- Over-engineering

Consider long-term implications.`,

  accuracy: `You are a fact-checker. Analyze the following response for:
- Factual errors
- Outdated information
- Unsupported claims
- Logical inconsistencies
- Potential hallucinations

Flag confidence levels for each finding.`,

  general: `You are a thoughtful peer reviewer. Analyze the following response for:
- Correctness - Does it actually solve the problem?
- Completeness - Is anything missing?
- Clarity - Is it understandable?
- Safety - Any risks or concerns?

Provide a balanced assessment with specific feedback.`
}

// Recommended friend by focus (different perspectives)
export const RECOMMENDED_FRIENDS: Record<ReviewFocus, ReviewProvider> = {
  code: 'google',       // Gemini good at logical analysis
  security: 'openai',   // GPT-4 trained on security patterns
  architecture: 'openai', // GPT-4 good at system thinking
  accuracy: 'anthropic', // Claude good at accuracy/honesty
  general: 'google'     // Gemini as general second opinion
}

// Default configuration
export const DEFAULT_REVIEW_CONFIG: ReviewConfig = {
  enabled: false,
  mode: 'manual',
  defaultFocus: 'general',
  preferredFriend: 'auto',
  writeToMemory: true
}
