<script setup lang="ts">
import type { OutlineSymbol } from '../../../shared/workspace'
import type { ContextReference } from '../workspace/model'

import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from 'reka-ui'
import { ChevronDown, ChevronRight } from 'lucide'
import { MorphIcon } from 'morphicons/vue'
import { computed, shallowRef } from 'vue'

import IconButton from '../../ui/IconButton.vue'

import { symbolReference, writeContextDrag } from '../workspace/model'

const props = defineProps<{
  symbol: OutlineSymbol
  path: string
  languageId: string
  depth?: number
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

const collapsed = shallowRef(props.symbol.children.length > 0)
const nestingDepth = computed(() => props.depth === undefined ? 0 : props.depth)
const reference = computed(() => symbolReference(props.path, props.languageId, props.symbol))
const lineLabel = computed(() => {
  const start = props.symbol.range.start.line + 1
  const end = props.symbol.range.end.line + 1
  return start === end ? `${start}` : `${start}–${end}`
})

function activate(event: MouseEvent | KeyboardEvent): void {
  if (props.annotationMode) {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const point = event instanceof MouseEvent
      ? { x: event.clientX, y: event.clientY }
      : { x: bounds.right, y: bounds.top }
    emit('annotate', reference.value, point)
    return
  }
  emit('inspect', reference.value)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ')
    return
  event.preventDefault()
  activate(event)
}

function copyReference(): void {
  const range = props.symbol.range
  void navigator.clipboard.writeText(
    `${props.path}:${range.start.line + 1}:${range.start.character + 1}`,
  )
}

function forwardAnnotation(nextReference: ContextReference, point: { x: number, y: number }): void {
  emit('annotate', nextReference, point)
}
</script>

<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child>
      <article
        :class="[
          'group min-w-0 overflow-hidden border rounded-xl',
          'transition-[border-color,background-color,box-shadow]',
          'focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
          nestingDepth === 0
            ? 'border-[var(--border-subtle)] bg-[var(--surface-item)] shadow-sm'
            : 'border-transparent bg-transparent rounded-lg',
          'hover:border-[var(--border-strong)] hover:bg-[var(--surface-item-hover)]',
          selectedIds.has(reference.id) && 'border-[var(--accent)] shadow-[0_0_0_2px_var(--accent-soft)]',
        ]"
        :data-context-id="reference.id"
        data-context-reference
        role="button"
        tabindex="0"
        :aria-label="`${symbol.kindLabel} ${symbol.name}, lines ${lineLabel}`"
        :aria-expanded="symbol.children.length > 0 ? !collapsed : undefined"
        :draggable="true"
        @click="activate"
        @keydown="handleKeydown"
        @mouseenter="emit('preview', reference)"
        @mouseleave="emit('clearPreview', reference)"
        @focus="emit('preview', reference)"
        @blur="emit('clearPreview', reference)"
        @dragstart="writeContextDrag($event, reference)"
      >
        <div
          :class="[
            'flex min-h-10 min-w-0 items-center gap-2 px-2 py-1',
          ]"
        >
          <IconButton
            v-if="symbol.children.length"
            class="text-[var(--text-muted)]"
            size="xs"
            :label="collapsed ? `Expand ${symbol.name}` : `Collapse ${symbol.name}`"
            @click.stop="collapsed = !collapsed"
          >
            <MorphIcon
              class="size-3"
              :icon="collapsed ? ChevronRight : ChevronDown"
              reduced-motion="user"
            />
          </IconButton>
          <span v-else aria-hidden="true" class="size-5 shrink-0" />

          <span
            aria-hidden="true"
            :class="[
              'size-1.5 shrink-0 rounded-sm bg-[var(--accent)]',
              ['Function', 'Method'].includes(symbol.kindLabel) && 'rounded-full bg-[#8a6fd1]',
              ['Struct', 'Class', 'Interface'].includes(symbol.kindLabel) && 'bg-[#d48b47]',
            ]"
          />

          <span class="min-w-0 flex-1">
            <span class="flex min-w-0 items-baseline gap-1.5">
              <strong class="truncate [font-size:var(--font-size-ui-sm)] font-580 font-[var(--font-mono)]">{{ symbol.name }}</strong>
              <small class="shrink-0 [font-size:var(--font-size-ui-2xs)] text-[var(--text-muted)]">{{ symbol.kindLabel }}</small>
            </span>
            <span
              v-if="symbol.detail"
              class="block truncate [font-size:var(--font-size-ui-2xs)] text-[var(--text-muted)] font-[var(--font-mono)]"
            >
              {{ symbol.detail }}
            </span>
          </span>

          <span
            class="shrink-0 tabular-nums [font-size:var(--font-size-ui-2xs)] text-[var(--text-muted)] font-[var(--font-mono)]"
            :title="`Lines ${lineLabel}`"
          >
            {{ lineLabel }}
          </span>
        </div>

        <div
          v-if="symbol.children.length && !collapsed"
          :class="[
            'mb-1.5 ml-5 mr-1.5 flex flex-col gap-0.5 border-l border-[var(--border-subtle)] pl-2',
          ]"
        >
          <SymbolCard
            v-for="child in symbol.children"
            :key="child.id"
            :symbol="child"
            :path="path"
            :language-id="languageId"
            :depth="nestingDepth + 1"
            :annotation-mode="annotationMode"
            :selected-ids="selectedIds"
            @annotate="forwardAnnotation"
            @add-context="emit('addContext', $event)"
            @inspect="emit('inspect', $event)"
            @preview="emit('preview', $event)"
            @clear-preview="emit('clearPreview', $event)"
          />
        </div>
      </article>
    </ContextMenuTrigger>

    <ContextMenuPortal>
      <ContextMenuContent class="bev-context-menu" :side-offset="6">
        <ContextMenuItem class="bev-menu-item" @select="emit('annotate', reference, { x: 0, y: 0 })">
          <div aria-hidden="true" class="i-mingcute:chat-1-line size-3.5" />
          Annotate
        </ContextMenuItem>
        <ContextMenuItem class="bev-menu-item" @select="emit('inspect', reference)">
          <div aria-hidden="true" class="i-mingcute:inspect-line size-3.5" />
          Inspect Symbol
        </ContextMenuItem>
        <ContextMenuItem class="bev-menu-item" @select="emit('addContext', reference)">
          <div aria-hidden="true" class="i-mingcute:add-line size-3.5" />
          Add as Context
        </ContextMenuItem>
        <ContextMenuSeparator class="bev-menu-separator" />
        <ContextMenuItem class="bev-menu-item" @select="copyReference">
          <div aria-hidden="true" class="i-mingcute:copy-2-line size-3.5" />
          Copy Reference
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>
