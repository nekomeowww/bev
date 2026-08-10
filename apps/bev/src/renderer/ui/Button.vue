<script setup lang="ts">
withDefaults(defineProps<{
  type?: 'button' | 'submit' | 'reset'
}>(), {
  type: 'button',
})
</script>

<template>
  <button
    class="m-0 appearance-none border-0 outline-none"
    :type="type"
  >
    <slot />
  </button>
</template>
