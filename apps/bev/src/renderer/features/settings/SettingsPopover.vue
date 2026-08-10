<script setup lang="ts">
import {
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui'
import { shallowRef } from 'vue'

const open = shallowRef(false)

const props = defineProps<{
  fontSize: number
}>()

const emit = defineEmits<{
  setFontSize: [value: number]
}>()

function updateFontSize(event: Event): void {
  const input = event.currentTarget as HTMLInputElement
  emit('setFontSize', input.valueAsNumber)
}
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button
        :class="[
          'inline-flex size-7 items-center justify-center p-0',
          'border border-[var(--border-subtle)] rounded-lg',
          'bg-[var(--surface-item)] text-[var(--text-secondary)] shadow-sm backdrop-blur-xl',
          'transition-colors hover:bg-[var(--surface-item-hover)] hover:text-[var(--text-primary)]',
          'focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
        ]"
        type="button"
        aria-label="Open interface settings"
        title="Interface settings"
      >
        <div
          aria-hidden="true"
          :class="[
            'size-3.5',
            open ? 'i-mingcute:settings-3-fill' : 'i-mingcute:settings-3-line',
          ]"
        />
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        :class="[
          'z-100 w-64 p-3',
          'border border-[var(--border-strong)] rounded-2xl',
          'bg-[var(--surface-popover)] text-[var(--text-primary)] shadow-[var(--shadow-popover)] backdrop-blur-3xl',
        ]"
        side="bottom"
        align="end"
        :side-offset="7"
        :collision-padding="8"
      >
        <div class="mb-3 flex items-start gap-2">
          <div aria-hidden="true" class="i-mingcute:font-size-line size-4 shrink-0 text-[var(--accent)]" />
          <div class="min-w-0">
            <h2 class="m-0 [font-size:var(--font-size-ui)] font-620">
              Interface size
            </h2>
            <p class="m-0 mt-1 [font-size:var(--font-size-ui-xs)] leading-4 text-[var(--text-muted)]">
              Adjust text across the Explorer, tabs, canvas, and inspector.
            </p>
          </div>
        </div>

        <label class="flex flex-col gap-2">
          <span class="flex items-center justify-between [font-size:var(--font-size-ui-sm)] text-[var(--text-secondary)]">
            Font size
            <output class="font-[var(--font-mono)] tabular-nums text-[var(--text-primary)]">
              {{ props.fontSize }} px
            </output>
          </span>
          <input
            class="w-full accent-[var(--accent)]"
            type="range"
            min="11"
            max="16"
            step="1"
            :value="props.fontSize"
            @input="updateFontSize"
          >
        </label>

        <div class="mt-2 flex justify-between [font-size:var(--font-size-ui-xs)] text-[var(--text-muted)]">
          <span>Compact</span>
          <span>Large</span>
        </div>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
