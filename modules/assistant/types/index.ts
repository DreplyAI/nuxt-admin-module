/**
 * Wire shapes for backend/modules/assistant/admin. Field names match
 * the Go struct JSON tags (camelCase).
 */

export interface AssistantMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  runId?: string
}

export interface AssistantChat {
  id: string
  sessionId: string
  userId?: string
  // anonId is stamped for unauthenticated callers — "anon-<client-ip>".
  // Exactly one of userId / anonId is set per chat; the admin list
  // renders whichever is present so every row has a recognisable
  // subject identifier instead of a blank column for guest traffic.
  anonId?: string
  flowId?: string
  versionHash?: string
  variantLabel?: string
  messages?: AssistantMessage[]
  runIds?: string[]
  startedAt: string
  lastAt: string
  expiresAt?: string
  handoffId?: string
  meta?: Record<string, unknown>
  // Wire uses snake_case for timestamps but camelCase for everything
  // else — matches what backend/modules/assistant/chats returns.
  created_at: string
  updated_at?: string
}

export type HandoffStatus = 'pending' | 'contacted' | 'resolved' | 'dismissed'

export type HandoffPriority = 'low' | 'normal' | 'high'

export interface AssistantHandoff {
  id: string
  chatId: string
  sessionId?: string
  userId?: string
  email?: string
  phone?: string
  reason?: string
  transcript?: string
  priority: HandoffPriority
  status: HandoffStatus
  contactedAt?: string | null
  contactedBy?: string | null
  notes?: string
  // Same snake_case timestamp pattern as AssistantChat.
  created_at: string
  updated_at?: string
}

export interface ChatListFilters {
  /** Brand / tenant code; defaults to the admin's picked channel (useChannel). '' = all. */
  tenant?: string
  userId?: string
  flowId?: string
  variantLabel?: string
  limit?: number
  cursor?: string
}

export interface HandoffListFilters {
  /** Brand / tenant code; defaults to the admin's picked channel (useChannel). '' = all. */
  tenant?: string
  status?: HandoffStatus
  limit?: number
  cursor?: string
}

export interface HandoffPatch {
  status?: HandoffStatus
  notes?: string
}

export interface CursorPage<T> {
  items: T[]
  nextCursor?: string
}

/**
 * Aggregate roll-up of LLM usage for a single chat. Returned inline
 * on GET /admin/assistant/chats/{id} so the detail page doesn't need
 * a second round-trip to render a cost + token summary.
 */
export interface ChatUsageTotal {
  calls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number
  avgLatencyMs: number
  errorRate: number
}

export interface ChatUsageBreakdown {
  key: string
  total: ChatUsageTotal
}

export interface ChatUsageSummary {
  total: ChatUsageTotal
  byModel: ChatUsageBreakdown[]
}

/**
 * Enriched chat detail — same shape as AssistantChat plus two
 * server-side enrichment fields so the UI renders all per-chat
 * context in one request:
 *   - flowName: human-readable flow title (falls back to flowId)
 *   - usage:    LLM cost + token roll-up across every run in the
 *               transcript, plus a per-model breakdown
 */
export interface AssistantChatDetail extends AssistantChat {
  flowName?: string
  usage?: ChatUsageSummary
}

