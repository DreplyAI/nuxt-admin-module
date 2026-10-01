<script setup lang="ts">
/**
 * Conversations — list, transcript and details in one screen (no bouncing
 * between pages to triage).
 *
 *   ┌ list (search · All / Handoffs / No answer) ┬ transcript ───────────┬ details ┐
 *   │ question (headline)                        │ visitor → right       │ visitor │
 *   │ answer preview · page · msgs · status      │ assistant ← left      │ page    │
 *   │ ● unread = someone is waiting              │ — handed off —        │ flow    │
 *   │                                            │                       │ AI cost │
 *   └────────────────────────────────────────────┴───────────────────────┴─────────┘
 *
 * The selection is ?id= on /assistant/chats, so picking a conversation does
 * not reload the list; /assistant/chats/<id> redirects here.
 *
 * Only what the API records is shown. Sources/citations render when a
 * message carries `sources` (the backend does not store them yet); there is
 * no staff-reply endpoint, so a handoff offers "Reply by email" + notes.
 */
import { useAssistantAdmin } from '../composables/useAssistantAdmin'
import type { AssistantChat, AssistantChatDetail, AssistantHandoff, HandoffStatus } from '../types'

interface Source { title: string, url?: string, path?: string, score?: number, snippet?: string }
type Msg = { role: string, content: string, timestamp?: string, sources?: Source[] }

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { listChats, getChat, listHandoffs, patchHandoff } = useAssistantAdmin()

// ── list ────────────────────────────────────────────────────────────
const chats = ref<AssistantChat[]>([])
const handoffs = ref<AssistantHandoff[]>([])
const nextCursor = ref<string | undefined>()
const total = ref<number | undefined>() // this tab, across all pages, from the API
const serverCounts = ref<Record<string, number> | undefined>() // every tab, from the API
const handoffStatus = ref<Record<string, HandoffStatus>>({}) // by chat id
const loadingList = ref(true)
const listError = ref<string | null>(null)
const search = ref('')
const tab = ref<'all' | 'handoffs' | 'noanswer'>('all')

// Search runs server-side over the whole tab (go-assistant ≥ v0.3.6);
// the local filter below still narrows the loaded rows on older APIs.
const query = () => search.value.trim() || undefined
let listSeq = 0 // a newer load (typing, tab switch) wins over a slower older one

async function loadList(cursor?: string) {
  const seq = ++listSeq
  loadingList.value = !cursor
  listError.value = null
  try {
    const [c, h] = await Promise.all([
      listChats({ limit: 50, cursor, view: tab.value, q: query() }),
      cursor ? Promise.resolve(null) : listHandoffs({ limit: 200 }).catch(() => null),
    ])
    if (seq !== listSeq) return
    chats.value = cursor ? [...chats.value, ...(c.items || [])] : (c.items || [])
    nextCursor.value = c.nextCursor
    if (!cursor) {
      total.value = typeof c.total === 'number' ? c.total : undefined
      serverCounts.value = c.counts
    }
    if (h) handoffs.value = h.items || []
    mergeHandoffs(c.handoffs)
    handoffStatus.value = { ...(cursor ? handoffStatus.value : {}), ...(c.handoffStatus || {}) }
    syncNavCounts()
  } catch (e: any) {
    if (seq !== listSeq) return
    listError.value = e?.data?.detail || e?.message || 'Could not load conversations'
  } finally {
    if (seq === listSeq) loadingList.value = false
  }
}

// The page's own handoffs (any status) join the pending ones loaded above —
// the detail pane and the badges of taken/resolved chats need them.
function mergeHandoffs(list?: AssistantHandoff[]) {
  if (!list?.length) return
  const byId = new Map(handoffs.value.map(h => [h.id, h]))
  for (const h of list) byId.set(h.id, { ...byId.get(h.id), ...h })
  handoffs.value = [...byId.values()]
}

// Tabs are filtered server-side: switching reloads that tab's list.
watch(tab, () => loadList())
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadList(), 300)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

// After a handoff changes, re-read the counts (one row is enough).
async function refreshCounts() {
  try {
    const c = await listChats({ limit: 1, view: tab.value, q: query() })
    if (c.counts) serverCounts.value = c.counts
    if (typeof c.total === 'number') total.value = c.total
    syncNavCounts()
  } catch { /* the old numbers stay */ }
}

// The menu shows live counts (useNavBadges, base layer); this screen has the
// freshest numbers, so it updates them. The conversation total comes from the
// API; without one, only when the whole list is loaded (a partial count lies).
const navBadges = useNavBadges()
function syncNavCounts() {
  if (!query()) { // a search narrows the counts; the menu keeps the full one
    const all = serverCounts.value?.all ?? (tab.value === 'all' ? total.value : undefined)
    if (all !== undefined) navBadges.set('/assistant/chats', all > 99 ? '99+' : all)
    else if (!nextCursor.value) navBadges.set('/assistant/chats', chats.value.length)
  }
  navBadges.set('/assistant/handoffs', handoffs.value.filter(h => h.status === 'pending').length)
}

const handoffFor = (c: { sessionId?: string, handoffId?: string }) =>
  handoffs.value.find(h => (c.handoffId && h.id === c.handoffId) || (c.sessionId && h.sessionId === c.sessionId))

type Status = 'waiting' | 'taken' | 'resolved' | 'answered' | 'noanswer'
const STATUS: Record<Status, { label: string, color: 'warning' | 'info' | 'success' | 'neutral' }> = {
  waiting: { label: 'Handoff', color: 'warning' },
  taken: { label: 'Taken over', color: 'info' },
  resolved: { label: 'Resolved', color: 'success' },
  answered: { label: 'Answered', color: 'success' },
  noanswer: { label: 'No answer', color: 'neutral' },
}
function statusOf(c: AssistantChat): Status {
  const st = handoffFor(c)?.status ?? handoffStatus.value[c.id]
  if (st === 'pending') return 'waiting'
  if (st === 'contacted') return 'taken'
  if (st === 'resolved') return 'resolved'
  return (c.messages || []).some(m => m.role === 'assistant') ? 'answered' : 'noanswer'
}
const firstUser = (c: AssistantChat) => c.messages?.find(m => m.role === 'user')?.content || '(no question)'
const firstAnswer = (c: AssistantChat) => c.messages?.find(m => m.role === 'assistant')?.content || ''
const pagePath = (c: AssistantChat) => {
  const p = (c.meta as { page?: string } | undefined)?.page
  if (!p) return ''
  try { return new URL(p).pathname } catch { return p }
}

const local = (n: number) => (n && nextCursor.value ? `${n}+` : n)
const counts = computed(() => ({
  // exact per-tab counts from the API; an older API → what is loaded,
  // with "+" while more pages remain
  all: serverCounts.value?.all ?? total.value ?? local(chats.value.length),
  handoffs: serverCounts.value?.handoffs ?? local(chats.value.filter(c => ['waiting', 'taken'].includes(statusOf(c))).length),
  noanswer: serverCounts.value?.noanswer ?? local(chats.value.filter(c => statusOf(c) === 'noanswer').length),
}))
const tabs = computed(() => [
  { label: 'All', value: 'all', badge: counts.value.all || undefined },
  { label: 'Handoffs', value: 'handoffs', badge: counts.value.handoffs || undefined },
  { label: 'No answer', value: 'noanswer', badge: counts.value.noanswer || undefined },
])
const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  return chats.value
    .filter(c => tab.value === 'all' || (tab.value === 'handoffs' ? ['waiting', 'taken'].includes(statusOf(c)) : statusOf(c) === 'noanswer'))
    .filter(c => !q || (c.messages || []).some(m => m.content?.toLowerCase().includes(q)))
    .slice().sort((a, b) => +new Date(b.lastAt || b.startedAt) - +new Date(a.lastAt || a.startedAt))
})

// ── selection + detail ──────────────────────────────────────────────
const selectedId = computed(() => (typeof route.query.id === 'string' ? route.query.id : ''))
const chat = ref<AssistantChatDetail | null>(null)
const loadingChat = ref(false)
const chatError = ref<string | null>(null)

function select(id: string) {
  router.replace({ query: { ...route.query, id } })
}
async function loadChat(id: string) {
  if (!id) { chat.value = null; return }
  loadingChat.value = true
  chatError.value = null
  try {
    chat.value = await getChat(id)
  } catch (e: any) {
    chat.value = null
    chatError.value = e?.data?.detail || e?.message || 'Could not load this conversation'
  } finally {
    loadingChat.value = false
  }
}
watch(selectedId, id => loadChat(id))

const handoff = computed(() => (chat.value ? handoffFor(chat.value) : undefined))
const status = computed<Status | null>(() => (chat.value ? statusOf(chat.value) : null))

// Transcript split at the handoff: what the assistant handled, then a divider.
const messages = computed<Msg[]>(() => (chat.value?.messages || []) as Msg[])
const splitAt = computed(() => {
  const at = handoff.value?.created_at ? +new Date(handoff.value.created_at) : 0
  if (!at) return messages.value.length
  const i = messages.value.findIndex(m => m.timestamp && +new Date(m.timestamp) > at)
  return i < 0 ? messages.value.length : i
})
const before = computed(() => messages.value.slice(0, splitAt.value))
const after = computed(() => messages.value.slice(splitAt.value))
const sourcesUsed = computed(() => {
  const seen = new Map<string, Source>()
  for (const m of messages.value) for (const s of m.sources || []) if (!seen.has(s.title)) seen.set(s.title, s)
  return [...seen.values()]
})

async function copy(text: string, what = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast.add({ title: what, color: 'success', icon: 'i-lucide-check' }) } catch { /* no clipboard */ }
}
const msgActions = (m: Msg) => [{ label: 'Copy', icon: 'i-lucide-copy', onClick: () => copy(m.content) }]

// ── handoff actions (what the API supports: status + notes) ─────────
const busy = ref<HandoffStatus | 'notes' | ''>('')
const notes = ref('')
watch(handoff, h => { notes.value = h?.notes || '' }, { immediate: true })
async function setStatus(s: HandoffStatus) {
  if (!handoff.value) return
  busy.value = s
  try {
    const updated = await patchHandoff(handoff.value.id, { status: s })
    handoffs.value = handoffs.value.map(h => (h.id === updated.id ? { ...h, ...updated } : h))
    void refreshCounts()
    toast.add({ title: s === 'resolved' ? 'Marked as resolved' : s === 'contacted' ? 'Marked as taken over' : 'Updated', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Not saved', description: e?.data?.detail || e?.message, color: 'error' })
  } finally { busy.value = '' }
}
async function saveNotes() {
  if (!handoff.value) return
  busy.value = 'notes'
  try {
    const updated = await patchHandoff(handoff.value.id, { notes: notes.value })
    handoffs.value = handoffs.value.map(h => (h.id === updated.id ? { ...h, ...updated } : h))
    toast.add({ title: 'Notes saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Not saved', description: e?.data?.detail || e?.message, color: 'error' })
  } finally { busy.value = '' }
}

// ── formatting ──────────────────────────────────────────────────────
function ago(iso?: string) {
  if (!iso) return ''
  const m = Math.round((Date.now() - +new Date(iso)) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} d`
}
const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '')
function fmtCost(usd?: number) {
  if (!usd || usd <= 0) return '$0.00'
  if (usd < 0.01) return '$' + usd.toFixed(Math.min(8, Math.max(2, Math.ceil(-Math.log10(usd)) + 1)))
  return '$' + usd.toFixed(usd < 1 ? 4 : 2)
}
const visitor = computed(() => {
  const c = chat.value
  if (!c) return ''
  if (c.userId && !/^0+$/.test(c.userId)) return `user ${c.userId.slice(-6)}`
  return c.anonId ? 'Anonymous visitor' : 'Visitor'
})

onMounted(async () => {
  await loadList()
  if (selectedId.value) await loadChat(selectedId.value)
})
</script>

<template>
  <AdminPage title="Conversations" description="What visitors asked, and how each one was handled." body-class="p-0 flex min-h-0 flex-1 overflow-hidden">
    <template #title>
      <span class="truncate">Conversations</span>
      <UBadge v-if="counts.all" :label="String(counts.all)" color="neutral" variant="soft" size="sm" />
    </template>

    <div class="flex min-h-0 w-full flex-1">
      <!-- ── list ── -->
      <aside
        class="flex min-h-0 w-full shrink-0 flex-col border-e border-default lg:w-[380px]"
        :class="selectedId ? 'hidden lg:flex' : 'flex'"
      >
        <div class="space-y-3 border-b border-default p-3">
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search questions and answers" class="w-full" />
          <UTabs v-model="tab" :items="tabs" :content="false" variant="pill" size="xs" color="neutral" />
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto">
          <div v-if="loadingList" class="space-y-4 p-4">
            <div v-for="i in 6" :key="i" class="space-y-2">
              <USkeleton class="h-4 w-3/4" /><USkeleton class="h-3 w-full" />
            </div>
          </div>
          <UAlert v-else-if="listError" color="error" variant="subtle" :title="listError" class="m-3" />
          <UEmpty
            v-else-if="!visible.length"
            variant="naked"
            :icon="search ? 'i-lucide-search-x' : 'i-lucide-message-circle'"
            :title="search ? 'No matches' : tab === 'all' ? 'No conversations yet' : 'Nothing here'"
            :description="search ? 'Try other words.' : tab === 'all' ? 'When visitors ask the assistant something, it shows up here.' : 'No conversations in this view.'"
          />
          <ul v-else>
            <li v-for="c in visible" :key="c.id">
              <button
                type="button"
                class="relative block w-full border-b border-default px-4 py-3 text-left transition-colors hover:bg-elevated/50"
                :class="selectedId === c.id ? 'bg-primary/5 before:absolute before:inset-y-0 before:start-0 before:w-0.5 before:bg-primary' : ''"
                @click="select(c.id)"
              >
                <div class="flex items-start gap-2">
                  <span v-if="statusOf(c) === 'waiting'" class="mt-1.5 size-2 shrink-0 rounded-full bg-warning" aria-label="Waiting for a person" />
                  <p class="min-w-0 flex-1 truncate text-sm" :class="statusOf(c) === 'waiting' ? 'font-semibold text-highlighted' : 'font-medium text-highlighted'">{{ firstUser(c) }}</p>
                  <span class="shrink-0 text-xs text-dimmed">{{ ago(c.lastAt || c.startedAt) }}</span>
                </div>
                <p class="mt-0.5 truncate text-sm text-muted">
                  {{ statusOf(c) === 'waiting' ? 'Handed off — waiting for your reply' : firstAnswer(c) || 'No answer yet' }}
                </p>
                <div class="mt-2 flex items-center justify-between gap-2">
                  <span class="truncate text-xs text-dimmed">{{ [pagePath(c), `${c.messages?.length || 0} msgs`].filter(Boolean).join(' · ') }}</span>
                  <UBadge :label="STATUS[statusOf(c)].label" :color="STATUS[statusOf(c)].color" variant="subtle" size="sm" class="shrink-0" />
                </div>
              </button>
            </li>
          </ul>
          <div v-if="nextCursor && !loadingList" class="p-3">
            <UButton block color="neutral" variant="ghost" label="Load more" @click="loadList(nextCursor)" />
          </div>
        </div>
      </aside>

      <!-- ── transcript ── -->
      <section class="min-w-0 flex-1 flex-col" :class="selectedId ? 'flex' : 'hidden lg:flex'">
        <UEmpty
          v-if="!selectedId"
          class="m-auto"
          variant="naked"
          icon="i-lucide-messages-square"
          title="Pick a conversation"
          description="Its transcript, what it cost and any handoff open here."
        />
        <template v-else>
          <!-- detail header: question, state, actions -->
          <div class="flex min-h-[49px] items-center gap-2 border-b border-default px-4 py-2">
            <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="sm" square aria-label="Back to the list" class="lg:hidden" @click="router.replace({ query: {} })" />
            <USkeleton v-if="loadingChat && !chat" class="h-5 w-64" />
            <template v-else-if="chat">
              <h2 class="min-w-0 truncate text-sm font-semibold text-highlighted">{{ firstUser(chat) }}</h2>
              <span v-if="status" class="hidden shrink-0 items-center gap-1.5 text-xs text-muted sm:inline-flex">
                <span class="size-1.5 rounded-full" :class="{ 'bg-warning': status === 'waiting', 'bg-info': status === 'taken', 'bg-success': status === 'resolved' || status === 'answered', 'bg-accented': status === 'noanswer' }" />
                {{ STATUS[status].label }}
              </span>
              <div class="ms-auto flex shrink-0 items-center gap-1.5">
                <template v-if="handoff">
                  <UButton
                    v-if="handoff.status === 'pending'"
                    label="Take over"
                    icon="i-lucide-hand"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    :loading="busy === 'contacted'"
                    @click="setStatus('contacted')"
                  />
                  <UButton
                    v-if="handoff.status === 'pending' || handoff.status === 'contacted'"
                    label="Resolve"
                    icon="i-lucide-check"
                    size="sm"
                    :loading="busy === 'resolved'"
                    @click="setStatus('resolved')"
                  />
                </template>
              </div>
            </template>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto">
            <UAlert v-if="chatError" color="error" variant="subtle" :title="chatError" class="m-4" />
            <div v-else-if="loadingChat && !chat" class="space-y-6 p-6">
              <USkeleton class="ms-auto h-10 w-2/3" /><USkeleton class="h-20 w-3/4" /><USkeleton class="ms-auto h-10 w-1/2" />
            </div>
            <div v-else-if="chat" class="mx-auto max-w-3xl space-y-5 px-4 py-6">
              <template v-for="(part, pi) in [before, after]" :key="pi">
                <div v-if="pi === 1 && handoff" class="flex items-center gap-3 text-xs text-muted">
                  <USeparator class="flex-1" />
                  <span class="inline-flex shrink-0 items-center gap-1.5">
                    <UIcon name="i-lucide-headphones" class="size-3.5" />
                    Handed off to the team · {{ time(handoff.created_at) }}<template v-if="handoff.status !== 'pending'"> · {{ STATUS[status || 'taken'].label.toLowerCase() }}</template>
                  </span>
                  <USeparator class="flex-1" />
                </div>
                <div v-for="(m, i) in part" :key="`${pi}-${i}`">
                  <UChatMessage
                    :id="`${pi}-${i}`"
                    :role="m.role"
                    :parts="[]"
                    :content="m.content"
                    :side="m.role === 'user' ? 'right' : 'left'"
                    :variant="m.role === 'user' ? 'soft' : 'naked'"
                    :avatar="m.role === 'user' ? undefined : { icon: 'i-lucide-sparkles' }"
                    :actions="m.role === 'user' ? undefined : msgActions(m)"
                    :ui="{ content: 'whitespace-pre-line text-sm/6' }"
                  />
                  <!-- what the answer was grounded on, when the backend records it -->
                  <div v-if="m.sources?.length" class="ms-11 mt-2 flex flex-wrap gap-1.5">
                    <component
                      :is="s.url ? 'a' : 'span'"
                      v-for="(s, si) in m.sources"
                      :key="si"
                      v-bind="s.url ? { href: s.url, target: '_blank', rel: 'noopener' } : {}"
                      :title="s.url || s.title"
                      class="inline-flex"
                    >
                      <UBadge color="neutral" variant="outline" size="sm" icon="i-lucide-file-text" :trailing-icon="s.url ? 'i-lucide-arrow-up-right' : undefined" :class="s.url ? 'cursor-pointer hover:bg-elevated' : ''">
                        {{ s.title || s.path || s.url }}<span v-if="s.score != null" class="ms-1 tabular-nums text-dimmed">{{ s.score.toFixed(2) }}</span>
                      </UBadge>
                    </component>
                  </div>
                  <p class="mt-1 text-xs text-dimmed" :class="m.role === 'user' ? 'text-right' : 'ms-11'">
                    {{ m.role === 'user' ? 'Visitor' : 'Assistant' }}<template v-if="m.timestamp"> · {{ time(m.timestamp) }}</template>
                  </p>
                </div>
              </template>
            </div>
          </div>
        </template>
      </section>

      <!-- ── details ── -->
      <aside v-if="selectedId && chat" class="hidden w-80 shrink-0 overflow-y-auto border-s border-default p-4 xl:block">
        <div v-if="handoff" class="mb-6 space-y-3">
          <h3 class="text-sm font-semibold text-highlighted">Handoff</h3>
          <p v-if="handoff.reason" class="text-sm text-default">{{ handoff.reason }}</p>
          <dl class="space-y-1.5 text-sm">
            <div class="flex justify-between gap-3"><dt class="text-muted">Status</dt><dd><UBadge :label="STATUS[status || 'waiting'].label" :color="STATUS[status || 'waiting'].color" variant="subtle" size="sm" /></dd></div>
            <div class="flex justify-between gap-3"><dt class="text-muted">Priority</dt><dd class="capitalize text-highlighted">{{ handoff.priority }}</dd></div>
            <div v-if="handoff.email" class="flex justify-between gap-3"><dt class="text-muted">Email</dt><dd class="truncate text-highlighted">{{ handoff.email }}</dd></div>
            <div v-if="handoff.phone" class="flex justify-between gap-3"><dt class="text-muted">Phone</dt><dd class="text-highlighted">{{ handoff.phone }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-muted">Asked</dt><dd class="text-highlighted">{{ when(handoff.created_at) }}</dd></div>
          </dl>
          <UButton v-if="handoff.email" :to="`mailto:${handoff.email}?subject=${encodeURIComponent('Re: ' + firstUser(chat))}`" label="Reply by email" icon="i-lucide-mail" color="neutral" variant="outline" size="sm" block />
          <UFormField label="Notes" description="Only your team sees these.">
            <UTextarea v-model="notes" :rows="3" autoresize class="w-full" placeholder="What you did, what's next…" />
          </UFormField>
          <UButton label="Save notes" size="sm" color="neutral" variant="soft" :loading="busy === 'notes'" :disabled="notes === (handoff.notes || '')" @click="saveNotes" />
        </div>

        <div v-if="sourcesUsed.length" class="mb-6 space-y-2">
          <div class="flex items-baseline justify-between">
            <h3 class="text-sm font-semibold text-highlighted">Sources used</h3>
            <span class="text-xs text-muted">{{ sourcesUsed.length }}</span>
          </div>
          <component
            :is="s.url ? 'a' : 'div'"
            v-for="(s, i) in sourcesUsed"
            :key="i"
            v-bind="s.url ? { href: s.url, target: '_blank', rel: 'noopener' } : {}"
            class="group block rounded-lg border border-default p-3"
            :class="s.url ? 'transition-colors hover:border-accented hover:bg-elevated/50' : ''"
          >
            <div class="flex items-start justify-between gap-2">
              <p class="text-sm font-medium text-highlighted">{{ i + 1 }}. {{ s.title || s.path || s.url }}</p>
              <span v-if="s.score != null" class="shrink-0 text-xs tabular-nums text-muted">{{ s.score.toFixed(2) }}</span>
            </div>
            <p v-if="s.snippet" class="mt-1 line-clamp-3 text-xs text-muted">{{ s.snippet }}</p>
            <p v-if="s.url" class="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs text-muted group-hover:text-primary">
              <span class="truncate">{{ s.url.replace(/^https?:\/\//, '') }}</span><UIcon name="i-lucide-arrow-up-right" class="size-3 shrink-0" />
            </p>
          </component>
        </div>

        <h3 class="text-sm font-semibold text-highlighted">Details</h3>
        <dl class="mt-3 space-y-2 text-sm">
          <div class="flex justify-between gap-3"><dt class="text-muted">Visitor</dt><dd class="truncate text-highlighted">{{ visitor }}</dd></div>
          <div v-if="pagePath(chat)" class="flex justify-between gap-3"><dt class="text-muted">Page</dt><dd class="truncate font-mono text-xs text-highlighted">{{ pagePath(chat) }}</dd></div>
          <div v-if="chat.flowName || chat.flowId" class="flex justify-between gap-3"><dt class="text-muted">Flow</dt><dd class="truncate text-highlighted">{{ chat.flowName || chat.flowId }}</dd></div>
          <div v-if="chat.variantLabel" class="flex justify-between gap-3"><dt class="text-muted">Variant</dt><dd class="text-highlighted">{{ chat.variantLabel }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-muted">Started</dt><dd class="text-highlighted">{{ when(chat.startedAt) }}</dd></div>
          <template v-if="chat.usage?.total?.calls">
            <div class="flex justify-between gap-3"><dt class="text-muted">AI calls</dt><dd class="tabular-nums text-highlighted">{{ chat.usage.total.calls }} · {{ chat.usage.total.totalTokens.toLocaleString() }} tokens</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-muted">Cost · latency</dt><dd class="tabular-nums text-highlighted">{{ fmtCost(chat.usage.total.costUsd) }} · {{ Math.round(chat.usage.total.avgLatencyMs) }} ms</dd></div>
          </template>
          <div v-else class="flex justify-between gap-3"><dt class="text-muted">AI calls</dt><dd class="text-dimmed">not recorded</dd></div>
        </dl>
        <button type="button" class="mt-4 inline-flex max-w-full items-center gap-1.5 truncate font-mono text-xs text-dimmed hover:text-muted" :title="chat.sessionId" @click="copy(chat.sessionId, 'Session id copied')">
          <span class="truncate">{{ chat.sessionId }}</span><UIcon name="i-lucide-copy" class="size-3.5 shrink-0" />
        </button>
      </aside>
    </div>
  </AdminPage>
</template>
