<script setup lang="ts">
import { useAssistantAdmin } from '../../../composables/useAssistantAdmin'
import type { AssistantChat, ChatListFilters } from '../../../types'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth'],
  ssr: false,
})

const { listChats } = useAssistantAdmin()
const toast = useToast()

const chats = ref<AssistantChat[]>([])
const nextCursor = ref<string | undefined>()
const loading = ref(true)
const errorMsg = ref<string | null>(null)
const filters = ref<ChatListFilters>({ limit: 20 })

// flowId → flow name. Populated once via /api/v1/flows on mount —
// cheap even on deployments with dozens of flows, and avoids N+1
// lookups when rendering the list. Keyed by flowId so new flows
// created during the session require a reload to be named (fine —
// rare enough).
const flowNames = ref<Record<string, string>>({})

async function loadFlowNames() {
  try {
    const resp = await $apiFetch<{ items?: Array<{ id: string; name?: string }> }>('/api/v1/flows')
    const map: Record<string, string> = {}
    for (const f of resp.items ?? []) {
      if (f.id && f.name) map[f.id] = f.name
    }
    flowNames.value = map
  } catch {
    // Silent — the list still works with flowId-only labels.
  }
}

async function load(cursor?: string) {
  loading.value = true
  errorMsg.value = null
  try {
    const resp = await listChats({ ...filters.value, cursor })
    if (cursor) chats.value = [...chats.value, ...resp.items]
    else chats.value = resp.items ?? []
    nextCursor.value = resp.nextCursor
  } catch (e: any) {
    errorMsg.value = e.data?.detail || e.message || 'Failed to load chats'
    toast.add({ title: 'Failed to load chats', color: 'error' })
  } finally {
    loading.value = false
  }
}

function flowLabel(flowId?: string): string {
  if (!flowId) return ''
  return flowNames.value[flowId] || flowId
}

function apply() { load() }
function reset() {
  filters.value = { limit: 20 }
  load()
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

function messageCount(c: AssistantChat): number {
  return c.messages?.length ?? c.runIds?.length ?? 0
}

function firstUserMessage(c: AssistantChat): string {
  const m = (c.messages ?? []).find(m => m.role === 'user')
  return m?.content?.trim() || '—'
}

onMounted(() => {
  // Kick both fetches in parallel — the flows list is small and
  // independent of chat filters, so waiting on it before rendering
  // would add a round-trip for nothing.
  loadFlowNames()
  load()
})
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <header class="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 sm:mb-4">
        <div class="min-w-0">
          <h1 class="text-xl sm:text-2xl font-bold">Assistant Conversations</h1>
          <p class="hidden sm:block text-sm text-gray-600 dark:text-gray-400 mt-1">
            Every chat session with the assistant. Backed by <code class="text-xs">backend/modules/assistant</code>, TTL 30 days by default.
          </p>
        </div>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-heroicons-envelope-open"
          to="/assistant/handoffs"
          class="flex-shrink-0"
        >
          Handoffs
        </UButton>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <UFormField label="User ID" size="xs">
          <UInput v-model="filters.userId" placeholder="ObjectID hex" />
        </UFormField>
        <UFormField label="Flow ID" size="xs">
          <UInput v-model="filters.flowId" placeholder="assistant" />
        </UFormField>
        <UFormField label="Variant" size="xs">
          <UInput v-model="filters.variantLabel" placeholder="stable / canary…" />
        </UFormField>
      </div>
      <div class="flex justify-end gap-2 mt-3">
        <UButton color="neutral" variant="ghost" size="sm" @click="reset">Reset</UButton>
        <UButton color="primary" icon="i-heroicons-funnel" size="sm" @click="apply">Apply filters</UButton>
      </div>
    </header>

    <main class="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
      <div class="max-w-6xl mx-auto space-y-4">
        <UAlert v-if="errorMsg" color="error" variant="subtle" :title="errorMsg" />

        <UCard v-if="loading && chats.length === 0">
          <div class="space-y-3">
            <USkeleton v-for="i in 4" :key="i" class="h-16 w-full" />
          </div>
        </UCard>

        <EmptyState
          v-else-if="chats.length === 0"
          icon="i-heroicons-chat-bubble-left-right"
          title="No conversations yet"
          description="Once users chat with the assistant, sessions will appear here."
        />

        <!-- :ui shape changed between Nuxt UI v3 → v4; cast to bypass
             the schema drift. Behaviour-equivalent at runtime. -->
        <UCard v-else :ui="{ body: { padding: 'p-0 sm:p-0' } } as any">
          <div class="divide-y divide-gray-200 dark:divide-gray-800">
            <NuxtLink
              v-for="c in chats"
              :key="c.id"
              :to="`/assistant/chats/${encodeURIComponent(c.id)}`"
              class="block px-4 py-3 sm:px-5 sm:py-4 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
            >
              <div class="flex items-start justify-between gap-3 mb-1">
                <div class="flex items-center gap-2 min-w-0 flex-wrap">
                  <span class="font-mono text-xs text-gray-500 dark:text-gray-400 truncate" :title="c.sessionId">
                    {{ c.sessionId }}
                  </span>
                  <UBadge
                    v-if="c.variantLabel"
                    :label="c.variantLabel"
                    color="primary"
                    variant="soft"
                    size="xs"
                  />
                  <UBadge
                    v-if="c.handoffId"
                    label="handoff"
                    color="warning"
                    variant="subtle"
                    size="xs"
                  />
                </div>
                <span class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {{ formatDate(c.lastAt) }}
                </span>
              </div>
              <p class="text-sm text-gray-700 dark:text-gray-300 truncate mb-1">
                {{ firstUserMessage(c) }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400 flex gap-3 flex-wrap">
                <span>{{ messageCount(c) }} {{ messageCount(c) === 1 ? 'message' : 'messages' }}</span>
                <span v-if="c.userId">user: <span class="font-mono">{{ c.userId }}</span></span>
                <!-- Prefer userId; fall back to anonId so guest traffic
                     still shows a recognisable subject instead of blank. -->
                <span v-else-if="c.anonId">visitor: <span class="font-mono">{{ c.anonId }}</span></span>
                <span v-if="c.flowId" :title="c.flowId">
                  flow:
                  <span class="font-medium">{{ flowLabel(c.flowId) }}</span>
                </span>
              </p>
            </NuxtLink>
          </div>
        </UCard>

        <div v-if="nextCursor" class="flex justify-center">
          <UButton color="neutral" variant="outline" :loading="loading" @click="load(nextCursor)">
            Load more
          </UButton>
        </div>
      </div>
    </main>
  </div>
</template>
