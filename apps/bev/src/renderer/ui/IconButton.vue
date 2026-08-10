<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

import { computed } from 'vue'

import Button from './Button.vue'

export type IconButtonSize = 'xs' | 'sm' | 'md'
export type IconButtonSurface = 'ghost' | 'raised'

const props = withDefaults(defineProps<{
  label: string
  title?: string
  size?: IconButtonSize
  surface?: IconButtonSurface
  active?: boolean
}>(), {
  size: 'md',
  surface: 'ghost',
  active: false,
})

const sizeClasses: Record<IconButtonSize, HTMLAttributes['class']> = {
  xs: 'size-5 rounded',
  sm: 'size-6 rounded-md',
  md: 'size-7 rounded-lg',
}

const surfaceClasses: Record<IconButtonSurface, HTMLAttributes['class']> = {
  ghost: 'shadow-none',
  raised: [
    'bg-[var(--surface-item)] shadow-sm backdrop-blur-xl',
    'hover:bg-[var(--surface-item-hover)]',
  ],
}

const classes = computed<HTMLAttributes['class']>(() => [
  'inline-flex shrink-0 items-center justify-center p-0 [font-family:inherit]',
  'text-[var(--text-secondary)] transition-colors',
  'hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
  'focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
  'disabled:pointer-events-none disabled:opacity-50',
  sizeClasses[props.size],
  surfaceClasses[props.surface],
  props.active
    ? 'bg-[var(--surface-selected)] text-[var(--text-primary)]'
    : props.surface === 'ghost' && 'bg-transparent',
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
