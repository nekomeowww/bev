<script setup lang="ts">
import type { OpenVsxFileIconThemeItem } from '../../../shared/file-icons'

import { computed, shallowRef, watch } from 'vue'

import ActionButton from '../../ui/ActionButton.vue'
import { useFileIconThemeContext } from '../file-icons/useFileIconTheme'

const props = defineProps<{
  item: OpenVsxFileIconThemeItem | null
}>()

const fileIcons = useFileIconThemeContext()
const iconVisible = shallowRef(true)
const extensionInstalled = computed(() => {
  const item = props.item
  if (!item)
    return false
  return fileIcons.catalog.value.find(candidate => (
    candidate.extensionId === item.extensionId && candidate.version === item.version
  ))?.installed ?? item.installed
})
const themeSelected = computed(() => {
  const item = props.item
  const theme = fileIcons.theme.value
  return item !== null
    && theme?.extensionId === item.extensionId
    && theme.version === item.version
    && theme.themeId === item.themeId
})
const actionKind = computed(() => {
  const item = props.item
  const action = fileIcons.extensionAction.value
  return item
    && action?.extensionId === item.extensionId
    && action.version === item.version
    && (action.kind !== 'selecting' || action.themeId === item.themeId)
    ? action.kind
    : null
})
const actionInProgress = computed(() => fileIcons.extensionAction.value !== null)
const publisher = computed(() => props.item?.extensionId.split('.')[0] ?? '')
const openVsxUrl = computed(() => {
  const [namespace, name] = props.item?.extensionId.split('.') ?? []
  return namespace && name
    ? `https://open-vsx.org/extension/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
    : 'https://open-vsx.org/'
})

watch(
  () => props.item?.iconUrl,
  () => {
    iconVisible.value = true
  },
)

function primaryAction(): void {
  const item = props.item
  if (!item || themeSelected.value || actionInProgress.value)
    return
  if (extensionInstalled.value)
    void fileIcons.selectTheme(item.extensionId, item.version, item.themeId)
  else
    void fileIcons.installExtension(item.extensionId, item.version)
}

function uninstall(): void {
  const item = props.item
  if (item && extensionInstalled.value && !actionInProgress.value)
    void fileIcons.uninstallExtension(item.extensionId, item.version)
}

function hideBrokenIcon(): void {
  iconVisible.value = false
}
</script>

<template>
  <section class="h-full min-h-0 overflow-y-auto bg-[var(--surface-workspace)]" aria-label="Extension details">
    <div v-if="item" class="mx-auto max-w-4xl px-8 pb-14 pt-15 md:px-12 md:pt-18">
      <header class="flex items-start gap-5">
        <div class="relative inline-flex size-22 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--surface-item)] shadow-md">
          <div aria-hidden="true" class="i-mingcute:palette-line size-9 text-[var(--text-muted)]" />
          <img
            v-if="item.iconUrl && iconVisible"
            class="absolute inset-0 size-full object-cover"
            :src="item.iconUrl"
            alt=""
            draggable="false"
            @error="hideBrokenIcon"
          >
        </div>

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="m-0 truncate text-2xl font-650 text-[var(--text-primary)]">
              {{ item.displayName }}
            </h1>
            <span class="rounded-full bg-[var(--surface-item)] px-2 py-0.5 [font-size:var(--font-size-ui-2xs)] text-[var(--text-muted)]">
              File Icon Theme
            </span>
          </div>
          <p class="mb-0 mt-1 [font-size:var(--font-size-ui-sm)] text-[var(--text-secondary)]">
            {{ item.extensionId }} · {{ item.version }}
          </p>
          <p class="mb-0 mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
            {{ item.description }}
          </p>

          <div class="mt-4 flex flex-wrap items-center gap-2">
            <span
              v-if="themeSelected"
              class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--surface-selected)] px-3 text-sm font-600 text-[var(--accent)]"
              role="status"
            >
              <div aria-hidden="true" class="i-mingcute:check-fill size-4" />
              Selected
            </span>
            <ActionButton
              v-else
              tone="primary"
              :disabled="actionInProgress"
              @click="primaryAction"
            >
              <div
                aria-hidden="true"
                :class="[
                  'size-4',
                  actionKind
                    ? 'i-mingcute:loading-3-line animate-spin'
                    : extensionInstalled
                        ? 'i-mingcute:palette-line'
                      : 'i-mingcute:download-2-line',
                ]"
              />
              {{ actionKind === 'installing' ? 'Installing' : actionKind === 'selecting' ? 'Selecting' : extensionInstalled ? 'Select Theme' : 'Install' }}
            </ActionButton>
            <ActionButton
              v-if="extensionInstalled"
              tone="danger"
              :disabled="actionInProgress"
              @click="uninstall"
            >
              <div
                aria-hidden="true"
                :class="[
                  'size-4',
                  actionKind === 'uninstalling'
                    ? 'i-mingcute:loading-3-line animate-spin'
                    : 'i-mingcute:delete-2-line',
                ]"
              />
              {{ actionKind === 'uninstalling' ? 'Uninstalling' : 'Uninstall' }}
            </ActionButton>
            <a
              :class="[
                'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3',
                'bg-[var(--surface-item)] text-sm text-[var(--text-secondary)] no-underline transition-colors',
                'hover:bg-[var(--surface-item-hover)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
              ]"
              :href="openVsxUrl"
              target="_blank"
              rel="noreferrer"
            >
              Open VSX
              <div aria-hidden="true" class="i-mingcute:external-link-line size-3.5" />
            </a>
          </div>
        </div>
      </header>

      <div class="mt-8 grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
        <section class="rounded-2xl bg-[var(--surface-panel)] p-5 shadow-sm">
          <h2 class="m-0 text-base font-650 text-[var(--text-primary)]">
            Included theme
          </h2>
          <div class="mt-4 flex items-center gap-3 rounded-xl bg-[var(--surface-item)] p-3">
            <div aria-hidden="true" class="i-mingcute:palette-line size-5 shrink-0 text-[var(--accent)]" />
            <div class="min-w-0">
              <p class="m-0 truncate text-sm font-600 text-[var(--text-primary)]">
                {{ item.themeLabel }}
              </p>
              <p class="mb-0 mt-0.5 truncate [font-size:var(--font-size-ui-xs)] text-[var(--text-muted)]">
                {{ item.themeId }}
              </p>
            </div>
          </div>
        </section>

        <aside class="rounded-2xl bg-[var(--surface-panel)] p-5 shadow-sm">
          <h2 class="m-0 text-base font-650 text-[var(--text-primary)]">
            Extension
          </h2>
          <dl class="mb-0 mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 text-sm">
            <dt class="text-[var(--text-muted)]">Publisher</dt>
            <dd class="m-0 truncate text-right text-[var(--text-primary)]">{{ publisher }}</dd>
            <dt class="text-[var(--text-muted)]">Version</dt>
            <dd class="m-0 truncate text-right text-[var(--text-primary)]">{{ item.version }}</dd>
            <dt class="text-[var(--text-muted)]">Source</dt>
            <dd class="m-0 truncate text-right text-[var(--text-primary)]">Open VSX</dd>
          </dl>
        </aside>
      </div>

      <p
        v-if="fileIcons.error.value"
        class="mt-4 rounded-xl bg-[#ce6c6418] px-3 py-2 text-sm leading-5 text-[#ce6c64]"
        role="alert"
      >
        {{ fileIcons.error.value }}
      </p>
    </div>

    <div v-else class="flex h-full min-h-80 flex-col items-center justify-center px-8 text-center">
      <div aria-hidden="true" class="i-mingcute:plugin-2-line size-9 text-[var(--text-muted)]" />
      <h1 class="mb-0 mt-4 text-base font-650 text-[var(--text-primary)]">
        Select a file icon theme
      </h1>
      <p class="mb-0 mt-1 max-w-sm text-sm leading-5 text-[var(--text-muted)]">
        Choose an extension from the sidebar to view its details.
      </p>
    </div>
  </section>
</template>
