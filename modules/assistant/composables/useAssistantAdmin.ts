// $apiFetch is auto-imported from the base layer's
// composables/useApiFetch.ts. A `~/composables/useApiFetch` import
// would fail here because `~` resolves to THIS project's root at
// vite-node runtime, and the project doesn't own the file — it
// lives in js-admin-nuxt4 which we extend via Nuxt layers.
import type {
  AssistantChat,
  AssistantChatDetail,
  AssistantHandoff,
  ChatListPage,
  ChatListFilters,
  CursorPage,
  HandoffListFilters,
  HandoffPatch,
} from '../types'

/**
 * Typed wrapper over `backend/modules/assistant/admin`:
 *
 *   GET    /admin/assistant/chats[?userId=&flowId=&variantLabel=&limit=&cursor=]
 *   GET    /admin/assistant/chats/{id}
 *   GET    /admin/assistant/handoffs[?status=&limit=&cursor=]
 *   GET    /admin/assistant/handoffs/{id}
 *   PATCH  /admin/assistant/handoffs/{id}        body: {status?, notes?}
 *   POST   /admin/assistant/reset[?template=default|production]
 *
 * Each call returns the raw Go-shaped response; pages own their own
 * loading/error state.
 */
export function useAssistantAdmin() {
  // A multi-brand admin (useChannel from the base layer) lists the picked
  // brand's chats and handoffs — the pages showed every tenant mixed.
  const { selected: pickedChannel } = useChannel()
  const withTenant = <T extends { tenant?: string }>(f: T): T =>
    (f.tenant === undefined && pickedChannel.value ? { ...f, tenant: pickedChannel.value } : f)

  function qs(params: Record<string, string | number | undefined>): string {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') p.set(k, String(v))
    }
    const s = p.toString()
    return s ? `?${s}` : ''
  }

  async function listChats(filters: ChatListFilters = {}): Promise<ChatListPage> {
    return $apiFetch<ChatListPage>(
      `/api/v1/admin/assistant/chats${qs(withTenant(filters) as Record<string, any>)}`,
    )
  }

  async function getChat(id: string): Promise<AssistantChatDetail> {
    // Response is the chat record enriched with flowName + usage.
    // Old callers that only used AssistantChat fields keep working
    // because AssistantChatDetail extends it.
    return $apiFetch<AssistantChatDetail>(`/api/v1/admin/assistant/chats/${encodeURIComponent(id)}`)
  }

  async function listHandoffs(filters: HandoffListFilters = {}): Promise<CursorPage<AssistantHandoff>> {
    return $apiFetch<CursorPage<AssistantHandoff>>(
      `/api/v1/admin/assistant/handoffs${qs(withTenant(filters) as Record<string, any>)}`,
    )
  }

  async function getHandoff(id: string): Promise<AssistantHandoff> {
    return $apiFetch<AssistantHandoff>(`/api/v1/admin/assistant/handoffs/${encodeURIComponent(id)}`)
  }

  async function patchHandoff(id: string, patch: HandoffPatch): Promise<AssistantHandoff> {
    return $apiFetch<AssistantHandoff>(
      `/api/v1/admin/assistant/handoffs/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: patch },
    )
  }

  async function resetAssistantFlow(template: string = 'default'): Promise<void> {
    await $apiFetch(`/api/v1/admin/assistant/reset${qs({ template })}`, { method: 'POST' })
  }

  return {
    listChats,
    getChat,
    listHandoffs,
    getHandoff,
    patchHandoff,
    resetAssistantFlow,
  }
}
