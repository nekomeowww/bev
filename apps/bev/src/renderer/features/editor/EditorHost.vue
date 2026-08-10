<script setup lang="ts">
import type { DockviewApi, DockviewReadyEvent, DockviewTheme, IDockviewPanel, SerializedDockview, VueComponent } from 'dockview-vue'

import { DockviewVue, themeLight } from 'dockview-vue'
import { onScopeDispose, watch } from 'vue'

import { useBevDockContext } from '../dock/context'
import EditorEmptyState from './EditorEmptyState.vue'
import OutlineViewerPanel from './OutlineViewerPanel.vue'
import { createPanelRemovalGuard } from './panelRemovalGuard'
import ViewerTab from './ViewerTab.vue'

interface StoredEditorLayout {
  schemaVersion: 2
  layout: SerializedDockview
}

interface ViewerParams {
  path: string
}

const layoutStorageKey = 'bev:editor-layout:v2'
const components = {
  outline: OutlineViewerPanel as unknown as VueComponent,
}
const tabComponents = {
  viewer: ViewerTab as unknown as VueComponent,
}
const watermarkComponent = EditorEmptyState as unknown as VueComponent
const theme: DockviewTheme = {
  ...themeLight,
  name: 'bev-editor',
  gap: 0,
  dndOverlayMounting: 'absolute',
  dndPanelOverlay: 'group',
  dndTabIndicator: 'line',
  dndOverlayBorder: '1px solid var(--accent-border)',
  tabAnimation: 'smooth',
}

const { workspace } = useBevDockContext()
const panelRemovalGuard = createPanelRemovalGuard<IDockviewPanel>()
let api: DockviewApi | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined
const disposables: Array<{ dispose: () => void }> = []

watch(
  () => workspace.openPaths.value,
  () => reconcilePanels(),
)

watch(
  () => workspace.activePath.value,
  path => activatePanel(path),
)

function onReady(event: DockviewReadyEvent): void {
  api = event.api
  restoreLayout(event.api)

  for (const panel of event.api.panels) {
    const path = pathForPanel(panel.params)
    if (path)
      workspace.restoreFile(path)
  }

  const activePath = pathForPanel(event.api.activePanel?.params)
  if (activePath)
    workspace.activateFile(activePath)

  disposables.push(
    event.api.onDidActivePanelChange(({ panel }) => {
      const path = pathForPanel(panel?.params)
      if (path)
        workspace.activateFile(path)
    }),
    event.api.onDidRemovePanel((panel) => {
      if (!panelRemovalGuard.shouldCloseFile(panel))
        return
      const path = pathForPanel(panel.params)
      if (path)
        workspace.closeFile(path)
    }),
    event.api.onDidLayoutChange(scheduleSave),
  )

  reconcilePanels()
  scheduleSave()
}

function reconcilePanels(): void {
  if (!api)
    return

  const expectedIds = new Set(workspace.openPaths.value.map(panelId))
  for (const panel of api.panels) {
    if (!expectedIds.has(panel.id))
      panelRemovalGuard.removeFromLayout(panel, removed => api?.removePanel(removed))
  }

  for (const path of workspace.openPaths.value) {
    if (api.getPanel(panelId(path)))
      continue
    api.addPanel({
      id: panelId(path),
      component: 'outline',
      tabComponent: 'viewer',
      title: fileName(path),
      params: { path } satisfies ViewerParams,
      minimumWidth: 360,
      renderer: 'always',
    })
  }
  activatePanel(workspace.activePath.value)
}

function activatePanel(path: string | null): void {
  if (!api || path === null)
    return
  api.getPanel(panelId(path))?.api.setActive()
}

function restoreLayout(dockApi: DockviewApi): void {
  const serialized = localStorage.getItem(layoutStorageKey)
  if (!serialized)
    return
  try {
    const stored = JSON.parse(serialized) as StoredEditorLayout
    if (stored.schemaVersion !== 2)
      return
    dockApi.fromJSON(stored.layout)
  }
  catch {
    dockApi.clear()
    localStorage.removeItem(layoutStorageKey)
  }
}

function scheduleSave(): void {
  if (saveTimer)
    clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    if (!api)
      return
    const stored: StoredEditorLayout = { schemaVersion: 2, layout: api.toJSON() }
    localStorage.setItem(layoutStorageKey, JSON.stringify(stored))
  }, 160)
}

function pathForPanel(params: unknown): string | null {
  if (!params || typeof params !== 'object' || !('path' in params))
    return null
  return typeof params.path === 'string' ? params.path : null
}

function panelId(path: string): string {
  return `outline:${encodeURIComponent(path)}`
}

function fileName(path: string): string {
  const name = path.split('/').at(-1)
  return name === undefined ? path : name
}

onScopeDispose(() => {
  for (const disposable of disposables)
    disposable.dispose()
  if (saveTimer)
    clearTimeout(saveTimer)
})
</script>

<template>
  <DockviewVue
    class="bev-editor-theme size-full overflow-hidden"
    :components="components"
    :tab-components="tabComponents"
    :watermark-component="watermarkComponent"
    :theme="theme"
    :hide-borders="true"
    :disable-floating-groups="true"
    @ready="onReady"
  />
</template>
