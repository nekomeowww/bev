<script setup lang="ts">
import type { ContextReference } from './features/workspace/model'
import type { OpenVsxFileIconThemeItem } from '../shared/file-icons'

import { computed, shallowRef, watch } from 'vue'

import AnnotationPopover from './features/annotations/AnnotationPopover.vue'
import { useAnnotations } from './features/annotations/useAnnotations'
import { provideBevDockContext } from './features/dock/context'
import EditorHost from './features/editor/EditorHost.vue'
import ExtensionDetailView from './features/extensions/ExtensionDetailView.vue'
import ExtensionsSidebar from './features/extensions/ExtensionsSidebar.vue'
import { provideFileIconTheme, useFileIconTheme } from './features/file-icons/useFileIconTheme'
import StableInspector from './features/inspector/StableInspector.vue'
import SettingsPopover from './features/settings/SettingsPopover.vue'
import { useUiPreferences } from './features/settings/useUiPreferences'
import ActivityBar from './features/workbench/ActivityBar.vue'
import type { WorkbenchSidebarView } from './features/workbench/ActivityBar.vue'
import StatusBar from './features/workbench/StatusBar.vue'
import WorkspaceSidebar from './features/workspace/WorkspaceSidebar.vue'
import { useWorkspace } from './features/workspace/useWorkspace'
import Button from './ui/Button.vue'
import IconButton from './ui/IconButton.vue'

const workspace = useWorkspace()
const annotations = useAnnotations()
const fileIcons = useFileIconTheme()
const uiPreferences = useUiPreferences()
const annotationMode = shallowRef(false)
const sidebarVisible = shallowRef(true)
const sidebarView = shallowRef<WorkbenchSidebarView>('explorer')
const extensionsVisited = shallowRef(false)
const selectedExtension = shallowRef<OpenVsxFileIconThemeItem | null>(null)
const platform = window.bev.platform
const minimumSidebarWidth = 180
const maximumSidebarWidth = 480
const defaultSidebarWidth = 240
const sidebarWidthStorageKey = 'bev:sidebar-width:v1'
const sidebarWidth = shallowRef(readSidebarWidth())
const resizingSidebar = shallowRef(false)
let resizeStartX = 0
let resizeStartWidth = defaultSidebarWidth

const workspaceGridStyle = computed(() => ({
  gridTemplateColumns: sidebarVisible.value
    ? `${sidebarWidth.value}px 4px minmax(0, 1fr)`
    : '0 0 minmax(0, 1fr)',
}))

function beginSidebarResize(event: PointerEvent): void {
  const handle = event.currentTarget as HTMLElement
  resizeStartX = event.clientX
  resizeStartWidth = sidebarWidth.value
  resizingSidebar.value = true
  handle.setPointerCapture(event.pointerId)
}

function resizeSidebar(event: PointerEvent): void {
  if (!resizingSidebar.value)
    return
  sidebarWidth.value = clampSidebarWidth(resizeStartWidth + event.clientX - resizeStartX)
}

function endSidebarResize(event: PointerEvent): void {
  if (!resizingSidebar.value)
    return
  resizingSidebar.value = false
  const handle = event.currentTarget as HTMLElement
  if (handle.hasPointerCapture(event.pointerId))
    handle.releasePointerCapture(event.pointerId)
}

function resizeSidebarWithKeyboard(event: KeyboardEvent): void {
  switch (event.key) {
    case 'ArrowLeft':
      sidebarWidth.value = clampSidebarWidth(sidebarWidth.value - 12)
      break
    case 'ArrowRight':
      sidebarWidth.value = clampSidebarWidth(sidebarWidth.value + 12)
      break
    case 'Home':
      sidebarWidth.value = minimumSidebarWidth
      break
    case 'End':
      sidebarWidth.value = maximumSidebarWidth
      break
    default:
      return
  }
  event.preventDefault()
}

function clampSidebarWidth(width: number): number {
  return Math.min(maximumSidebarWidth, Math.max(minimumSidebarWidth, width))
}

function readSidebarWidth(): number {
  const stored = localStorage.getItem(sidebarWidthStorageKey)
  if (stored === null)
    return defaultSidebarWidth
  const width = Number(stored)
  return Number.isFinite(width) ? clampSidebarWidth(width) : defaultSidebarWidth
}

function selectSidebarView(view: WorkbenchSidebarView): void {
  sidebarView.value = view
  sidebarVisible.value = true
  if (view === 'extensions')
    extensionsVisited.value = true
}

function selectExtension(item: OpenVsxFileIconThemeItem): void {
  selectedExtension.value = item
}

function beginAnnotation(
  references: ContextReference[],
  point: { x: number, y: number },
): void {
  annotations.begin(references, point)
}

function addContext(reference: ContextReference): void {
  if (annotations.open.value) {
    annotations.addContext(reference)
    return
  }
  annotations.begin([reference], { x: window.innerWidth / 2, y: 120 })
}

function copySavedAnnotations(): void {
  const markdown = annotations.annotations.value.map((annotation, index) => [
    `## Annotation ${index + 1}`,
    '',
    annotation.note,
    '',
    ...annotation.targets.map(target => `- Target: \`${target.path}\` — ${target.label}`),
    ...annotation.context.map(context => `- Context: \`${context.path}\` — ${context.label}`),
  ].join('\n')).join('\n\n')
  void navigator.clipboard.writeText(markdown)
}

provideBevDockContext({
  workspace,
  annotations,
  annotationMode,
  beginAnnotation,
  addContext,
})
provideFileIconTheme(fileIcons)

watch(
  () => workspace.workspace.value?.rootPath,
  (rootPath, previousRootPath) => {
    if (previousRootPath !== undefined && rootPath !== previousRootPath)
      annotations.reset()
  },
)

watch(sidebarWidth, width => localStorage.setItem(sidebarWidthStorageKey, String(width)))
</script>

<template>
  <main
    :class="[
      'bev-app relative box-border grid h-screen w-screen min-h-0 min-w-0 grid-rows-[38px_minmax(0,1fr)_24px] overflow-hidden p-1 pt-0',
      'bg-[var(--app-wash)]',
      'transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none',
    ]"
    :data-platform="platform"
    :data-sidebar-open="sidebarVisible"
    :style="workspaceGridStyle"
  >
    <div
      v-if="platform === 'darwin'"
      aria-hidden="true"
      class="window-drag-region absolute inset-x-0 top-0 h-[38px]"
    />

    <IconButton
      :class="[
        'window-no-drag absolute z-70',
        platform === 'darwin' ? 'left-19 top-1.5' : 'left-2 top-1.25',
      ]"
      :label="sidebarVisible ? 'Collapse sidebar' : 'Expand sidebar'"
      aria-controls="workspace-sidebar"
      :aria-expanded="sidebarVisible"
      @click="sidebarVisible = !sidebarVisible"
    >
      <div
        aria-hidden="true"
        :class="[
          'size-4',
          sidebarVisible ? 'i-mingcute:layout-leftbar-close-line' : 'i-mingcute:layout-left-line',
        ]"
      />
    </IconButton>

    <aside
      id="workspace-sidebar"
      class="pointer-events-none col-start-1 row-span-2 row-start-1 min-h-0 min-w-0 overflow-hidden"
      :aria-hidden="!sidebarVisible"
    >
      <div
        :class="[
          'flex h-full shrink-0 flex-col',
          'transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none',
          sidebarVisible
            ? 'pointer-events-auto [transform:translateX(0)] opacity-100'
            : 'pointer-events-none [transform:translateX(-100%)] opacity-0',
        ]"
        :style="{ width: `${sidebarWidth}px` }"
        :inert="!sidebarVisible"
      >
        <div class="h-[38px] shrink-0" />
        <ActivityBar
          class="shrink-0"
          :active-view="sidebarView"
          @select-view="selectSidebarView"
        />
        <div class="relative min-h-0 flex-1 overflow-hidden">
          <Transition
            enter-active-class="transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none"
            enter-from-class="opacity-0 -translate-x-1"
            enter-to-class="opacity-100 translate-x-0"
            leave-active-class="transition-[opacity,transform] duration-100 ease-in motion-reduce:transition-none"
            leave-from-class="opacity-100 translate-x-0"
            leave-to-class="opacity-0 -translate-x-1"
          >
            <WorkspaceSidebar
              v-show="sidebarView === 'explorer'"
              class="absolute inset-0"
              :state="workspace.workspaceState.value"
              :outline-state="workspace.outlineState.value"
              @open-workspace="workspace.openWorkspace()"
              @select-file="workspace.openFile"
              @add-context="addContext"
            />
          </Transition>
          <Transition
            enter-active-class="transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none"
            enter-from-class="opacity-0 translate-x-1"
            enter-to-class="opacity-100 translate-x-0"
            leave-active-class="transition-[opacity,transform] duration-100 ease-in motion-reduce:transition-none"
            leave-from-class="opacity-100 translate-x-0"
            leave-to-class="opacity-0 translate-x-1"
          >
            <ExtensionsSidebar
              v-if="extensionsVisited"
              v-show="sidebarView === 'extensions'"
              class="absolute inset-0"
              :selected-item="selectedExtension"
              @select="selectExtension"
            />
          </Transition>
        </div>
      </div>
    </aside>

    <div
      :class="[
        'group window-no-drag relative z-30 col-start-2 row-span-2 row-start-1 flex h-full w-1 items-center justify-center cursor-col-resize touch-none outline-none',
        'focus-visible:bg-[var(--accent-wash)]',
        'transition-opacity duration-200 ease-out motion-reduce:transition-none',
        sidebarVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
      ]"
      role="separator"
      aria-label="Resize Explorer"
      :aria-hidden="!sidebarVisible"
      aria-orientation="vertical"
      :aria-valuemin="minimumSidebarWidth"
      :aria-valuemax="maximumSidebarWidth"
      :aria-valuenow="sidebarWidth"
      :tabindex="sidebarVisible ? 0 : -1"
      @dblclick="sidebarWidth = defaultSidebarWidth"
      @pointerdown.prevent="beginSidebarResize"
      @pointermove="resizeSidebar"
      @pointerup="endSidebarResize"
      @pointercancel="endSidebarResize"
      @keydown="resizeSidebarWithKeyboard"
    >
      <span
        aria-hidden="true"
        :class="[
          'h-full w-px bg-transparent transition-colors',
          'group-hover:bg-[var(--border-strong)] group-focus-visible:bg-[var(--accent)]',
          resizingSidebar && 'bg-[var(--accent)]',
        ]"
      />
    </div>

    <section
      :class="[
        'relative col-start-3 row-span-2 row-start-1 min-h-0 min-w-0 overflow-hidden',
      ]"
      :aria-label="sidebarView === 'extensions' ? 'Extension details' : 'Editor area'"
    >
      <Transition
        enter-active-class="transition-[opacity,transform] duration-180 ease-out motion-reduce:transition-none"
        enter-from-class="opacity-0 translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-opacity duration-100 ease-in motion-reduce:transition-none"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div v-show="sidebarView === 'explorer'" class="absolute inset-0">
          <EditorHost />
          <StableInspector :open="workspace.detailReference.value !== null" />
        </div>
      </Transition>
      <Transition
        enter-active-class="transition-[opacity,transform] duration-180 ease-out motion-reduce:transition-none"
        enter-from-class="opacity-0 translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-opacity duration-100 ease-in motion-reduce:transition-none"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <ExtensionDetailView
          v-if="extensionsVisited"
          v-show="sidebarView === 'extensions'"
          class="absolute inset-0 z-10"
          :item="selectedExtension"
        />
      </Transition>
    </section>

    <div class="window-no-drag absolute right-2 top-1.25 z-70">
      <SettingsPopover
        :font-size="uiPreferences.fontSize.value"
        @set-font-size="uiPreferences.setFontSize"
      />
    </div>

    <StatusBar
      class="row-start-3"
      :workspace-state="workspace.workspaceState.value"
      :outline-state="workspace.outlineState.value"
      :active-path="workspace.activePath.value"
      @open-workspace="workspace.openWorkspace()"
    />

    <Button
      v-if="annotations.annotations.value.length"
      :class="[
        'absolute bottom-7 right-2 z-50 flex h-6 items-center gap-1 px-2',
        'rounded-lg',
        'bg-[var(--surface-popover)] [font-size:var(--font-size-ui-2xs)] text-[var(--text-secondary)] shadow-sm backdrop-blur-xl',
        'font-[var(--font-mono)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
      ]"
      aria-label="Copy all annotations"
      title="Copy all annotations"
      @click="copySavedAnnotations"
    >
      <div aria-hidden="true" class="i-mingcute:copy-2-line size-3" />
      {{ annotations.annotations.value.length }}
    </Button>

    <AnnotationPopover
      :open="annotations.open.value"
      :anchor="annotations.anchor.value"
      :targets="annotations.targets.value"
      :context="annotations.context.value"
      @close="annotations.close"
      @save="annotations.save"
      @add-context="annotations.addContext"
      @remove-context="annotations.removeContext"
    />
  </main>
</template>
