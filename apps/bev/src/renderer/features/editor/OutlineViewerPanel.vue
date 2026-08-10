<script setup lang="ts">
import type { DockviewPanelApi } from 'dockview-vue'

import { computed } from 'vue'

import { useBevDockContext } from '../dock/context'
import OutlineCanvas from '../outline/OutlineCanvas.vue'

const props = defineProps<{
  params: {
    params: {
      path: string
    }
    api: DockviewPanelApi
  }
}>()

const {
  workspace,
  annotations,
  annotationMode,
  beginAnnotation,
  addContext,
} = useBevDockContext()

const state = computed(() => {
  const path = props.params.params.path
  const value = workspace.outlineStates.value.get(path)
  return value === undefined
    ? { status: 'loading' as const, path }
    : value
})
</script>

<template>
  <OutlineCanvas
    :state="state"
    :annotation-mode="annotationMode"
    :selected-context-ids="annotations.targetIds.value"
    @update-annotation-mode="annotationMode = $event"
    @annotate="beginAnnotation"
    @add-context="addContext"
    @inspect="workspace.inspectReference"
    @preview="workspace.previewReference"
    @clear-preview="workspace.clearPreview"
    @retry="workspace.reloadOutline(props.params.params.path)"
  />
</template>
