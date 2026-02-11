// MCP Server Mode Types

export type LearningType = 'pattern' | 'antipattern' | 'decision' | 'invariant' | 'goldenPath'

export interface QueryMemoryInput {
  projectId: string
  query: string
  types?: LearningType[]
  maxTokens?: number
  includeContext?: boolean
}

export interface QueryMemoryOutput {
  items: {
    id: string
    type: LearningType
    content: string
    context?: string
    relevanceScore: number
    createdAt: string
  }[]
  tokenCount: number
  projectName: string
}

export interface GetInvariantsInput {
  projectId: string
}

export interface GetInvariantsOutput {
  invariants: {
    id: string
    content: string
    checkType?: 'keyword' | 'regex' | 'semantic'
    checkValue?: string
    severity: 'warning' | 'error'
  }[]
}

export interface GetProjectContextInput {
  projectId: string
}

export interface GetProjectContextOutput {
  name: string
  description: string
  techStack: string[]
  customInstructions: string
  confidence: {
    score: number
    interactionCount: number
  }
  criticalFiles: string[]
}

export interface GetDomainSignalInput {
  projectId: string
  recompute?: boolean
}

export interface GetDomainSignalOutput {
  primary: string
  domains: { domain: string; confidence: number; evidence: number }[]
  conversationsAnalyzed: number
  computedAt: string
}

export interface ListProjectsInput {}

export interface ListProjectsOutput {
  projects: {
    id: string
    name: string
    lastActivity: string
  }[]
}

export interface ProposeLearningInput {
  projectId: string
  type: LearningType
  content: string
  context?: string
  source: string
}

export interface ProposeLearningOutput {
  proposalId: string
  status: 'pending_approval'
  message: string
}

export interface LogInteractionInput {
  projectId: string
  source: string
  queryType: 'trivial' | 'moderate' | 'complex' | 'critical'
}

export interface LogInteractionOutput {
  success: boolean
  newConfidenceScore: number
}

export interface ImportAnalyzeInput {
  data: Record<string, unknown>
  storeConversations?: boolean
  maxConversations?: number
  projectId?: string
}

export interface ImportAnalyzeOutput {
  success: boolean
  format: string
  domainSignal: {
    primary: string
    domains: { domain: string; confidence: number; evidence: number }[]
    conversationsAnalyzed: number
    computedAt: string
  }
  stats: {
    conversationsProcessed: number
    conversationsSkipped: number
    learningsStored: number
    duplicatesFound: number
    learningsMerged: number
    errors: string[]
  }
  parseWarnings: string[]
}

// MCP Server context passed to all tool handlers
export interface McpContext {
  userId: string
  permissions: {
    read: boolean
    write: boolean
    projects: string[] | 'all'
  }
}

// API Token permissions type
export interface TokenPermissions {
  read: boolean
  write: boolean
  projects: string[] | 'all'
}
