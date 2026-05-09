<script setup lang="ts">
import { useAssistantAdmin } from '../../../composables/useAssistantAdmin'
import type { AssistantChatDetail } from '../../../types'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth'],
  ssr: false,
})

const route = useRoute()
const { getChat } = useAssistantAdmin()

const chatId = computed(() => decodeURIComponent(route.params.id as string))
const chat = ref<AssistantChatDetail | null>(null)
const loading = ref(true)
const errorMsg = ref<string | null>(null)

async function load() {
  loading.value = true
  errorMsg.value = null
  try {
    chat.value = await getChat(chatId.value)
  } catch (e: any) {
    errorMsg.value = e.data?.detail || e.message || 'Failed to load chat'
  } finally {
    loading.value = false
  }
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

function roleColor(role: string): 'primary' | 'neutral' | 'success' {
  if (role === 'user') return 'primary'
  if (role === 'assistant') return 'success'
  return 'neutral'
}

/** Compact number formatter — 1,234 → 1.2k so wide cards stay narrow. */
function fmtNum(n: number | undefined | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

/** USD formatter. Tight precision for tiny embed rows; rounds up to
 *  4 decimals past the first non-zero digit so "$0.00005" reads
 *  correctly instead of "$0.00". */
function fmtCost(usd: number | undefined | null): string {
  if (!usd || usd <= 0) return '$0.00'
  if (usd < 0.01) {
    // Find the first non-zero digit, keep 2 sig figs after it.
    const places = Math.max(2, Math.ceil(-Math.log10(usd)) + 1)
    return '$' + usd.toFixed(Math.min(8, places))
  }
  return '$' + usd.toFixed(usd < 1 ? 4 : 2)
}

onMounted(load)
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <header class="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
      <div class="flex items-center gap-3">
        <UButton color="neutral" variant="ghost" icon="i-heroicons-arrow-left" size="sm" to="/assistant/chats" />
        <div class="flex-1 min-w-0">
          <h1 class="text-base sm:text-xl font-semibold truncate">
            {{ chat?.sessionId || chatId }}
          </h1>
          <p class="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">{{ chatId }}</p>
        </div>
        <UButton
          v-if="chat?.handoffId"
          color="warning"
          variant="soft"
          icon="i-heroicons-envelope-open"
          :to="`/assistant/handoffs/${encodeURIComponent(chat.handoffId)}`"
          class="flex-shrink-0"
        >
          <span class="hidden sm:inline">Open handoff</span>
        </UButton>
      </div>
    </header>

    <main class="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
      <div class="max-w-4xl mx-auto space-y-5">
        <UAlert v-if="errorMsg" color="error" variant="subtle" :title="errorMsg" />

        <div v-if="loading && !chat" class="space-y-3">
          <USkeleton class="h-20 w-full" />
          <USkeleton class="h-32 w-full" />
        </div>

        <template v-else-if="chat">
          <UCard>
            <template #header>
              <h2 class="text-base font-semibold">Metadata</h2>
            </template>
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">{{ chat.userId ? 'User ID' : chat.anonId ? 'Visitor' : 'User ID' }}</dt>
                <dd class="font-mono">{{ chat.userId || chat.anonId || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Flow</dt>
                <dd class="flex flex-col gap-0.5">
                  <NuxtLink
                    v-if="chat.flowId"
                    :to="`/flows/${encodeURIComponent(chat.flowId)}`"
                    class="text-primary-600 dark:text-primary-400 hover:underline truncate"
                    :title="chat.flowId"
                  >
                    {{ chat.flowName || chat.flowId }}
                  </NuxtLink>
                  <span v-else>—</span>
                  <span
                    v-if="chat.flowName && chat.flowId"
                    class="font-mono text-[11px] text-gray-400 dark:text-gray-500 truncate"
                    :title="chat.flowId"
                  >{{ chat.flowId }}</span>
                </dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Variant</dt>
                <dd>
                  <UBadge v-if="chat.variantLabel" :label="chat.variantLabel" color="primary" variant="soft" size="xs" />
                  <span v-else>—</span>
                </dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Version hash</dt>
                <dd class="font-mono text-xs truncate" :title="chat.versionHash">
                  {{ chat.versionHash?.slice(0, 20) || '—' }}{{ chat.versionHash && chat.versionHash.length > 20 ? '…' : '' }}
                </dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Started</dt>
                <dd>{{ formatDate(chat.startedAt) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Last message</dt>
                <dd>{{ formatDate(chat.lastAt) }}</dd>
              </div>
            </dl>
          </UCard>

          <!-- Usage roll-up. Hidden for chats that recorded nothing
               (dev echo flow, failed runs) so the page doesn't show
               a misleading "$0.00" card every time. -->
          <UCard v-if="chat.usage && chat.usage.total.calls > 0">
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <h2 class="text-base font-semibold">AI Usage</h2>
                <NuxtLink
                  to="/ai/breakdowns"
                  class="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                >Full breakdowns →</NuxtLink>
              </div>
            </template>

            <!-- Top-line totals -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Calls</dt>
                <dd class="text-base font-semibold">{{ fmtNum(chat.usage.total.calls) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Total tokens</dt>
                <dd class="text-base font-semibold">{{ fmtNum(chat.usage.total.totalTokens) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Cost</dt>
                <dd class="text-base font-semibold">{{ fmtCost(chat.usage.total.costUsd) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Avg latency</dt>
                <dd class="text-base font-semibold">
                  {{ chat.usage.total.avgLatencyMs ? Math.round(chat.usage.total.avgLatencyMs) + 'ms' : '—' }}
                </dd>
              </div>
            </div>

            <!-- Per-model breakdown. Skip when there's only one row —
                 the top-line totals already tell that story. -->
            <div
              v-if="chat.usage.byModel.length > 1"
              class="overflow-x-auto"
            >
              <table class="w-full text-xs">
                <thead>
                  <tr class="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                    <th class="py-1.5 font-medium">Model</th>
                    <th class="py-1.5 font-medium text-right">Calls</th>
                    <th class="py-1.5 font-medium text-right">Prompt</th>
                    <th class="py-1.5 font-medium text-right">Completion</th>
                    <th class="py-1.5 font-medium text-right">Total</th>
                    <th class="py-1.5 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                  <tr v-for="row in chat.usage.byModel" :key="row.key">
                    <td class="py-1.5 font-mono">{{ row.key }}</td>
                    <td class="py-1.5 text-right">{{ fmtNum(row.total.calls) }}</td>
                    <td class="py-1.5 text-right">{{ fmtNum(row.total.promptTokens) }}</td>
                    <td class="py-1.5 text-right">{{ fmtNum(row.total.completionTokens) }}</td>
                    <td class="py-1.5 text-right font-medium">{{ fmtNum(row.total.totalTokens) }}</td>
                    <td class="py-1.5 text-right">{{ fmtCost(row.total.costUsd) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-base font-semibold">
                  Transcript ({{ chat.messages?.length || 0 }} messages)
                </h2>
              </div>
            </template>
            <EmptyState
              v-if="!chat.messages || chat.messages.length === 0"
              bare
              compact
              icon="i-heroicons-chat-bubble-left-right"
              title="No messages stored"
              description="Messages may have expired via the chat TTL, or this session never exchanged any."
            />
            <div v-else class="space-y-4">
              <div
                v-for="(m, idx) in chat.messages"
                :key="idx"
                class="flex flex-col gap-1"
              >
                <div class="flex items-center gap-2 text-xs">
                  <UBadge :label="m.role" :color="roleColor(m.role)" variant="subtle" size="xs" />
                  <span class="text-gray-500 dark:text-gray-400">{{ formatDate(m.timestamp) }}</span>
                  <span v-if="m.runId" class="font-mono text-gray-400" :title="m.runId">
                    run: {{ m.runId.slice(0, 10) }}…
                  </span>
                </div>
                <div
                  class="rounded-md px-3 py-2 text-sm whitespace-pre-wrap break-words"
                  :class="m.role === 'user'
                    ? 'bg-primary-50 dark:bg-primary-900/20 text-gray-900 dark:text-gray-100'
                    : m.role === 'assistant'
                      ? 'bg-green-50 dark:bg-green-900/20 text-gray-900 dark:text-gray-100'
                      : 'bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300 italic'"
                >
                  {{ m.content }}
                </div>
              </div>
            </div>
          </UCard>
        </template>
      </div>
    </main>
  </div>
</template>
