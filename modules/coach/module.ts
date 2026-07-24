/**
 * Coach admin — overlay module for a go-assistant-core
 * `record`/`adminkit` recommendation surface. Ships in
 * @dreplyai/nuxt-admin-module so any project generating persisted
 * AI recommendations on the shared kernel (gymtracer, fitniac, …)
 * gets the same monitoring UI without copy-pasting Vue files.
 *
 * Unlike the assistant overlay (chat threads + human handoffs),
 * the coach surface monitors PROACTIVE recommendations — one
 * audit record per generation, with an LLM usage roll-up and a
 * review lifecycle (new → reviewed / flagged / dismissed).
 *
 * Backed by <project>/backend/modules/coach/admin:
 *   GET   /admin/coach/recommendations
 *   GET   /admin/coach/recommendations/stats
 *   GET   /admin/coach/recommendations/kinds
 *   GET   /admin/coach/recommendations/{id}
 *   PATCH /admin/coach/recommendations/{id}
 */
export default defineRedelayModule({
  id: 'coach',
  name: 'Coach',
  version: '1.0.0',
  description: 'AI coach recommendations — audit log, usage + review',
  icon: 'i-heroicons-sparkles',

  navigation: {
    label: 'AI Coach',
    icon: 'i-heroicons-sparkles',
    group: 'apps',
    order: 210,
    children: [
      { label: 'Recommendations', href: '/coach/recommendations', icon: 'i-heroicons-light-bulb', order: 1 },
    ],
  },

  permissions: [],
  requiredPermissions: [],

  async onInit() {
    // No init work — composables are page-local.
  },
})
