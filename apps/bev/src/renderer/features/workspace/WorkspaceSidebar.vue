<script setup lang="ts">
import type { WorkspaceEntry } from '../../../shared/workspace'
import type { ContextReference, VisibleWorkspaceEntry } from './model'
import type { OutlineState, WorkspaceState } from './state'

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
import { VList } from 'virtua/vue'

import ActionButton from '../../ui/ActionButton.vue'
import Button from '../../ui/Button.vue'
import FileIcon from '../file-icons/FileIcon.vue'
import { useFileIconThemeContext } from '../file-icons/useFileIconTheme'
import { fileReference, writeContextDrag } from './model'
import { currentWorkspace, selectedOutlinePath } from './state'

const props = defineProps<{
  state: WorkspaceState
  outlineState: OutlineState
}>()

const emit = defineEmits<{
  openWorkspace: []
  selectFile: [path: string]
  addContext: [reference: ContextReference]
}>()

const expandedPaths = shallowRef(new Set<string>())
const fileIcons = useFileIconThemeContext()

const snapshot = computed(() => currentWorkspace(props.state))
const entries = computed(() => {
  const workspace = snapshot.value
  return workspace === null ? [] : workspace.entries
})
const selectedPath = computed(() => selectedOutlinePath(props.outlineState))
const loading = computed(() => props.state.status === 'loading')
const error = computed(() => props.state.status === 'error' ? props.state.message : null)
const visibleEntries = computed(() => flattenEntries(entries.value, expandedPaths.value))

function toggle(entry: VisibleWorkspaceEntry): void {
  if (entry.kind === 'file') {
    emit('selectFile', entry.path)
    return
  }

  const next = new Set(expandedPaths.value)
  if (next.has(entry.path))
    next.delete(entry.path)
  else
    next.add(entry.path)
  expandedPaths.value = next
}

function referenceFor(entry: VisibleWorkspaceEntry): ContextReference {
  return fileReference(entry.path, entry.languageId)
}

function copyPath(path: string): void {
  void navigator.clipboard.writeText(path)
}

function flattenEntries(
  entries: WorkspaceEntry[],
  expanded: Set<string>,
  depth = 0,
): VisibleWorkspaceEntry[] {
  const result: VisibleWorkspaceEntry[] = []
  for (const entry of entries) {
    const isExpanded = entry.kind === 'directory' && expanded.has(entry.path)
    result.push({
      name: entry.name,
      path: entry.path,
      kind: entry.kind,
      ...(entry.languageId ? { languageId: entry.languageId } : {}),
      depth,
      expanded: isExpanded,
      hasChildren: Boolean(entry.children?.length),
    })
    if (isExpanded && entry.children)
      result.push(...flattenEntries(entry.children, expanded, depth + 1))
  }
  return result
}
</script>

<template>
  <aside class="h-full min-h-0 min-w-0 overflow-hidden">
    <VList
      v-if="visibleEntries.length"
      class="h-full min-h-0 px-1 pb-1.5"
      role="tree"
      :data="visibleEntries"
      :item-size="30"
      :buffer-size="8"
      #default="{ item }"
    >
      <ContextMenuRoot :key="item.path">
        <ContextMenuTrigger as-child>
          <Button
            :class="[
              'grid h-7.5 w-max min-w-full grid-cols-[14px_17px_max-content_8px] items-center gap-1.25 pr-2',
              'rounded-lg text-left text-[var(--text-primary)]',
              'hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
              item.path === selectedPath
                ? 'bg-[var(--surface-selected)]'
                : 'bg-transparent',
            ]"
            :style="{ paddingLeft: `${10 + item.depth * 14}px` }"
            role="treeitem"
            :aria-level="item.depth + 1"
            :aria-expanded="item.kind === 'directory' ? item.expanded : undefined"
            :draggable="item.kind === 'file'"
            @click="toggle(item)"
            @dragstart="writeContextDrag($event, referenceFor(item))"
          >
            <MorphIcon
              :class="[
                'size-[13px] text-[var(--text-muted)]',
                (item.kind === 'file' || fileIcons.hidesExplorerArrows.value) && 'invisible',
              ]"
              :icon="item.expanded ? ChevronDown : ChevronRight"
              reduced-motion="user"
            />
            <FileIcon
              class="size-[15px] text-[var(--text-secondary)]"
              :path="item.path"
              :kind="item.kind"
              :expanded="item.expanded"
              :language-id="item.languageId"
              :selected="item.path === selectedPath"
            />
            <span class="whitespace-nowrap [font-size:var(--font-size-ui)]" :title="item.path">{{ item.name }}</span>
            <span
              v-if="item.languageId"
              class="size-1.25 rounded-full bg-[var(--accent)] opacity-70"
              :title="item.languageId"
            />
          </Button>
        </ContextMenuTrigger>
        <ContextMenuPortal>
          <ContextMenuContent
            :class="[
              'z-80 min-w-42.5 p-1.25 border border-[var(--border-strong)] rounded-xl',
              'bg-[var(--surface-popover)] text-[var(--text-primary)] shadow-[var(--shadow-popover)] backdrop-blur-2xl',
            ]"
            :side-offset="6"
          >
            <ContextMenuItem
              :class="[
                'flex h-7.5 items-center gap-2 px-2 rounded-lg outline-none [font-size:var(--font-size-ui-sm)]',
                'data-[highlighted]:bg-[var(--surface-selected)]',
              ]"
              @select="emit('addContext', referenceFor(item))"
            >
              <div aria-hidden="true" class="i-mingcute:chat-1-line size-3.5" />
              Add as Context
            </ContextMenuItem>
            <ContextMenuSeparator class="m-1 h-px bg-[var(--border-subtle)]" />
            <ContextMenuItem
              class="flex h-7.5 items-center gap-2 rounded-lg px-2 [font-size:var(--font-size-ui-sm)] outline-none data-[highlighted]:bg-[var(--surface-selected)]"
              @select="copyPath(item.path)"
            >
              <div aria-hidden="true" class="i-mingcute:copy-2-line size-3.5" />
              Copy Path
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenuPortal>
      </ContextMenuRoot>
    </VList>

    <div v-else class="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-5">
      <p v-if="error" class="m-0 max-w-64 text-center [font-size:var(--font-size-ui-sm)] text-[#ce6c64]">
        {{ error }}
      </p>
      <ActionButton
        tone="neutral"
        @click="emit('openWorkspace')"
      >
        {{ loading ? 'Opening…' : 'Open Workspace' }}
      </ActionButton>
    </div>
  </aside>
</template>
