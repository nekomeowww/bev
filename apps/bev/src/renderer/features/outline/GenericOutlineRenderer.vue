<script setup lang="ts">
import type { OutlineSymbol } from '../../../shared/workspace'
import type { ContextReference } from '../workspace/model'

import SymbolCard from './SymbolCard.vue'

defineProps<{
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

function forwardAnnotation(reference: ContextReference, point: { x: number, y: number }): void {
  emit('annotate', reference, point)
}
</script>

<template>
  <div class="flex w-96 flex-col gap-1.5">
    <SymbolCard
      v-for="symbol in symbols"
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
</template>
