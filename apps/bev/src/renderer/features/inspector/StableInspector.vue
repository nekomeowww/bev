<script setup lang="ts">
import SourceDetails from './SourceDetails.vue'

defineProps<{
  open: boolean
}>()
</script>

<template>
  <div
    class="pointer-events-none absolute bottom-0 right-0 top-9.5 z-40 w-90 overflow-hidden"
    :aria-hidden="!open"
  >
    <div
      :class="[
        'h-full w-90',
        'transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none',
        open
          ? 'pointer-events-auto [transform:translateX(0)] opacity-100'
          : 'pointer-events-none [transform:translateX(100%)] opacity-0',
      ]"
      :inert="!open"
    >
      <SourceDetails />
    </div>
  </div>
</template>
