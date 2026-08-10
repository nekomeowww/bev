<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { computed } from 'vue'

import Button from './Button.vue'

export type ActionButtonSize = 'compact' | 'default'
export type ActionButtonTone = 'neutral' | 'primary' | 'danger'

const props = withDefaults(defineProps<{
  size?: ActionButtonSize
  tone?: ActionButtonTone
}>(), {
  size: 'default',
  tone: 'neutral',
})

const sizeClasses: Record<ActionButtonSize, HTMLAttributes['class']> = {
  compact: 'h-5 gap-1 rounded-md px-1.5 [font-size:var(--font-size-ui-2xs)]',
  default: 'h-8 gap-1.5 rounded-lg px-3 text-sm',
}

const toneClasses: Record<ActionButtonTone, HTMLAttributes['class']> = {
  neutral: [
    'bg-[var(--surface-item)] text-[var(--text-secondary)]',
    'hover:bg-[var(--surface-item-hover)] hover:text-[var(--text-primary)]',
  ],
  primary: 'bg-[var(--accent)] text-white hover:opacity-90',
  danger: [
    'bg-transparent text-[#ce6c64]',
    'hover:bg-[#ce6c6418]',
  ],
}

const classes = computed<HTMLAttributes['class']>(() => [
  'inline-flex items-center justify-center [font-family:inherit] font-600 transition-colors',
  'focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
  'disabled:pointer-events-none disabled:opacity-60',
  sizeClasses[props.size],
  toneClasses[props.tone],
])
</script>

<template>
  <Button :class="classes">
    <slot />
  </Button>
</template>
