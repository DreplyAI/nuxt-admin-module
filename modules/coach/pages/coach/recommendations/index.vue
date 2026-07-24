<script setup lang="ts">
import { useCoachAdmin } from '../../../composables/useCoachAdmin'
import type { CoachRecommendation, CoachListFilters, CoachStats } from '../../../types'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth'],
  ssr: false,
})

const { listRecommendations, statsByStatus, statsByKind } = useCoachAdmin()
const toast = useToast()

const recs = ref<CoachRecommendation[]>([])
const nextCursor = ref<string | undefined>()
const loading = ref(true)
const errorMsg = ref<string | null>(null)
const filters = ref<CoachListFilters>({ limit: 20 })
// USelect (Nuxt UI v4) forbids an empty-string option value, so the
// "Any status" choice uses the 'all' sentinel and is mapped back to no
// filter when querying.
const statusSel = ref<'all' | 'new' | 'reviewed' | 'flagged' | 'dismissed'>('all')

const statusStats = ref<CoachStats | null>(null)
const kindStats = ref<CoachStats | null>(null)

const statusColors: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
  new: 'primary',
  reviewed: 'success',
  flagged: 'warning',
  dismissed: 'neutral',
}

async function loadStats() {
  try {
    const [s, k] = await Promise.all([statsByStatus(), statsByKind()])
    statusStats.value = s
    kindStats.value = k
  } catch {
    // Non-fatal — the list is the primary content.
  }
}

async function load(cursor?: string) {
  loading.value = true
  errorMsg.value = null
  try {
    const status = statusSel.value === 'all' ? '' : statusSel.value
    const resp = await listRecommendations({ ...filters.value, status, cursor })
    if (cursor) recs.value = [...recs.value, ...resp.items]
    else recs.value = resp.items ?? []
    nextCursor.value = resp.nextCursor
  } catch (e: any) {
    errorMsg.value = e.data?.detail || e.message || 'Failed to load recommendations'
    toast.add({ title: 'Failed to load recommendations', color: 'error' })
  } finally {
    loading.value = false
  }
}

function apply() { load() }
function reset() {
  filters.value = { limit: 20 }
  statusSel.value = 'all'
  load()
}

function totalCount(s: CoachStats | null): number {
  if (!s) return 0
  return Object.values(s.counts).reduce((a, b) => a + b, 0)
}

function formatDate(iso?: string): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

function preview(m: string): string {
  const t = (m || '').trim().replace(/\s+/g, ' ')
  return t.length > 180 ? t.slice(0, 180) + '…' : t || '—'
}

onMounted(() => {
  loadStats()
  load()
})
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <header class="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 sm:mb-4">
        <div class="min-w-0">
          <h1 class="text-xl sm:text-2xl font-bold">AI Coach Recommendations</h1>
          <p class="hidden sm:block text-sm text-gray-600 dark:text-gray-400 mt-1">
            Every proactive coaching proposal the AI generated — flow-backed, language-aware, and monitored. Backed by <code class="text-xs">backend/modules/coach</code>.
          </p>
        </div>
      </div>

      <!-- Status roll-up chips -->
      <div v-if="statusStats" class="flex flex-wrap gap-2 mb-3">
        <UBadge color="neutral" variant="subtle" size="sm">
          {{ totalCount(statusStats) }} total
        </UBadge>
        <UBadge
          v-for="(n, status) in statusStats.counts"
          :key="status"
          :color="statusColors[status] || 'neutral'"
          variant="soft"
          size="sm"
        >
          {{ status }}: {{ n }}
        </UBadge>
        <span v-if="kindStats" class="hidden sm:inline-flex items-center gap-2">
          <span class="text-gray-300 dark:text-gray-600">|</span>
          <UBadge
            v-for="(n, kind) in kindStats.counts"
            :key="kind"
            color="primary"
            variant="outline"
            size="sm"
          >
            {{ kind }}: {{ n }}
          </UBadge>
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <UFormField label="Kind" size="xs">
          <UInput v-model="filters.kind" placeholder="goal_progress…" />
        </UFormField>
        <UFormField label="Status" size="xs">
          <USelect
            v-model="statusSel"
            :items="[
              { label: 'Any', value: 'all' },
              { label: 'New', value: 'new' },
              { label: 'Reviewed', value: 'reviewed' },
              { label: 'Flagged', value: 'flagged' },
              { label: 'Dismissed', value: 'dismissed' },
            ]"
          />
        </UFormField>
        <UFormField label="Source" size="xs">
          <UInput v-model="filters.source" placeholder="goals…" />
        </UFormField>
        <UFormField label="User ID" size="xs">
          <UInput v-model="filters.userId" placeholder="ObjectID hex" />
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

        <UCard v-if="loading && recs.length === 0">
          <div class="space-y-3">
            <USkeleton v-for="i in 4" :key="i" class="h-16 w-full" />
          </div>
        </UCard>

        <EmptyState
          v-else-if="recs.length === 0"
          icon="i-heroicons-sparkles"
          title="No recommendations yet"
          description="Once the AI coach generates advice (goal analysis, session insights), it appears here."
        />

        <UCard v-else :ui="{ body: { padding: 'p-0 sm:p-0' } } as any">
          <div class="divide-y divide-gray-200 dark:divide-gray-800">
            <NuxtLink
              v-for="r in recs"
              :key="r.id"
              :to="`/coach/recommendations/${encodeURIComponent(r.id)}`"
              class="block px-4 py-3 sm:px-5 sm:py-4 hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
            >
              <div class="flex items-start justify-between gap-3 mb-1">
                <div class="flex items-center gap-2 min-w-0 flex-wrap">
                  <UBadge :label="r.kind" color="primary" variant="soft" size="xs" />
                  <UBadge :label="r.status" :color="statusColors[r.status] || 'neutral'" variant="subtle" size="xs" />
                  <UBadge v-if="r.locale" :label="r.locale" color="neutral" variant="outline" size="xs" />
                  <UBadge v-if="r.runId" label="flow" color="success" variant="subtle" size="xs" />
                  <UBadge v-else-if="r.model === 'fallback'" label="fallback" color="warning" variant="subtle" size="xs" />
                </div>
                <span class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {{ formatDate(r.created_at) }}
                </span>
              </div>
              <p class="text-sm text-gray-700 dark:text-gray-300 mb-1 line-clamp-2">
                {{ preview(r.message) }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400 flex gap-3 flex-wrap">
                <span v-if="r.source">source: <span class="font-medium">{{ r.source }}</span></span>
                <span v-if="r.userId">user: <span class="font-mono">{{ r.userId }}</span></span>
                <span v-if="r.variantLabel">variant: <span class="font-medium">{{ r.variantLabel }}</span></span>
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
