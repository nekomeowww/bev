<script setup lang="ts">
import type { OpenVsxFileIconThemeItem } from '../../../shared/file-icons'
import type { FileIconExtensionActionKind } from '../file-icons/useFileIconTheme'

import { computed, onMounted } from 'vue'

import { useFileIconThemeContext } from '../file-icons/useFileIconTheme'
import ExtensionListItem from './ExtensionListItem.vue'
import ActionButton from '../../ui/ActionButton.vue'
import ToolbarButton from '../../ui/ToolbarButton.vue'

const props = defineProps<{
  selectedItem: OpenVsxFileIconThemeItem | null
}>()

const emit = defineEmits<{
  select: [item: OpenVsxFileIconThemeItem]
}>()

const fileIcons = useFileIconThemeContext()
const loading = computed(() => fileIcons.catalogStatus.value === 'loading')

function themeSelected(item: OpenVsxFileIconThemeItem): boolean {
  const theme = fileIcons.theme.value
  return theme?.extensionId === item.extensionId
    && theme.version === item.version
    && theme.themeId === item.themeId
}

function actionKind(item: OpenVsxFileIconThemeItem): FileIconExtensionActionKind | null {
  const action = fileIcons.extensionAction.value
  return action?.extensionId === item.extensionId
    && action.version === item.version
    && (action.kind !== 'selecting' || action.themeId === item.themeId)
    ? action.kind
    : null
}

function selected(item: OpenVsxFileIconThemeItem): boolean {
  return props.selectedItem?.extensionId === item.extensionId
    && props.selectedItem.themeId === item.themeId
}

function primaryAction(item: OpenVsxFileIconThemeItem): void {
  if (themeSelected(item))
    return
  if (item.installed)
    void fileIcons.selectTheme(item.extensionId, item.version, item.themeId)
  else
    void fileIcons.installExtension(item.extensionId, item.version)
}

function select(item: OpenVsxFileIconThemeItem): void {
  emit('select', item)
}

onMounted(() => void fileIcons.loadCatalog())
</script>

<template>
  <section class="flex h-full min-h-0 flex-col" aria-label="File icon themes">
    <header class="flex h-8 shrink-0 items-center justify-between px-2.5">
      <h2 class="m-0 [font-size:var(--font-size-ui-2xs)] font-650 tracking-[0.12em] text-[var(--text-muted)]">
        FILE ICON THEMES
      </h2>
      <ToolbarButton
        class="text-[var(--text-muted)]"
        label="Refresh file icon themes"
        title="Refresh"
        size="sm"
        :disabled="loading"
        @click="fileIcons.loadCatalog(true)"
      >
        <div
          aria-hidden="true"
          :class="[loading ? 'i-mingcute:loading-3-line animate-spin' : 'i-mingcute:refresh-2-line', 'size-3.5']"
        />
      </ToolbarButton>
    </header>

    <div v-if="loading && !fileIcons.catalog.value.length" class="flex flex-col gap-1.5 px-1.5 py-1">
      <div
        v-for="index in 6"
        :key="index"
        class="flex h-15 items-center gap-2 rounded-xl px-2"
      >
        <div class="size-8 shrink-0 animate-pulse rounded-lg bg-[var(--surface-hover)]" />
        <div class="min-w-0 flex-1 space-y-1.5">
          <div class="h-2.5 w-3/4 animate-pulse rounded bg-[var(--surface-hover)]" />
          <div class="h-2 w-1/2 animate-pulse rounded bg-[var(--surface-hover)]" />
        </div>
      </div>
    </div>

    <div
      v-else-if="fileIcons.catalogError.value"
      class="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center"
    >
      <div aria-hidden="true" class="i-mingcute:wifi-off-line size-5 text-[var(--text-muted)]" />
      <p class="m-0 [font-size:var(--font-size-ui-xs)] leading-4 text-[#ce6c64]">
        {{ fileIcons.catalogError.value }}
      </p>
      <ActionButton
        tone="neutral"
        @click="fileIcons.loadCatalog(true)"
      >
        Try again
      </ActionButton>
    </div>

    <ul v-else class="m-0 min-h-0 flex-1 list-none overflow-y-auto px-1.5 pb-2 pt-0.5">
      <li
        v-for="item in fileIcons.catalog.value"
        :key="`${item.extensionId}:${item.themeId}`"
        class="mb-1.5 last:mb-0"
      >
        <ExtensionListItem
          :item="item"
          :selected="selected(item)"
          :extension-installed="item.installed"
          :theme-selected="themeSelected(item)"
          :action-kind="actionKind(item)"
          :action-disabled="fileIcons.extensionAction.value !== null"
          @select="select"
          @primary-action="primaryAction"
        />
      </li>
    </ul>

    <p
      v-if="fileIcons.error.value"
      class="m-1.5 mt-0 rounded-lg bg-[#ce6c6418] px-2 py-1.5 [font-size:var(--font-size-ui-2xs)] leading-4 text-[#ce6c64]"
      role="alert"
    >
      {{ fileIcons.error.value }}
    </p>
  </section>
</template>
