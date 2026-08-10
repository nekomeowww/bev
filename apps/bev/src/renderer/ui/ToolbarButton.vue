<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { computed } from 'vue'

import Button from './Button.vue'

export type ToolbarButtonSize = 'sm' | 'md'

const props = withDefaults(defineProps<{
  label: string
  title?: string
  size?: ToolbarButtonSize
  active?: boolean
}>(), {
  size: 'md',
  active: false,
})

const sizeClasses: Record<ToolbarButtonSize, HTMLAttributes['class']> = {
  sm: 'size-6',
  md: 'size-7',
}

const classes = computed<HTMLAttributes['class']>(() => [
  'inline-flex shrink-0 items-center justify-center rounded-md p-0 [font-family:inherit]',
  'text-[var(--text-secondary)] transition-colors',
  'hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
  'focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
  'disabled:cursor-wait disabled:opacity-60',
  sizeClasses[props.size],
  props.active
    ? 'bg-[var(--surface-selected)] text-[var(--accent)]'
    : 'bg-transparent',
])
</script>

<template>
  <Button
    :class="classes"
    :aria-label="label"
    :title="title ?? label"
  >
    <slot />
  </Button>
</template>
