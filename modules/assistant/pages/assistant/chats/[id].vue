<script setup lang="ts">
// Old deep links (/assistant/chats/<id>, e.g. from a handoff or an email)
// open the conversation in the workspace.
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth'],
  ssr: false,
})
const route = useRoute()
await navigateTo({ path: '/assistant/chats', query: { id: decodeURIComponent(String(route.params.id)) } }, { replace: true })
</script>

<template>
  <div />
</template>
