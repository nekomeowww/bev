<script setup lang="ts">
import type { OutlineState, WorkspaceState } from '../workspace/state'

import { computed } from 'vue'

import { currentWorkspace } from '../workspace/state'

const props = defineProps<{
  workspaceState: WorkspaceState
  outlineState: OutlineState
  activePath: string | null
}>()

const emit = defineEmits<{
  openWorkspace: []
}>()

const workspace = computed(() => currentWorkspace(props.workspaceState))
const workspaceLabel = computed(() => {
  const snapshot = workspace.value
  return snapshot === null ? 'Open workspace' : snapshot.rootName
})
const languageStatus = computed(() => {
  const state = props.outlineState
  switch (state.status) {
    case 'unselected':
      return { label: 'Language server idle', tone: 'bg-[var(--text-muted)]' }
    case 'loading':
      return { label: 'Starting language analysis…', tone: 'bg-[#d49a46]' }
    case 'error':
      return { label: state.message, tone: 'bg-[#d45f67]' }
    case 'ready': {
      const symbolCount = state.outline.symbols.length
      if (state.outline.analysisStatus === 'loading') {
        const suffix = symbolCount === 0 ? '' : ` · ${symbolCount} cached symbols`
        return { label: `${state.outline.provider}: analyzing workspace${suffix}`, tone: 'bg-[#d49a46]' }
      }
      return symbolCount === 0
        ? { label: `${state.outline.provider}: no symbols returned`, tone: 'bg-[#d49a46]' }
        : { label: `${state.outline.provider}: ${symbolCount} symbols`, tone: 'bg-[#4baf78]' }
    }
  }
})
const diagnosticCount = computed(() => {
  const state = props.outlineState
  return state.status === 'ready' && state.outline.diagnostics.status === 'ready'
    ? state.outline.diagnostics.items.length
    : 0
})
</script>

<template>
  <footer
    :class="[
      'window-no-drag col-span-full flex h-6 min-w-0 items-center justify-between gap-3 px-1.5',
      '[font-size:var(--font-size-ui-xs)] text-[var(--text-muted)] font-[var(--font-mono)]',
    ]"
    aria-label="Workspace status"
  >
    <div class="flex min-w-0 items-center gap-1">
      <button
        :class="[
          'flex h-5 min-w-0 items-center gap-1.5 px-1.5 border-0 rounded-md bg-transparent',
          'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
          'focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
        ]"
        type="button"
        aria-label="Switch workspace"
        title="Switch workspace"
        @click="emit('openWorkspace')"
      >
        <div aria-hidden="true" class="i-mingcute:git-branch-line size-3" />
        <span class="max-w-44 truncate">{{ workspaceLabel }}</span>
        <div aria-hidden="true" class="i-mingcute:unfold-vertical-line size-2.5" />
      </button>
      <span v-if="activePath" class="max-w-72 truncate px-1 text-[var(--text-muted)]">
        {{ activePath }}
      </span>
    </div>

    <div class="flex shrink-0 items-center gap-3 px-1">
      <span v-if="diagnosticCount" class="flex items-center gap-1 text-[#c88a3f]">
        <div aria-hidden="true" class="i-mingcute:warning-fill size-3" />
        {{ diagnosticCount }}
      </span>
      <span class="flex max-w-72 items-center gap-1.5 truncate" :title="languageStatus.label">
        <span aria-hidden="true" :class="[languageStatus.tone, 'size-1.5 shrink-0 rounded-full']" />
        {{ languageStatus.label }}
      </span>
    </div>
  </footer>
</template>
