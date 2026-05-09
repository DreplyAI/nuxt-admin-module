/**
 * Assistant admin — overlay module for the dreplyai/go-assistant
 * kernel. Shipped in @dreplyai/nuxt-admin-module so every project
 * consuming the assistant kernel (flowdsl/admin, redelay/admin,
 * external customers) gets the same chats + handoffs + templates
 * UI without copy-pasting Vue files.
 *
 * Backed by github.com/dreplyai/go-assistant/admin:
 *   GET   /admin/assistant/chats
 *   GET   /admin/assistant/chats/{id}
 *   GET   /admin/assistant/handoffs
 *   GET   /admin/assistant/handoffs/{id}
 *   PATCH /admin/assistant/handoffs/{id}
 *   POST  /admin/assistant/reset
 *   GET   /admin/assistant/templates
 */
export default defineRedelayModule({
  id: 'assistant',
  name: 'Assistant',
  version: '1.0.0',
  description: 'AI assistant chats + human-handoff inbox',
  icon: 'i-heroicons-chat-bubble-left-right',

  navigation: {
    label: 'Assistant',
    icon: 'i-heroicons-chat-bubble-left-right',
    group: 'apps',
    order: 200,
    children: [
      { label: 'Conversations', href: '/assistant/chats', icon: 'i-heroicons-chat-bubble-bottom-center-text', order: 1 },
      { label: 'Handoffs', href: '/assistant/handoffs', icon: 'i-heroicons-envelope-open', order: 2 },
      // Templates catalog — embedded flow variants operators can
      // activate with one click. Sibling to Conversations +
      // Handoffs since all three operate on the same assistant
      // deployment.
      { label: 'Templates', href: '/assistant/templates', icon: 'i-heroicons-squares-2x2', order: 3 },
    ],
  },

  permissions: [],
  requiredPermissions: [],

  async onInit() {
    // No init work — composables are page-local.
  },
})
