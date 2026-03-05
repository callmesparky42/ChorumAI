export type {
  ChorumClient,
} from './client'

export {
  LocalChorumClient,
  MCPChorumClient,
} from './client'

export type {
  StartSessionParams,
  StartSessionResult,
  ReadNebulaParams,
  ReadNebulaResult,
  GetContextParams,
  GetContextResult,
  InjectLearningParams,
  InjectLearningResult,
  SubmitFeedbackParams,
  SubmitFeedbackResult,
  ExtractLearningsParams,
  ExtractLearningsResult,
  EndSessionParams,
  EndSessionResult,
  UserCustomization,
  AuthContext,
} from './types'

export {
  handleStartSession,
  handleReadNebula,
  handleGetContext,
  handleInjectLearning,
  handleSubmitFeedback,
  handleExtractLearnings,
  handleEndSession,
} from './handlers'

export {
  getUserCustomization,
  updateUserCustomization,
  getEffectiveHalfLife,
  getEffectiveConfidenceFloor,
  getEffectiveQualityThreshold,
} from './config'

export {
  listSeeds,
  getSeed,
  createSeed,
  updateSeed,
  deleteSeed,
  listClusters,
  getCluster,
} from './domain-seeds'

export {
  detectScopes,
} from './scope-detection'

export {
  findProjectByScopes,
} from './project-association'

export {
  createConversation,
  getConversation,
  closeConversation,
} from './sessions'

export {
  extractLearningsFromHistory,
} from './extraction'

export {
  authenticate,
  hasScope,
  enforceOwnership,
} from './auth'
