<script setup lang="ts">
import type { OutlineSymbol } from '../../../shared/workspace'
import type { ContextReference } from '../workspace/model'

import { computed } from 'vue'

import SymbolCard from './SymbolCard.vue'

const props = defineProps<{
  symbols: OutlineSymbol[]
  path: string
  languageId: string
  annotationMode: boolean
  selectedIds: Set<string>
}>()

const emit = defineEmits<{
  annotate: [reference: ContextReference, point: { x: number, y: number }]
  addContext: [reference: ContextReference]
  inspect: [reference: ContextReference]
  preview: [reference: ContextReference]
  clearPreview: [reference: ContextReference]
}>()

const groups = computed(() => [
  {
    label: 'Modules',
    icon: 'i-mingcute:package-2-line',
    symbols: props.symbols.filter(symbol => [2, 3, 4].includes(symbol.kind)),
  },
  {
    label: 'Types & Traits',
    icon: 'i-mingcute:components-line',
    symbols: props.symbols.filter(symbol => [5, 10, 11, 23].includes(symbol.kind)),
  },
  {
    label: 'Implementations',
    icon: 'i-mingcute:git-merge-line',
    symbols: props.symbols.filter(symbol => symbol.kind === 19),
  },
  {
    label: 'Functions & Values',
    icon: 'i-mingcute:braces-line',
    symbols: props.symbols.filter(symbol => ![2, 3, 4, 5, 10, 11, 19, 23].includes(symbol.kind)),
  },
].filter(group => group.symbols.length > 0))

function forwardAnnotation(reference: ContextReference, point: { x: number, y: number }): void {
  emit('annotate', reference, point)
}
</script>

<template>
  <div class="flex items-start gap-4">
    <section v-for="group in groups" :key="group.label" class="w-80 shrink-0">
      <header class="mb-1.5 flex h-7 items-center gap-2 px-1 [font-size:var(--font-size-ui-xs)] text-[var(--text-secondary)]">
        <div aria-hidden="true" :class="[group.icon, 'size-3.5']" />
        <strong class="font-620">{{ group.label }}</strong>
        <span class="ml-auto tabular-nums text-[var(--text-muted)] font-[var(--font-mono)]">
          {{ group.symbols.length }}
        </span>
      </header>
      <div class="flex flex-col gap-1.5">
        <SymbolCard
          v-for="symbol in group.symbols"
          :key="symbol.id"
          :symbol="symbol"
          :path="path"
          :language-id="languageId"
          :annotation-mode="annotationMode"
          :selected-ids="selectedIds"
          @annotate="forwardAnnotation"
          @add-context="emit('addContext', $event)"
          @inspect="emit('inspect', $event)"
          @preview="emit('preview', $event)"
          @clear-preview="emit('clearPreview', $event)"
        />
      </div>
    </section>
  </div>
</template>
