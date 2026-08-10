<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { SourceReference } from '../../../shared/workspace'
import type { ThemedToken } from 'shiki'

import { computed, onScopeDispose, shallowRef, watch } from 'vue'

import { useBevDockContext } from '../dock/context'

interface SourceLine {
  number: number
  highlighted: boolean
  tokens: ThemedToken[]
}

const { workspace } = useBevDockContext()
const tokens = shallowRef<ThemedToken[][]>([])
const colorScheme = shallowRef<'light' | 'dark'>(
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
)
const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
const onColorSchemeChange = (event: MediaQueryListEvent) => {
  colorScheme.value = event.matches ? 'dark' : 'light'
}
colorSchemeQuery.addEventListener('change', onColorSchemeChange)

const reference = computed(() => workspace.detailReference.value)
const referenceLabel = computed(() => {
  const value = reference.value
  return value === null ? 'Source Details' : value.label
})
const preview = computed(() => workspace.sourcePreviewState.value)
const insight = computed(() => workspace.insightState.value.status === 'ready'
  ? workspace.insightState.value.insight
  : null)
const pinned = computed(() => workspace.pinnedReference.value !== null)
const excerpt = computed(() => {
  const state = preview.value
  if (state.status !== 'ready')
    return null
  const range = state.reference.selectionRange === undefined
    ? state.reference.range
    : state.reference.selectionRange
  const allLines = state.document.content.split('\n')
  const selectionStart = range === undefined ? 0 : range.start.line
  const selectionEnd = range === undefined ? Math.min(24, allLines.length - 1) : range.end.line
  const firstLine = Math.max(0, selectionStart - 4)
  const lastLine = Math.min(allLines.length - 1, selectionEnd + 5)
  return {
    code: allLines.slice(firstLine, lastLine + 1).join('\n'),
    firstLine,
    selectionStart,
    selectionEnd,
    languageId: state.document.languageId,
  }
})
const sourceLines = computed<SourceLine[]>(() => {
  const snapshot = excerpt.value
  if (!snapshot)
    return []
  return tokens.value.map((lineTokens, index) => {
    const number = snapshot.firstLine + index + 1
    return {
      number,
      highlighted: number - 1 >= snapshot.selectionStart && number - 1 <= snapshot.selectionEnd,
      tokens: lineTokens,
    }
  })
})
const relationGroups = computed(() => {
  const value = insight.value
  if (!value)
    return []
  return [
    { label: 'Definitions', items: value.definitions },
    { label: 'Implementations', items: value.implementations },
    { label: 'References', items: value.references },
    { label: 'Incoming Calls', items: value.incomingCalls },
    { label: 'Outgoing Calls', items: value.outgoingCalls },
    { label: 'Supertypes', items: value.supertypes },
    { label: 'Subtypes', items: value.subtypes },
  ].filter(group => group.items.length > 0)
})

watch(
  [excerpt, colorScheme],
  async ([snapshot, scheme], _, onCleanup) => {
    if (!snapshot) {
      tokens.value = []
      return
    }
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    const { highlightSource } = await import('./sourceHighlighter')
    const result = await highlightSource(snapshot.code, snapshot.languageId, scheme)
    if (!cancelled)
      tokens.value = result
  },
  { immediate: true },
)

function tokenStyle(token: ThemedToken): CSSProperties {
  const style: CSSProperties = {}
  if (token.color)
    style.color = token.color
  if (token.bgColor)
    style.backgroundColor = token.bgColor
  if (token.fontStyle !== undefined) {
    if (token.fontStyle & 1)
      style.fontStyle = 'italic'
    if (token.fontStyle & 2)
      style.fontWeight = '700'
    if (token.fontStyle & 4)
      style.textDecoration = 'underline'
  }
  return style
}

function formatReference(item: SourceReference): string {
  const line = item.range.start.line + 1
  return item.label === undefined ? `${item.path}:${line}` : `${item.label} · ${item.path}:${line}`
}

onScopeDispose(() => colorSchemeQuery.removeEventListener('change', onColorSchemeChange))
</script>

<template>
  <aside
    :class="[
      'flex h-full min-h-0 w-90 flex-col overflow-hidden',
      'border border-[var(--border-subtle)] rounded-xl bg-[var(--surface-panel)] shadow-[var(--shadow-panel)] backdrop-blur-xl',
    ]"
    aria-label="Symbol details"
    @pointerenter="workspace.holdPreview"
    @pointerleave="workspace.releasePreview"
  >
    <header class="flex h-[38px] min-w-0 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-2.5">
      <div aria-hidden="true" class="i-mingcute:layout-right-fill size-3.5 shrink-0 text-[var(--text-muted)]" />
      <strong class="min-w-0 flex-1 truncate [font-size:var(--font-size-ui)] font-620">
        {{ referenceLabel }}
      </strong>
      <span
        v-if="pinned"
        class="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 [font-size:var(--font-size-ui-2xs)] text-[var(--accent)] uppercase tracking-wide"
      >
        Pinned
      </span>
      <button
        :class="[
          'inline-flex size-6 items-center justify-center border-0 rounded-md bg-transparent p-0',
          'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
          'focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
        ]"
        type="button"
        aria-label="Close source details"
        title="Close source details"
        @click="workspace.closeDetails"
      >
        <div aria-hidden="true" class="i-mingcute:close-line size-3.5" />
      </button>
    </header>

    <div class="min-h-0 flex-1 overflow-auto p-2.5">
      <div v-if="preview.status === 'loading'" class="flex h-32 flex-col items-center justify-center gap-2 [font-size:var(--font-size-ui-xs)] text-[var(--text-muted)]">
        <div aria-hidden="true" class="i-mingcute:loading-3-line size-4 animate-spin" />
        Loading source…
      </div>
      <div v-else-if="preview.status === 'error'" class="rounded-lg bg-[#d45f6714] p-2.5 [font-size:var(--font-size-ui-xs)] text-[#d45f67]">
        {{ preview.message }}
      </div>
      <template v-else-if="preview.status === 'ready'">
        <div class="mb-2 flex min-w-0 items-center gap-1.5 px-1 [font-size:var(--font-size-ui-2xs)] text-[var(--text-muted)] font-[var(--font-mono)]">
          <div aria-hidden="true" class="i-mingcute:file-code-line size-3" />
          <span class="truncate">{{ preview.document.path }}</span>
        </div>
        <pre
          :class="[
            'm-0 overflow-x-auto border border-[var(--border-subtle)] rounded-xl py-2',
            'bg-[var(--surface-input)] [font-size:var(--font-size-ui-xs)] leading-5 font-[var(--font-mono)] select-text',
          ]"
        ><code><span
          v-for="line in sourceLines"
          :key="line.number"
          :class="[
            'grid min-w-max grid-cols-[36px_minmax(0,1fr)] px-2',
            line.highlighted && 'bg-[var(--accent-soft)]',
          ]"
        ><span class="pr-2 text-right tabular-nums text-[var(--text-muted)]">{{ line.number }}</span><span><span
          v-for="(token, index) in line.tokens"
          :key="`${line.number}:${index}`"
          :style="tokenStyle(token)"
        >{{ token.content }}</span></span></span></code></pre>
      </template>

      <section v-if="insight?.hover" class="mt-3">
        <h2 class="m-0 mb-1.5 px-1 [font-size:var(--font-size-ui-2xs)] text-[var(--text-muted)] font-620 uppercase tracking-wide">
          Documentation
        </h2>
        <pre class="m-0 whitespace-pre-wrap rounded-lg bg-[var(--surface-input)] p-2.5 [font-size:var(--font-size-ui-xs)] leading-4.5 text-[var(--text-secondary)] font-[var(--font-mono)] select-text">{{ insight.hover }}</pre>
      </section>

      <section v-for="group in relationGroups" :key="group.label" class="mt-3">
        <header class="mb-1 flex items-center px-1 [font-size:var(--font-size-ui-2xs)] text-[var(--text-muted)] font-620 uppercase tracking-wide">
          {{ group.label }}
          <span class="ml-auto tabular-nums">{{ group.items.length }}</span>
        </header>
        <div class="flex flex-col gap-0.5">
          <button
            v-for="item in group.items"
            :key="`${item.path}:${item.range.start.line}:${item.range.start.character}`"
            :class="[
              'flex min-h-7 min-w-0 items-center gap-1.5 px-2 border-0 rounded-md bg-transparent',
              'text-left [font-size:var(--font-size-ui-2xs)] text-[var(--text-secondary)]',
              'hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
              'focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
              item.external && 'opacity-45',
            ]"
            type="button"
            :disabled="item.external"
            :title="item.external ? 'External reference' : `Open ${formatReference(item)}`"
            @click="workspace.openSourceReference(item)"
          >
            <div aria-hidden="true" class="i-mingcute:corner-down-right-line size-3 shrink-0" />
            <span class="truncate">{{ formatReference(item) }}</span>
          </button>
        </div>
      </section>

      <div
        v-if="pinned && workspace.insightState.value.status === 'loading'"
        class="mt-3 flex items-center gap-2 px-1 [font-size:var(--font-size-ui-2xs)] text-[var(--text-muted)]"
      >
        <div aria-hidden="true" class="i-mingcute:loading-3-line size-3 animate-spin" />
        Resolving LSP relationships…
      </div>
    </div>
  </aside>
</template>
