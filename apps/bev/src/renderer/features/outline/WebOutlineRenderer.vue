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
    label: props.languageId === 'vue' ? 'Components & Types' : 'Types',
    symbols: props.symbols.filter(symbol => [5, 10, 11, 22, 23, 26].includes(symbol.kind)),
  },
  {
    label: 'Functions',
    symbols: props.symbols.filter(symbol => [6, 9, 12].includes(symbol.kind)),
  },
  {
    label: 'State & Values',
    symbols: props.symbols.filter(symbol => [7, 8, 13, 14].includes(symbol.kind)),
  },
  {
    label: 'Modules',
    symbols: props.symbols.filter(symbol => ![5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 22, 23, 26].includes(symbol.kind)),
  },
].filter(group => group.symbols.length > 0))

function forwardAnnotation(reference: ContextReference, point: { x: number, y: number }): void {
  emit('annotate', reference, point)
}
</script>

<template>
  <div class="grid w-[42rem] grid-cols-2 items-start gap-4">
    <section v-for="group in groups" :key="group.label" class="min-w-0">
      <header class="mb-1.5 flex h-7 items-center px-1 [font-size:var(--font-size-ui-xs)] text-[var(--text-secondary)]">
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
