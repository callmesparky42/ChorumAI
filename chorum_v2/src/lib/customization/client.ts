import type {
  AuthContext,
  EndSessionParams,
  EndSessionResult,
  ExtractLearningsParams,
  ExtractLearningsResult,
  GetContextParams,
  GetContextResult,
  InjectLearningParams,
  InjectLearningResult,
  MCPResponse,
  ReadNebulaParams,
  ReadNebulaResult,
  StartSessionParams,
  StartSessionResult,
  SubmitFeedbackParams,
  SubmitFeedbackResult,
} from './types'
import {
  handleEndSession,
  handleExtractLearnings,
  handleGetContext,
  handleInjectLearning,
  handleReadNebula,
  handleStartSession,
  handleSubmitFeedback,
} from './handlers'

export interface ChorumClient {
  startSession(params: StartSessionParams): Promise<StartSessionResult>
  readNebula(params: ReadNebulaParams): Promise<ReadNebulaResult>
  getContext(params: GetContextParams): Promise<GetContextResult>
  injectLearning(params: InjectLearningParams): Promise<InjectLearningResult>
  submitFeedback(params: SubmitFeedbackParams): Promise<SubmitFeedbackResult>
  extractLearnings(params: ExtractLearningsParams): Promise<ExtractLearningsResult>
  endSession(params: EndSessionParams): Promise<EndSessionResult>
}

export class LocalChorumClient implements ChorumClient {
  constructor(private auth: AuthContext) {}

  async startSession(params: StartSessionParams): Promise<StartSessionResult> {
    return handleStartSession(params, this.auth)
  }

  async readNebula(params: ReadNebulaParams): Promise<ReadNebulaResult> {
    return handleReadNebula(params, this.auth)
  }

  async getContext(params: GetContextParams): Promise<GetContextResult> {
    return handleGetContext(params, this.auth)
  }

  async injectLearning(params: InjectLearningParams): Promise<InjectLearningResult> {
    return handleInjectLearning(params, this.auth)
  }

  async submitFeedback(params: SubmitFeedbackParams): Promise<SubmitFeedbackResult> {
    return handleSubmitFeedback(params, this.auth)
  }

  async extractLearnings(params: ExtractLearningsParams): Promise<ExtractLearningsResult> {
    return handleExtractLearnings(params, this.auth)
  }

  async endSession(params: EndSessionParams): Promise<EndSessionResult> {
    return handleEndSession(params, this.auth)
  }
}

export class MCPChorumClient implements ChorumClient {
  constructor(
    private baseUrl: string,
    private bearerToken: string,
  ) {}

  private async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.bearerToken}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`MCP request failed (${response.status}): ${text}`)
    }

    const json = (await response.json()) as MCPResponse
    if (json.error) {
      throw new Error(`MCP error ${json.error.code}: ${json.error.message}`)
    }

    return json.result as T
  }

  async readNebula(params: ReadNebulaParams): Promise<ReadNebulaResult> {
    return this.call('read_nebula', params as unknown as Record<string, unknown>)
  }

  async startSession(params: StartSessionParams): Promise<StartSessionResult> {
    return this.call('start_session', params as unknown as Record<string, unknown>)
  }

  async getContext(params: GetContextParams): Promise<GetContextResult> {
    return this.call('get_context', params as unknown as Record<string, unknown>)
  }

  async injectLearning(params: InjectLearningParams): Promise<InjectLearningResult> {
    return this.call('inject_learning', params as unknown as Record<string, unknown>)
  }

  async submitFeedback(params: SubmitFeedbackParams): Promise<SubmitFeedbackResult> {
    return this.call('submit_feedback', params as unknown as Record<string, unknown>)
  }

  async extractLearnings(params: ExtractLearningsParams): Promise<ExtractLearningsResult> {
    return this.call('extract_learnings', params as unknown as Record<string, unknown>)
  }

  async endSession(params: EndSessionParams): Promise<EndSessionResult> {
    return this.call('end_session', params as unknown as Record<string, unknown>)
  }
}
