/**
 * Wire shapes for a go-assistant-core `adminkit` recommendation
 * surface (e.g. gymtracer/fitniac `backend/modules/coach/admin`):
 *
 *   GET   /admin/coach/recommendations[?kind=&status=&source=&userId=&limit=&cursor=]
 *   GET   /admin/coach/recommendations/stats          → counts by status
 *   GET   /admin/coach/recommendations/kinds          → counts by kind
 *   GET   /admin/coach/recommendations/{id}           → {recommendation, usage}
 *   PATCH /admin/coach/recommendations/{id}           body: {status?, notes?, quality?}
 *
 * A CoachRecommendation is a proactive, audit-logged AI proposal
 * (goal-progress nudge, session insight …) — NOT a chat thread.
 * Field names match the Go struct JSON tags; timestamps are
 * snake_case (record.Base) while everything else is camelCase.
 */

export type CoachStatus = 'new' | 'reviewed' | 'flagged' | 'dismissed'

export interface CoachRecommendation {
  id: string
  userId?: string
  kind: string
  source?: string
  title?: string
  message: string
  locale?: string
  model?: string
  flowId?: string
  runId?: string
  variantLabel?: string
  /** Snapshot of the inputs the recommendation was generated from. */
  context?: Record<string, unknown>
  /** Optional machine-readable payload alongside the prose message. */
  structured?: Record<string, unknown>
  channels?: string[]
  quality?: number
  status: CoachStatus
  notes?: string
  reviewedAt?: string | null
  reviewedBy?: string | null
  created_at: string
  updated_at?: string
}

export interface CoachListFilters {
  kind?: string
  status?: CoachStatus | ''
  source?: string
  userId?: string
  limit?: number
  cursor?: string
}

export interface CoachReviewPatch {
  status?: CoachStatus
  notes?: string
  quality?: number
}

export interface CursorPage<T> {
  items: T[]
  nextCursor?: string
}

/** { counts: { <bucket>: n }, field } — from adminkit StatsHandler. */
export interface CoachStats {
  field: string
  counts: Record<string, number>
}

/** LLM usage roll-up — identical shape to the assistant's ChatUsage. */
export interface CoachUsageTotal {
  calls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number
  avgLatencyMs: number
  errorRate: number
}

export interface CoachUsageBreakdown {
  key: string
  total: CoachUsageTotal
}

export interface CoachUsageSummary {
  total: CoachUsageTotal
  byModel: CoachUsageBreakdown[]
}

/** GET /admin/coach/recommendations/{id} envelope. */
export interface CoachRecommendationDetail {
  recommendation: CoachRecommendation
  usage?: CoachUsageSummary
}
