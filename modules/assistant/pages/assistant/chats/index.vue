<script setup lang="ts">
// Conversations: list + transcript + details in one screen
// (components/ConversationWorkspace.vue). The selection is ?id=.
definePageMeta({
  layout: 'dashboard',
  middleware: ['auth'],
  ssr: false,
})
useHead({ title: 'Conversations' })
</script>

<template>
  <ConversationWorkspace />
</template>
