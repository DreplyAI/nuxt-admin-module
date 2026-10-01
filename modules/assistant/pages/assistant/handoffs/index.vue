<script setup lang="ts">
import { useAssistantAdmin } from '../../../composables/useAssistantAdmin'
import type { AssistantHandoff, HandoffStatus } from '../../../types'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth'],
  ssr: false,
})

const { listHandoffs } = useAssistantAdmin()
const toast = useToast()

const items = ref<AssistantHandoff[]>([])
const nextCursor = ref<string | undefined>()
const loading = ref(true)
const errorMsg = ref<string | null>(null)
const activeStatus = ref<HandoffStatus>('pending')

const statuses: Array<{ value: HandoffStatus; label: string; icon: string; color: 'warning' | 'primary' | 'success' | 'neutral' }> = [
  { value: 'pending',   label: 'Pending',   icon: 'i-heroicons-clock',         color: 'warning' },
  { value: 'contacted', label: 'Contacted', icon: 'i-heroicons-phone',         color: 'primary' },
  { value: 'resolved',  label: 'Resolved',  icon: 'i-heroicons-check-circle',  color: 'success' },
  { value: 'dismissed', label: 'Dismissed', icon: 'i-heroicons-archive-box',   color: 'neutral' },
]

async function load(cursor?: string) {
  loading.value = true
  errorMsg.value = null
  try {
    const resp = await listHandoffs({ status: activeStatus.value, limit: 30, cursor })
    if (cursor) items.value = [...items.value, ...resp.items]
    else items.value = resp.items ?? []
    nextCursor.value = resp.nextCursor
  } catch (e: any) {
    errorMsg.value = e.data?.detail || e.message || 'Failed to load handoffs'
    toast.add({ title: 'Failed to load handoffs', color: 'error' })
  } finally {
    loading.value = false
  }
}

function switchStatus(s: HandoffStatus) {
  if (s === activeStatus.value) return
  activeStatus.value = s
  items.value = []
  load()
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

function priorityColor(p?: string): 'error' | 'warning' | 'neutral' {
  if (p === 'high') return 'error'
  if (p === 'normal') return 'warning'
  return 'neutral'
}

onMounted(() => load())
</script>

<template>
  <AdminPage title="Handoffs" description="Visitors who asked for a person — take one over, then resolve it.">
    <template #actions>
      <UButton color="neutral" variant="outline" icon="i-lucide-messages-square" to="/assistant/chats" size="sm">
        Conversations
      </UButton>
    </template>
    <template #toolbar>
      <nav class="flex gap-1">
        <button
          v-for="s in statuses"
          :key="s.value"
          type="button"
          class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          :class="s.value === activeStatus
            ? 'bg-primary text-white'
            : 'text-default hover:bg-elevated'"
          @click="switchStatus(s.value)"
        >
          <UIcon :name="s.icon" class="w-4 h-4" />
          <span>{{ s.label }}</span>
        </button>
      </nav>
    </template>

      <div class="max-w-5xl mx-auto space-y-4">
        <UAlert v-if="errorMsg" color="error" variant="subtle" :title="errorMsg" />

        <UCard v-if="loading && items.length === 0">
          <div class="space-y-3">
            <USkeleton v-for="i in 3" :key="i" class="h-24 w-full" />
          </div>
        </UCard>

        <EmptyState
          v-else-if="items.length === 0"
          icon="i-heroicons-inbox"
          :title="`No ${activeStatus} handoffs`"
          :description="activeStatus === 'pending'
            ? 'Inbox zero. New handoff requests will appear here as users ask to speak with a human.'
            : `No handoffs are currently in the ${activeStatus} state.`"
        />

        <!-- :ui shape changed between Nuxt UI v3 → v4; cast to bypass
             the schema drift. Behaviour-equivalent at runtime. -->
        <UCard v-else :ui="{ body: { padding: 'p-0 sm:p-0' } } as any">
          <div class="divide-y divide-default">
            <NuxtLink
              v-for="h in items"
              :key="h.id"
              :to="`/assistant/handoffs/${encodeURIComponent(h.id)}`"
              class="block px-4 py-3 sm:px-5 sm:py-4 hover:bg-muted transition-colors"
            >
              <div class="flex items-start justify-between gap-3 mb-1">
                <div class="flex items-center gap-2 min-w-0 flex-wrap">
                  <span class="font-medium text-highlighted dark:text-white truncate">
                    {{ h.email || h.userId || '(anonymous)' }}
                  </span>
                  <UBadge
                    :label="h.priority || 'normal'"
                    :color="priorityColor(h.priority)"
                    variant="subtle"
                    size="xs"
                  />
                </div>
                <span class="text-xs text-muted flex-shrink-0 whitespace-nowrap">
                  {{ formatDate(h.created_at) }}
                </span>
              </div>
              <p v-if="h.reason" class="text-sm text-default truncate mb-1">
                {{ h.reason }}
              </p>
              <p class="text-xs text-muted flex gap-3 flex-wrap">
                <span v-if="h.phone">phone: {{ h.phone }}</span>
                <span v-if="h.contactedBy">contacted by: {{ h.contactedBy }}</span>
                <span v-if="h.contactedAt">at: {{ formatDate(h.contactedAt) }}</span>
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
  </AdminPage>
</template>
