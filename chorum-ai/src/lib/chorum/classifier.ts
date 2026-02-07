/**
 * Relevance Classifier
 * Analyzing query complexity to assign token budgets for memory injection.
 * Runs locally (rule-based) for <5ms latency.
 */

export type QueryComplexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'deep'
export type QueryIntent = 'question' | 'generation' | 'analysis' | 'debugging' | 'discussion' | 'continuation' | 'greeting'

export interface QueryClassification {
    complexity: QueryComplexity
    intent: QueryIntent
    domains: string[]
    conversationDepth: number
    hasCodeContext: boolean
    referencesHistory: boolean
}

export interface TokenBudget {
    maxTokens: number // The ceiling for memory injection
    description: string // e.g. "Low budget for simple query"
}

// ============================================================================
// Classification Thresholds (tunable)
// ============================================================================

/** Message length thresholds for complexity classification */
const THRESHOLDS = {
    /** Messages shorter than this are likely greetings */
    GREETING_MAX_LENGTH: 20,
    /** Messages shorter than this (without history ref) are trivial */
    TRIVIAL_MAX_LENGTH: 10,
    /** Code context messages longer than this are complex */
    COMPLEX_CODE_LENGTH: 200,
    /** Messages longer than this are deep complexity */
    DEEP_LENGTH: 500,
    /** Conversation depth that triggers deep complexity */
    DEEP_CONVERSATION_DEPTH: 20
}

/** Token budgets per complexity level */
const TOKEN_BUDGETS = {
    trivial: 0,
    simple: 500,
    moderate: 2000,
    complex: 5000,
    deep: 8000
}

/** Budget modifiers */
const BUDGET_MODIFIERS = {
    /** Multiplier when query references history */
    HISTORY_REFERENCE: 1.5,
    /** Multiplier for deep conversations (>10 messages) */
    DEEP_CONVERSATION: 1.2,
    /** Multiplier for analysis intent */
    ANALYSIS_INTENT: 1.2,
    /** Conversation depth threshold for modifier */
    CONVERSATION_DEPTH_THRESHOLD: 10,
    /** Absolute ceiling - never exceed this */
    MAX_CEILING: 10000
}

// Keywords that suggest historical reference
const HISTORY_KEYWORDS = ['we', 'our', 'before', 'previous', 'last time', 'remember', 'earlier', 'discussed', 'said']
const CODE_KEYWORDS = ['function', 'class', 'const', 'let', 'var', 'import', 'export', 'interface', 'type', 'async', 'await', 'return']

export class RelevanceClassifier {

    public classify(text: string, conversationDepth: number): QueryClassification {
        const lower = text.toLowerCase()
        const words = lower.split(/\s+/)
        const length = text.length

        // 1. Detect Intent
        let intent: QueryIntent = 'question'
        if (length < THRESHOLDS.GREETING_MAX_LENGTH && (lower.includes('hi') || lower.includes('hello') || lower.includes('thanks'))) {
            intent = 'greeting'
        } else if (lower.includes('write') || lower.includes('generate') || lower.includes('create') || lower.includes('implement')) {
            intent = 'generation'
        } else if (lower.includes('debug') || lower.includes('fix') || lower.includes('error') || lower.includes('bug') || lower.includes('crash') || lower.includes('failing') || lower.includes('broken') || lower.includes('not working')) {
            intent = 'debugging'
        } else if (lower.includes('why') || lower.includes('analyze') || lower.includes('explain')) {
            intent = 'analysis'
        } else if (lower.includes('what') || lower.includes('how') || lower.includes('?')) {
            intent = 'question'
        } else {
            intent = 'discussion'
        }

        // 2. Detect Code Context
        const hasCodeContext = text.includes('```') || CODE_KEYWORDS.some(k => words.includes(k))

        // 3. Detect History Reference
        const referencesHistory = HISTORY_KEYWORDS.some(k => lower.includes(k))

        // 4. Determine Complexity
        let complexity: QueryComplexity = 'simple'

        if (intent === 'greeting' || (length < THRESHOLDS.TRIVIAL_MAX_LENGTH && !referencesHistory)) {
            complexity = 'trivial'
        } else if (intent === 'analysis' || intent === 'debugging' || (hasCodeContext && length > THRESHOLDS.COMPLEX_CODE_LENGTH)) {
            complexity = 'complex'
        } else if (intent === 'generation' || hasCodeContext) {
            complexity = 'moderate'
        } else if (length > THRESHOLDS.DEEP_LENGTH || conversationDepth > THRESHOLDS.DEEP_CONVERSATION_DEPTH) {
            complexity = 'deep'
        }

        // 5. Extract Domains (Simple keyword matching for now)
        // Ideally this matches against a known list of tags in DB
        const domains: string[] = []
        if (hasCodeContext) domains.push('coding')
        if (lower.includes('test')) domains.push('testing')
        if (lower.includes('db') || lower.includes('database') || lower.includes('sql')) domains.push('database')
        if (lower.includes('auth') || lower.includes('login') || lower.includes('security')) domains.push('security')
        if (lower.includes('ui') || lower.includes('css') || lower.includes('component')) domains.push('frontend')

        return {
            complexity,
            intent,
            domains,
            conversationDepth,
            hasCodeContext,
            referencesHistory
        }
    }

    public calculateBudget(classification: QueryClassification): TokenBudget {
        // Get base budget from complexity level
        let base = TOKEN_BUDGETS[classification.complexity]

        // Apply modifiers
        if (classification.referencesHistory) {
            base *= BUDGET_MODIFIERS.HISTORY_REFERENCE
        }
        if (classification.conversationDepth > BUDGET_MODIFIERS.CONVERSATION_DEPTH_THRESHOLD) {
            base *= BUDGET_MODIFIERS.DEEP_CONVERSATION
        }
        if (classification.intent === 'analysis' || classification.intent === 'debugging') {
            base *= BUDGET_MODIFIERS.ANALYSIS_INTENT
        }

        // Enforce hard ceiling
        const budget = Math.min(Math.floor(base), BUDGET_MODIFIERS.MAX_CEILING)

        return {
            maxTokens: budget,
            description: `${classification.complexity} complexity (${budget} tokens)`
        }
    }
}

export const classifier = new RelevanceClassifier()
