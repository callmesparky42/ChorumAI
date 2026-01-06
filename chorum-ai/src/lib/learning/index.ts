/**
 * Learning System
 * Pattern learning, invariants, and confidence scoring for Chorum projects.
 *
 * Usage:
 *   import { injectLearningContext, validateResponse, addLearningItem } from '@/lib/learning'
 */

// Types
export type {
    LearningType,
    InvariantCheckType,
    LearningItem,
    LearningItemMetadata,
    ConfidenceMetric,
    FileMetadata,
    CreateLearningItemInput,
    UpdateLearningItemInput,
    SetCriticalFileInput
} from './types'

// Injector
export { injectLearningContext, type LearningContext } from './injector'

// Validator
export { validateResponse, formatValidationSummary, type ValidationResult } from './validator'

// Manager (CRUD)
export {
    // Learning items
    getProjectLearning,
    getProjectLearningByType,
    addLearningItem,
    updateLearningItem,
    deleteLearningItem,
    // Confidence
    getProjectConfidence,
    initializeConfidence,
    updateConfidence,
    // Critical files
    getCriticalFiles,
    setCriticalFile,
    removeCriticalFile
} from './manager'
