<script setup lang="ts">
import type { ContextReference } from '../workspace/model'

import {
  PopoverAnchor,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
} from 'reka-ui'
import { computed, shallowRef, watch } from 'vue'

import ActionButton from '../../ui/ActionButton.vue'
import Button from '../../ui/Button.vue'
import IconButton from '../../ui/IconButton.vue'
import { readContextDrag } from '../workspace/model'

const props = defineProps<{
  open: boolean
  anchor: { x: number, y: number }
  targets: ContextReference[]
  context: ContextReference[]
}>()

const emit = defineEmits<{
  close: []
  save: [note: string]
  addContext: [reference: ContextReference]
  removeContext: [id: string]
}>()

const note = shallowRef('')
const dropActive = shallowRef(false)

const anchorStyle = computed(() => ({
  left: `${Math.max(8, props.anchor.x)}px`,
  top: `${Math.max(8, props.anchor.y)}px`,
}))
const canSave = computed(() => note.value.trim().length > 0 && props.targets.length > 0)

watch(
  [() => props.open, () => props.targets],
  ([open], [previousOpen]) => {
    if (open && (!previousOpen || props.targets.length > 0))
      note.value = ''
  },
)

function handleDrop(event: DragEvent): void {
  dropActive.value = false
  const reference = readContextDrag(event)
  if (reference)
    emit('addContext', reference)
}

function copyContext(): void {
  void navigator.clipboard.writeText(formatContext(note.value, props.targets, props.context))
}

function formatContext(
  feedback: string,
  targets: ContextReference[],
  additionalContext: ContextReference[],
): string {
  const lines = [
    '## Bev architecture annotation',
    '',
    feedback.trim() || '_No instruction yet._',
    '',
    '### Targets',
    ...targets.map(formatReference),
  ]
  if (additionalContext.length) {
    lines.push('', '### Related context', ...additionalContext.map(formatReference))
  }
  return lines.join('\n')
}

function formatReference(reference: ContextReference): string {
  if (!reference.range)
    return `- \`${reference.path}\``
  const start = reference.range.start
  const end = reference.range.end
  const symbolKind = reference.symbolKind === undefined ? 'symbol' : reference.symbolKind
  return `- **${reference.label}** (${symbolKind}) — \`${reference.path}:${start.line + 1}:${start.character + 1}-${end.line + 1}:${end.character + 1}\``
}
</script>

<template>
  <PopoverRoot :open="open" :modal="false" @update:open="!$event && emit('close')">
    <PopoverAnchor class="pointer-events-none fixed z-90 size-px" :style="anchorStyle" />
    <PopoverPortal>
      <PopoverContent
        :class="[
          'z-100 w-[min(330px,calc(100vw-24px))] p-2',
          'border border-[var(--border-strong)] rounded-2xl',
          'bg-[var(--surface-popover)] text-[var(--text-primary)] shadow-[var(--shadow-popover)] backdrop-blur-3xl',
        ]"
        :side-offset="10"
        :collision-padding="12"
        @open-auto-focus.prevent
        @interact-outside.prevent
      >
        <header class="flex h-7.5 items-center justify-between px-1 pb-1.25 [font-size:var(--font-size-ui-sm)] text-[var(--text-secondary)] font-620">
          <span>{{ targets.length }} selected</span>
          <IconButton
            label="Copy annotation context"
            @click="copyContext"
          >
            <div aria-hidden="true" class="i-mingcute:copy-2-line size-3.5" />
          </IconButton>
        </header>

        <div class="mb-2 flex max-h-15 flex-wrap gap-1.25 overflow-auto">
          <span
            v-for="target in targets"
            :key="target.id"
            :class="[
              'inline-flex h-6.25 max-w-36 min-w-0 items-center gap-1.25 overflow-hidden px-1.75',
              'border border-[var(--border-subtle)] rounded-lg bg-[var(--surface-item)]',
              'truncate whitespace-nowrap [font-size:var(--font-size-ui-xs)] text-[var(--text-primary)]',
            ]"
          >
            <div
              aria-hidden="true"
              class="size-3 shrink-0"
              :class="target.kind === 'file' ? 'i-mingcute:file-code-line' : 'i-mingcute:box-3-line'"
            />
            {{ target.label }}
          </span>
        </div>

        <textarea
          v-model="note"
          :class="[
            'box-border min-h-21.5 w-full resize-y px-2.5 py-2.25',
            'border border-[var(--border-subtle)] rounded-xl bg-[var(--surface-input)] outline-none',
            '[font-size:var(--font-size-ui)] leading-4.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
            'focus:border-[var(--accent)] focus:shadow-[0_0_0_2px_var(--accent-soft)]',
          ]"
          rows="4"
          placeholder="Describe the architectural change…"
        />

        <div
          :class="[
            'mt-2 min-h-10 p-1.5 border border-dashed rounded-xl',
            '[font-size:var(--font-size-ui-xs)] text-[var(--text-muted)] transition-colors',
            dropActive
              ? 'border-[var(--accent)] bg-[var(--accent-wash)]'
              : 'border-[var(--border-strong)]',
          ]"
          @dragenter.prevent="dropActive = true"
          @dragover.prevent
          @dragleave.self="dropActive = false"
          @drop.prevent="handleDrop"
        >
          <div v-if="context.length" class="flex flex-wrap gap-1.25">
            <Button
              v-for="reference in context"
              :key="reference.id"
              :class="[
                'inline-flex h-6.25 min-w-0 items-center gap-1.25 rounded-lg px-1.75',
                'bg-[var(--surface-item)]',
                '[font-size:var(--font-size-ui-xs)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]',
                'focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
              ]"
              :aria-label="`Remove ${reference.label} from context`"
              :title="`Remove ${reference.label}`"
              @click="emit('removeContext', reference.id)"
            >
              <div
                aria-hidden="true"
                class="size-3 shrink-0"
                :class="reference.kind === 'file' ? 'i-mingcute:file-code-line' : 'i-mingcute:box-3-line'"
              />
              {{ reference.label }}
              <div aria-hidden="true" class="i-mingcute:close-line size-3 shrink-0 text-[var(--text-muted)]" />
            </Button>
          </div>
          <span v-else class="flex min-h-6.5 items-center justify-center">Drop files or symbols here</span>
        </div>

        <footer class="flex items-center justify-end gap-1.5 pt-2">
          <ActionButton
            tone="neutral"
            @click="emit('close')"
          >
            Cancel
          </ActionButton>
          <ActionButton
            tone="primary"
            :disabled="!canSave"
            @click="emit('save', note)"
          >
            Add
          </ActionButton>
        </footer>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
