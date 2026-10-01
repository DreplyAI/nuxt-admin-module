<script setup lang="ts">
import { useAssistantAdmin } from '../../../composables/useAssistantAdmin'
import type { AssistantHandoff, HandoffStatus } from '../../../types'

definePageMeta({
  layout: 'dashboard',
  middleware: ['auth'],
  ssr: false,
})

const route = useRoute()
const toast = useToast()
const { getHandoff, patchHandoff } = useAssistantAdmin()

const handoffId = computed(() => decodeURIComponent(route.params.id as string))
const handoff = ref<AssistantHandoff | null>(null)
const loading = ref(true)
const errorMsg = ref<string | null>(null)
const notesDraft = ref('')
const submitting = ref<HandoffStatus | null>(null)

async function load() {
  loading.value = true
  errorMsg.value = null
  try {
    handoff.value = await getHandoff(handoffId.value)
    notesDraft.value = handoff.value.notes || ''
  } catch (e: any) {
    errorMsg.value = e.data?.detail || e.message || 'Failed to load handoff'
  } finally {
    loading.value = false
  }
}

async function transition(status: HandoffStatus) {
  if (!handoff.value) return
  submitting.value = status
  try {
    handoff.value = await patchHandoff(handoff.value.id, {
      status,
      notes: notesDraft.value,
    })
    toast.add({ title: `Marked ${status}`, color: 'success' })
  } catch (e: any) {
    toast.add({
      title: 'Transition failed',
      description: e.data?.detail || e.message,
      color: 'error',
    })
  } finally {
    submitting.value = null
  }
}

async function saveNotes() {
  if (!handoff.value) return
  try {
    handoff.value = await patchHandoff(handoff.value.id, { notes: notesDraft.value })
    toast.add({ title: 'Notes saved', color: 'success' })
  } catch (e: any) {
    toast.add({
      title: 'Save failed',
      description: e.data?.detail || e.message,
      color: 'error',
    })
  }
}

const statusColor = computed<'warning' | 'primary' | 'success' | 'neutral'>(() => {
  switch (handoff.value?.status) {
    case 'pending':   return 'warning'
    case 'contacted': return 'primary'
    case 'resolved':  return 'success'
    default:          return 'neutral'
  }
})

function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString() } catch { return iso }
}

/** A handoff in a terminal state (resolved / dismissed) shouldn't allow
 *  further transitions via the action row; operators can still edit notes. */
const isTerminal = computed(() =>
  handoff.value?.status === 'resolved' || handoff.value?.status === 'dismissed',
)

onMounted(load)
</script>

<template>
  <AdminPage :title="handoff?.email || handoff?.userId || 'Anonymous visitor'" description="Contact them, keep notes, and move the request along." back="/assistant/handoffs">
    <template #actions>
      <UBadge
        v-if="handoff"
        :label="handoff.status"
        :color="statusColor"
        variant="subtle"
        class="capitalize"
      />
    </template>

      <div class="max-w-4xl mx-auto space-y-5">
        <UAlert v-if="errorMsg" color="error" variant="subtle" :title="errorMsg" />

        <div v-if="loading && !handoff" class="space-y-3">
          <USkeleton class="h-24 w-full" />
          <USkeleton class="h-48 w-full" />
        </div>

        <template v-else-if="handoff">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="text-base font-semibold">Request details</h2>
                <NuxtLink
                  v-if="handoff.chatId"
                  :to="`/assistant/chats/${encodeURIComponent(handoff.chatId)}`"
                  class="text-xs text-primary hover:underline"
                >
                  View full chat →
                </NuxtLink>
              </div>
            </template>
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt class="text-xs text-muted uppercase tracking-wide">Email</dt>
                <dd class="break-all">{{ handoff.email || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted uppercase tracking-wide">Phone</dt>
                <dd>{{ handoff.phone || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted uppercase tracking-wide">User ID</dt>
                <dd class="font-mono text-xs">{{ handoff.userId || '—' }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted uppercase tracking-wide">Priority</dt>
                <dd>{{ handoff.priority || 'normal' }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted uppercase tracking-wide">Requested</dt>
                <dd>{{ formatDate(handoff.created_at) }}</dd>
              </div>
              <div>
                <dt class="text-xs text-muted uppercase tracking-wide">Contacted</dt>
                <dd>{{ formatDate(handoff.contactedAt) }}<span v-if="handoff.contactedBy"> by {{ handoff.contactedBy }}</span></dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="text-xs text-muted uppercase tracking-wide">Reason</dt>
                <dd class="whitespace-pre-wrap">{{ handoff.reason || '—' }}</dd>
              </div>
            </dl>
          </UCard>

          <UCard v-if="handoff.transcript">
            <template #header>
              <h2 class="text-base font-semibold">Captured transcript</h2>
            </template>
            <pre class="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap font-mono">{{ handoff.transcript }}</pre>
          </UCard>

          <UCard>
            <template #header>
              <h2 class="text-base font-semibold">Action</h2>
            </template>
            <UFormField label="Notes" help="Visible to other admins. Saved together with status transitions.">
              <UTextarea
                v-model="notesDraft"
                :rows="4"
                placeholder="Called the user at 2pm — will follow up Thursday."
                class="resize-y"
              />
            </UFormField>
            <template #footer>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-heroicons-document-check"
                  :disabled="!handoff || notesDraft === (handoff.notes || '')"
                  @click="saveNotes"
                >
                  Save notes
                </UButton>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    v-if="!isTerminal"
                    color="primary"
                    variant="soft"
                    icon="i-heroicons-phone"
                    :loading="submitting === 'contacted'"
                    :disabled="handoff.status === 'contacted'"
                    @click="transition('contacted')"
                  >
                    Mark contacted
                  </UButton>
                  <UButton
                    color="success"
                    variant="soft"
                    icon="i-heroicons-check-circle"
                    :loading="submitting === 'resolved'"
                    :disabled="handoff.status === 'resolved'"
                    @click="transition('resolved')"
                  >
                    Resolve
                  </UButton>
                  <UButton
                    color="neutral"
                    variant="soft"
                    icon="i-heroicons-archive-box"
                    :loading="submitting === 'dismissed'"
                    :disabled="handoff.status === 'dismissed'"
                    @click="transition('dismissed')"
                  >
                    Dismiss
                  </UButton>
                </div>
              </div>
            </template>
          </UCard>
        </template>
      </div>
  </AdminPage>
</template>
