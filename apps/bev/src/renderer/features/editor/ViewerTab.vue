<script setup lang="ts">
import type { DockviewPanelApi } from 'dockview-vue'

import { computed, onScopeDispose, shallowRef } from 'vue'

import { useBevDockContext } from '../dock/context'

interface ViewerContext {
  path: string
}

interface ViewerParams {
  params: ViewerContext
  api: DockviewPanelApi
}

const props = defineProps<{
  params: ViewerParams
}>()

const { workspace } = useBevDockContext()
const path = props.params.params.path
const fileName = path.split('/').at(-1)
const active = shallowRef(props.params.api.isActive)
const pinned = computed(() => workspace.previewPath.value !== path)
const activeDisposable = props.params.api.onDidActiveChange((event) => {
  active.value = event.isActive
})

function close(event: MouseEvent): void {
  event.stopPropagation()
  props.params.api.close()
}

function pin(): void {
  workspace.pinFile(path)
}

onScopeDispose(() => activeDisposable.dispose())
</script>

<template>
  <div
    :class="[
      'group flex h-full min-w-0 items-center gap-1.5 pl-2.5 pr-1',
      '[font-size:var(--font-size-ui)] transition-colors',
      active ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]',
      !pinned && 'italic',
    ]"
    :title="pinned ? path : `${path} — double-click to keep open`"
    @dblclick.stop="pin"
  >
    <div
      aria-hidden="true"
      :class="[
        'size-3.5 shrink-0',
        active ? 'i-mingcute:file-code-fill' : 'i-mingcute:file-code-line',
        active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]',
      ]"
    />
    <span class="max-w-48 truncate">{{ fileName === undefined ? path : fileName }}</span>
    <button
      :class="[
        'inline-flex size-4.5 shrink-0 items-center justify-center border-0 rounded bg-transparent p-0',
        'text-[var(--text-muted)] transition-opacity',
        active ? 'opacity-75' : 'opacity-0',
        'group-hover:opacity-100 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
        'focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
      ]"
      type="button"
      :aria-label="`Close ${fileName === undefined ? path : fileName}`"
      title="Close"
      @pointerdown.stop
      @click="close"
    >
      <div aria-hidden="true" class="i-mingcute:close-line size-3.25" />
    </button>
  </div>
</template>
