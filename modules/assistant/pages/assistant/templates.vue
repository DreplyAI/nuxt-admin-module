<script setup lang="ts">
/**
 * Assistant templates — filtered view over the generic flow-template
 * catalog. The assistant module contributes 12 starters via
 * flowexec.TemplateProvider, each with the id prefix `assistant/` and
 * source=`assistant`; this page just lists them and delegates creation
 * to the shared /flows/new?template=<id> workflow.
 *
 * Why this isn't its own backend surface:
 *   - flowexec already owns flow CRUD and template discovery via
 *     GET  /api/v1/flows/templates
 *     GET  /api/v1/flows/templates/{id}
 *     POST /api/v1/flows
 *     POST /api/v1/flows/{id}/versions
 *   - /flows/new handles the create-from-template UX (flow title,
 *     initial document preview, optional publish).
 *   - /flows/deployments handles the routing step.
 * This page is a curated discovery surface, not a duplicate CRUD.
 *
 * Wrapped in <ClientOnly> so navigation unmount never crashes on
 * async state — same defensive pattern as FlowStudioEmbed +
 * MediaPreviewModal.
 */
// Local FlowTemplate stub — the redelay/admin original imports
// from ~/modules/flows/types which lives in their flows admin
// module. FlowDSL/admin doesn't ship a flows module today; the
// shape we need from the templates list endpoint is just
// {id, name, description, source, tags}. Inline so this page
// stays self-contained.
type FlowTemplate = {
  id: string
  name: string
  description?: string
  source?: string
  tags?: string[]
}

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth'],
  ssr: false,
})

// $apiFetch is the base layer's wrapper (see js-admin-nuxt4/composables/useApiFetch).
// Auto-imported at the Nuxt layer boundary.

const templates = ref<FlowTemplate[]>([])
const loading = ref(true)
const errorMsg = ref<string | null>(null)

async function load() {
  loading.value = true
  errorMsg.value = null
  try {
    const resp = await $apiFetch<{ items: FlowTemplate[] }>('/api/v1/flows/templates')
    // Filter to the assistant module's contributions. Source tag comes
    // from flowexec.FlowTemplate.Source which the assistant module
    // sets to "assistant" on every template it exposes.
    templates.value = (resp.items ?? []).filter(t => t.source === 'assistant')
  } catch (err: any) {
    errorMsg.value = err.data?.error?.message || err.data?.detail || err.message || 'Failed to load templates'
  } finally {
    loading.value = false
  }
}

/**
 * Classify templates by quality/complexity tier so the catalog reads
 * as a progression — derived from the template id rather than baked
 * in per entry, because the backend doesn't expose a tier on the
 * generic FlowTemplate type (it's assistant-specific tribal knowledge).
 */
function tier(t: FlowTemplate): { label: string; color: 'neutral' | 'info' | 'primary' | 'success' | 'warning' } {
  const id = t.id.replace(/^assistant\//, '')
  if (id === 'echo')                                              return { label: 'Dev',       color: 'neutral' }
  if (id === 'minimal')                                           return { label: 'Tier 1',    color: 'neutral' }
  if (id === 'default' || id === 'default-stream')                return { label: 'Tier 2',    color: 'info' }
  if (id === 'production' || id === 'multi-guard')                return { label: 'Tier 3',    color: 'primary' }
  if (id.startsWith('rag-rewrite'))                               return { label: 'Tier 5',    color: 'warning' }
  if (id.startsWith('rag') || id === 'qa-only')                   return { label: 'Tier 4',    color: 'success' }
  return { label: 'Template', color: 'neutral' }
}

onMounted(load)
</script>

<template>
  <ClientOnly>
    <div class="flex-1 flex flex-col overflow-hidden">
      <header class="flex-shrink-0 bg-default border-b border-default px-4 sm:px-6 py-4">
        <div class="max-w-5xl mx-auto flex items-start justify-between gap-4">
          <div>
            <h1 class="text-xl sm:text-2xl font-bold">Assistant Templates</h1>
            <p class="text-sm text-muted mt-1">
              Starters for new assistant flows. Pick one, name your flow, then route traffic to it via a
              <NuxtLink to="/flows/deployments" class="text-primary-600 hover:underline">deployment variant</NuxtLink>.
            </p>
          </div>
          <UButton color="neutral" variant="ghost" icon="i-heroicons-arrow-top-right-on-square" size="sm" to="/flows/templates">
            All flow templates
          </UButton>
        </div>
      </header>

      <main class="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div class="max-w-5xl mx-auto space-y-4">
          <UAlert v-if="errorMsg" color="error" variant="subtle" :title="errorMsg" />

          <div v-if="loading" class="space-y-3">
            <USkeleton class="h-28 w-full" />
            <USkeleton class="h-28 w-full" />
            <USkeleton class="h-28 w-full" />
          </div>

          <EmptyState
            v-else-if="templates.length === 0"
            bare
            icon="i-heroicons-squares-2x2"
            title="No assistant templates"
            description="No templates matched source='assistant'. Check that the assistant module is loaded and exposing flowexec.TemplateProvider."
          />

          <UCard
            v-for="t in templates"
            :key="t.id"
            :ui="{ body: 'p-4 sm:p-5' }"
          >
            <div class="flex items-start gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex flex-wrap items-center gap-2 mb-1.5">
                  <UBadge :label="tier(t).label" :color="tier(t).color" variant="subtle" size="xs" />
                  <UBadge
                    v-for="tag in t.tags || []"
                    :key="tag"
                    :label="tag"
                    color="neutral"
                    variant="subtle"
                    size="xs"
                  />
                  <span class="font-mono text-[11px] text-dimmed">{{ t.id }}</span>
                </div>
                <h2 class="text-base font-semibold text-highlighted dark:text-white truncate">
                  {{ t.name || t.id }}
                </h2>
                <p v-if="t.description" class="text-sm text-toned mt-1 leading-relaxed">
                  {{ t.description }}
                </p>
              </div>
              <div class="flex-shrink-0">
                <!-- Delegates to the generic flow-creation page. That
                     page handles the title input, document preview, and
                     publish toggle — no need to duplicate the UX here. -->
                <UButton
                  color="primary"
                  variant="solid"
                  size="sm"
                  icon="i-heroicons-plus"
                  :to="`/flows/new?template=${encodeURIComponent(t.id)}`"
                >
                  Create flow
                </UButton>
              </div>
            </div>
          </UCard>

          <UAlert
            color="info"
            variant="subtle"
            icon="i-heroicons-information-circle"
            title="How activation works"
            class="mt-6"
          >
            <template #description>
              <ol class="list-decimal ml-5 space-y-0.5">
                <li>Click <strong>Create flow</strong> → pick a title on the next page. The flow is saved as a draft; nothing is live yet.</li>
                <li>Open the flow in <NuxtLink to="/flows" class="text-primary-600 hover:underline">/flows</NuxtLink> to tune node configs or inspect the DAG.</li>
                <li>Bind it to an assistant <NuxtLink to="/flows/deployments" class="text-primary-600 hover:underline">deployment variant</NuxtLink> — this is what routes chat traffic to the new flow. Multiple flows can coexist as canary/stable variants.</li>
              </ol>
            </template>
          </UAlert>
        </div>
      </main>
    </div>

    <template #fallback>
      <div class="flex-1 flex items-center justify-center p-6 text-sm text-muted">
        Loading templates…
      </div>
    </template>
  </ClientOnly>
</template>
