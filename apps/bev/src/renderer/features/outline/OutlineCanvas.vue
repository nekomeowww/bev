<script setup lang="ts">
import type { OutlineSymbol } from '../../../shared/workspace'
import type { ContextReference } from '../workspace/model'
import type { OutlineState } from '../workspace/state'

import { computed, reactive, shallowRef, useTemplateRef } from 'vue'

import ActionButton from '../../ui/ActionButton.vue'
import ToolbarButton from '../../ui/ToolbarButton.vue'
import { symbolReference } from '../workspace/model'
import { outlineStatusMessage } from '../workspace/state'
import { rendererForLanguage } from './renderers'

const props = defineProps<{
  state: OutlineState
  annotationMode: boolean
  selectedContextIds: Set<string>
}>()

const emit = defineEmits<{
  updateAnnotationMode: [enabled: boolean]
  annotate: [references: ContextReference[], point: { x: number, y: number }]
  addContext: [reference: ContextReference]
  inspect: [reference: ContextReference]
  preview: [reference: ContextReference]
  clearPreview: [reference: ContextReference]
  retry: []
}>()

interface DragState {
  mode: 'pan' | 'marquee'
  pointerId: number
  startX: number
  startY: number
  cameraX: number
  cameraY: number
}

const viewportRef = useTemplateRef<HTMLElement>('viewport')
const camera = reactive({ x: 32, y: 32, zoom: 1 })
const drag = shallowRef<DragState | null>(null)
const marquee = reactive({ visible: false, x: 0, y: 0, width: 0, height: 0 })

const outline = computed(() => props.state.status === 'ready' ? props.state.outline : null)
const loading = computed(() => props.state.status === 'loading')
const statusMessage = computed(() => outlineStatusMessage(props.state))
const renderer = computed(() => rendererForLanguage(outline.value === null ? 'plaintext' : outline.value.languageId))
const worldStyle = computed(() => ({
  transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
}))
const referenceById = computed(() => {
  const entries = new Map<string, ContextReference>()
  const snapshot = outline.value
  if (snapshot === null)
    return entries
  visitSymbols(snapshot.symbols, (symbol) => {
    const reference = symbolReference(snapshot.path, snapshot.languageId, symbol)
    entries.set(reference.id, reference)
  })
  return entries
})

function handleWheel(event: WheelEvent): void {
  const viewport = viewportRef.value
  if (!viewport)
    return
  if (event.ctrlKey || event.metaKey) {
    const rect = viewport.getBoundingClientRect()
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const worldX = (pointerX - camera.x) / camera.zoom
    const worldY = (pointerY - camera.y) / camera.zoom
    const nextZoom = clamp(camera.zoom * Math.exp(-event.deltaY * 0.002), 0.35, 2.2)
    camera.x = pointerX - worldX * nextZoom
    camera.y = pointerY - worldY * nextZoom
    camera.zoom = nextZoom
    return
  }
  camera.x -= event.deltaX
  camera.y -= event.deltaY
}

function handlePointerDown(event: PointerEvent): void {
  if (event.button !== 0)
    return
  const target = event.target as HTMLElement
  if (target.closest('[data-context-reference], button, textarea, input'))
    return
  const viewport = viewportRef.value
  if (!viewport)
    return
  viewport.setPointerCapture(event.pointerId)
  const rect = viewport.getBoundingClientRect()
  const startX = event.clientX - rect.left
  const startY = event.clientY - rect.top
  drag.value = {
    mode: props.annotationMode ? 'marquee' : 'pan',
    pointerId: event.pointerId,
    startX,
    startY,
    cameraX: camera.x,
    cameraY: camera.y,
  }
  if (props.annotationMode)
    Object.assign(marquee, { visible: true, x: startX, y: startY, width: 0, height: 0 })
}

function handlePointerMove(event: PointerEvent): void {
  const active = drag.value
  const viewport = viewportRef.value
  if (!active || !viewport || active.pointerId !== event.pointerId)
    return
  const rect = viewport.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  if (active.mode === 'pan') {
    camera.x = active.cameraX + x - active.startX
    camera.y = active.cameraY + y - active.startY
    return
  }
  marquee.x = Math.min(active.startX, x)
  marquee.y = Math.min(active.startY, y)
  marquee.width = Math.abs(x - active.startX)
  marquee.height = Math.abs(y - active.startY)
}

function handlePointerUp(event: PointerEvent): void {
  const active = drag.value
  const viewport = viewportRef.value
  if (!active || !viewport || active.pointerId !== event.pointerId)
    return
  viewport.releasePointerCapture(event.pointerId)
  drag.value = null
  if (active.mode !== 'marquee')
    return
  if (marquee.width >= 4 && marquee.height >= 4) {
    const viewportRect = viewport.getBoundingClientRect()
    const selection = {
      left: viewportRect.left + marquee.x,
      top: viewportRect.top + marquee.y,
      right: viewportRect.left + marquee.x + marquee.width,
      bottom: viewportRect.top + marquee.y + marquee.height,
    }
    const references = [...viewport.querySelectorAll<HTMLElement>('[data-context-id]')]
      .filter(element => intersects(element.getBoundingClientRect(), selection))
      .map(element => element.dataset.contextId)
      .filter((id): id is string => id !== undefined)
      .map(id => referenceById.value.get(id))
      .filter((reference): reference is ContextReference => reference !== undefined)
    if (references.length) {
      emit('annotate', [...new Map(references.map(reference => [reference.id, reference])).values()], {
        x: selection.right,
        y: selection.bottom,
      })
    }
  }
  marquee.visible = false
}

function annotate(reference: ContextReference, point: { x: number, y: number }): void {
  emit('annotate', [reference], point)
}

function resetCamera(): void {
  Object.assign(camera, { x: 32, y: 32, zoom: 1 })
}

function visitSymbols(symbols: OutlineSymbol[], visit: (symbol: OutlineSymbol) => void): void {
  for (const symbol of symbols) {
    visit(symbol)
    visitSymbols(symbol.children, visit)
  }
}

function intersects(rect: DOMRect, selection: { left: number, top: number, right: number, bottom: number }): boolean {
  return rect.right >= selection.left
    && rect.left <= selection.right
    && rect.bottom >= selection.top
    && rect.top <= selection.bottom
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
</script>

<template>
  <section class="relative size-full min-h-0 min-w-0 overflow-hidden">
    <div
      ref="viewport"
      :class="[
        'relative size-full min-h-0 min-w-0 overflow-hidden touch-none',
        drag?.mode === 'pan' ? 'cursor-grabbing' : annotationMode ? 'cursor-crosshair' : 'cursor-grab',
      ]"
      @wheel.prevent="handleWheel"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
    >
      <div class="dot-grid absolute inset-0 pointer-events-none" />

      <div v-if="outline?.symbols.length" class="absolute left-0 top-0 w-max origin-top-left will-change-transform" :style="worldStyle">
        <component
          :is="renderer"
          :key="outline.path"
          :symbols="outline.symbols"
          :path="outline.path"
          :language-id="outline.languageId"
          :annotation-mode="annotationMode"
          :selected-ids="selectedContextIds"
          @annotate="annotate"
          @add-context="emit('addContext', $event)"
          @inspect="emit('inspect', $event)"
          @preview="emit('preview', $event)"
          @clear-preview="emit('clearPreview', $event)"
        />
      </div>

      <div v-else class="absolute inset-0 flex flex-col items-center justify-center gap-2 [font-size:var(--font-size-ui-sm)] text-[var(--text-muted)]">
        <div
          aria-hidden="true"
          :class="[
            loading ? 'i-mingcute:loading-3-line animate-spin' : 'i-mingcute:braces-line',
            'size-5',
          ]"
        />
        <span>{{ statusMessage }}</span>
        <ActionButton
          v-if="state.status === 'ready'"
          class="mt-1"
          tone="neutral"
          @click="emit('retry')"
        >
          <div aria-hidden="true" class="i-mingcute:refresh-2-line size-3" />
          Retry outline
        </ActionButton>
      </div>

      <div
        v-if="marquee.visible"
        class="absolute z-30 border border-[var(--accent)] rounded-md bg-[var(--accent-wash)] pointer-events-none"
        :style="{
          left: `${marquee.x}px`,
          top: `${marquee.y}px`,
          width: `${marquee.width}px`,
          height: `${marquee.height}px`,
        }"
      />

      <div
        :class="[
          'absolute bottom-3 left-1/2 z-20 flex items-center gap-0.5 p-0.5 [transform:translateX(-50%)]',
          'border border-[var(--border-strong)] rounded-xl',
          'bg-[var(--surface-popover)] shadow-[var(--shadow-popover)] backdrop-blur-xl',
        ]"
        role="toolbar"
        aria-label="Canvas tools"
      >
        <ToolbarButton
          label="Annotate symbols"
          :active="annotationMode"
          :aria-pressed="annotationMode"
          @click="emit('updateAnnotationMode', !annotationMode)"
        >
          <div
            aria-hidden="true"
            :class="[
              'size-3.5',
              annotationMode ? 'i-mingcute:search-ai-fill' : 'i-mingcute:search-ai-line',
            ]"
          />
        </ToolbarButton>
        <ToolbarButton
          label="Reset canvas position"
          @click="resetCamera"
        >
          <div aria-hidden="true" class="i-mingcute:aiming-line size-3.5" />
        </ToolbarButton>
      </div>

      <div
        :class="[
          'absolute bottom-2 right-2 px-1.5 py-1 border border-[var(--border-subtle)] rounded-md',
          'bg-[var(--surface-item)] [font-size:var(--font-size-ui-2xs)] text-[var(--text-muted)] font-[var(--font-mono)] tabular-nums',
          'pointer-events-none',
        ]"
      >
        {{ Math.round(camera.zoom * 100) }}%
      </div>
    </div>
  </section>
</template>

<style scoped>
/* The canvas grid is a visual effect; layout and component presentation stay in UnoCSS. */
.dot-grid {
  background-image: radial-gradient(circle, var(--grid-dot) 0.7px, transparent 0.8px);
  background-position: -1px -1px;
  background-size: 18px 18px;
}
</style>
