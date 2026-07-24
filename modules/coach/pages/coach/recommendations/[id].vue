<script setup lang="ts">
import { useCoachAdmin } from '../../../composables/useCoachAdmin'
import type { CoachRecommendation, CoachStatus, CoachUsageSummary } from '../../../types'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth'],
  ssr: false,
})

const route = useRoute()
const toast = useToast()
const { getRecommendation, reviewRecommendation } = useCoachAdmin()

const recId = computed(() => decodeURIComponent(route.params.id as string))
const rec = ref<CoachRecommendation | null>(null)
const usage = ref<CoachUsageSummary | undefined>()
const loading = ref(true)
const errorMsg = ref<string | null>(null)
const notesDraft = ref('')
const qualityDraft = ref<number>(0)
const submitting = ref<CoachStatus | null>(null)

async function load() {
  loading.value = true
  errorMsg.value = null
  try {
    const detail = await getRecommendation(recId.value)
    rec.value = detail.recommendation
    usage.value = detail.usage
    notesDraft.value = detail.recommendation.notes || ''
    qualityDraft.value = detail.recommendation.quality || 0
  } catch (e: any) {
    errorMsg.value = e.data?.detail || e.message || 'Failed to load recommendation'
  } finally {
    loading.value = false
  }
}

async function review(status: CoachStatus) {
  if (!rec.value) return
  submitting.value = status
  try {
    const detail = await reviewRecommendation(rec.value.id, {
      status,
      notes: notesDraft.value,
      quality: qualityDraft.value || undefined,
    })
    rec.value = detail.recommendation
    usage.value = detail.usage
    toast.add({ title: `Marked ${status}`, color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Review failed', description: e.data?.detail || e.message, color: 'error' })
  } finally {
    submitting.value = null
  }
}

const statusColor = computed<'primary' | 'success' | 'warning' | 'neutral'>(() => {
  switch (rec.value?.status) {
    case 'new':      return 'primary'
    case 'reviewed': return 'success'
    case 'flagged':  return 'warning'
    default:         return 'neutral'
  }
})

function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

function fmtNum(n: number | undefined | null): string {
  if (n == null) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

function fmtCost(usd: number | undefined | null): string {
  if (!usd || usd <= 0) return '$0.00'
  if (usd < 0.01) {
    const places = Math.max(2, Math.ceil(-Math.log10(usd)) + 1)
    return '$' + usd.toFixed(Math.min(8, places))
  }
  return '$' + usd.toFixed(usd < 1 ? 4 : 2)
}

/** Render the context snapshot as readable key/value lines. Values
 *  that are strings show verbatim; objects/arrays are JSON-encoded. */
const contextEntries = computed<Array<{ k: string; v: string }>>(() => {
  const c = rec.value?.context
  if (!c || typeof c !== 'object') return []
  return Object.entries(c).map(([k, v]) => ({
    k,
    v: typeof v === 'string' ? v : JSON.stringify(v, null, 2),
  }))
})

onMounted(load)
</script>

<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <header class="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
      <div class="flex items-center gap-3">
        <UButton color="neutral" variant="ghost" icon="i-heroicons-arrow-left" size="sm" to="/coach/recommendations" />
        <div class="flex-1 min-w-0">
          <h1 class="text-base sm:text-xl font-semibold truncate">
            {{ rec?.title || rec?.kind || 'Recommendation' }}
          </h1>
          <p class="text-xs font-mono text-gray-500 dark:text-gray-400 truncate">{{ recId }}</p>
        </div>
        <UBadge v-if="rec" :label="rec.status" :color="statusColor" variant="soft" size="sm" class="flex-shrink-0" />
      </div>
    </header>

    <main class="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
      <div class="max-w-4xl mx-auto space-y-5">
        <UAlert v-if="errorMsg" color="error" variant="subtle" :title="errorMsg" />

        <div v-if="loading && !rec" class="space-y-3">
          <USkeleton class="h-20 w-full" />
          <USkeleton class="h-32 w-full" />
        </div>

        <template v-else-if="rec">
          <!-- The recommendation message -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <h2 class="text-base font-semibold">Message</h2>
                <div class="flex items-center gap-2">
                  <UBadge :label="rec.kind" color="primary" variant="soft" size="xs" />
                  <UBadge v-if="rec.locale" :label="rec.locale" color="neutral" variant="outline" size="xs" />
                </div>
              </div>
            </template>
            <p class="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
              {{ rec.message }}
            </p>
          </UCard>

          <!-- Metadata -->
          <UCard>
            <template #header><h2 class="text-base font-semibold">Metadata</h2></template>
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">User</dt>
                <dd class="font-mono">{{ rec.userId || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Source</dt>
                <dd>{{ rec.source || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Flow</dt>
                <dd class="flex flex-col gap-0.5">
                  <NuxtLink
                    v-if="rec.flowId"
                    :to="`/flows/${encodeURIComponent(rec.flowId)}`"
                    class="text-primary-600 dark:text-primary-400 hover:underline truncate"
                  >{{ rec.flowId }}</NuxtLink>
                  <span v-else>— <span class="text-xs text-gray-400">(direct / fallback)</span></span>
                  <span v-if="rec.runId" class="font-mono text-[11px] text-gray-400 truncate" :title="rec.runId">
                    run: {{ rec.runId }}
                  </span>
                </dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Variant</dt>
                <dd>
                  <UBadge v-if="rec.variantLabel" :label="rec.variantLabel" color="primary" variant="soft" size="xs" />
                  <span v-else>—</span>
                </dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Created</dt>
                <dd>{{ formatDate(rec.created_at) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Reviewed</dt>
                <dd>
                  {{ formatDate(rec.reviewedAt) }}
                  <span v-if="rec.reviewedBy" class="font-mono text-xs text-gray-400">by {{ rec.reviewedBy }}</span>
                </dd>
              </div>
            </dl>
          </UCard>

          <!-- Usage roll-up -->
          <UCard v-if="usage && usage.total.calls > 0">
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <h2 class="text-base font-semibold">AI Usage</h2>
                <NuxtLink to="/ai/breakdowns" class="text-xs text-primary-600 dark:text-primary-400 hover:underline">
                  Full breakdowns →
                </NuxtLink>
              </div>
            </template>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-4">
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Calls</dt>
                <dd class="text-base font-semibold">{{ fmtNum(usage.total.calls) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Total tokens</dt>
                <dd class="text-base font-semibold">{{ fmtNum(usage.total.totalTokens) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Cost</dt>
                <dd class="text-base font-semibold">{{ fmtCost(usage.total.costUsd) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-gray-500 uppercase tracking-wide">Avg latency</dt>
                <dd class="text-base font-semibold">
                  {{ usage.total.avgLatencyMs ? Math.round(usage.total.avgLatencyMs) + 'ms' : '—' }}
                </dd>
              </div>
            </div>
            <div v-if="usage.byModel.length >= 1" class="overflow-x-auto">
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
                  <tr v-for="row in usage.byModel" :key="row.key">
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

          <!-- Context snapshot -->
          <UCard v-if="contextEntries.length">
            <template #header><h2 class="text-base font-semibold">Context snapshot</h2></template>
            <dl class="space-y-3 text-sm">
              <div v-for="e in contextEntries" :key="e.k">
                <dt class="text-xs text-gray-500 uppercase tracking-wide mb-1">{{ e.k }}</dt>
                <dd class="whitespace-pre-wrap break-words font-mono text-xs bg-gray-50 dark:bg-gray-800/60 rounded-md px-3 py-2">{{ e.v }}</dd>
              </div>
            </dl>
          </UCard>

          <!-- Review actions -->
          <UCard>
            <template #header><h2 class="text-base font-semibold">Review</h2></template>
            <div class="space-y-4">
              <UFormField label="Quality" hint="Optional 1–5 rating">
                <div class="flex items-center gap-1">
                  <UButton
                    v-for="star in 5"
                    :key="star"
                    :icon="star <= qualityDraft ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
                    color="warning"
                    variant="ghost"
                    size="sm"
                    @click="qualityDraft = star === qualityDraft ? 0 : star"
                  />
                  <span class="text-xs text-gray-500 ml-1">{{ qualityDraft || '—' }}</span>
                </div>
              </UFormField>

              <UFormField label="Notes">
                <UTextarea v-model="notesDraft" :rows="3" placeholder="Reviewer notes (optional)…" class="w-full" />
              </UFormField>

              <div class="flex flex-wrap gap-2">
                <UButton color="success" icon="i-heroicons-check" :loading="submitting === 'reviewed'" @click="review('reviewed')">
                  Mark reviewed
                </UButton>
                <UButton color="warning" variant="soft" icon="i-heroicons-flag" :loading="submitting === 'flagged'" @click="review('flagged')">
                  Flag
                </UButton>
                <UButton color="neutral" variant="soft" icon="i-heroicons-x-mark" :loading="submitting === 'dismissed'" @click="review('dismissed')">
                  Dismiss
                </UButton>
              </div>
            </div>
          </UCard>
        </template>
      </div>
    </main>
  </div>
</template>
