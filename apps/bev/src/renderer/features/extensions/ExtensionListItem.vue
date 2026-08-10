<script setup lang="ts">
import type { OpenVsxFileIconThemeItem } from '../../../shared/file-icons'
import type { FileIconExtensionActionKind } from '../file-icons/useFileIconTheme'

import { shallowRef } from 'vue'

import ActionButton from '../../ui/ActionButton.vue'
import Button from '../../ui/Button.vue'

const props = defineProps<{
  item: OpenVsxFileIconThemeItem
  selected: boolean
  extensionInstalled: boolean
  themeSelected: boolean
  actionKind: FileIconExtensionActionKind | null
  actionDisabled: boolean
}>()

const emit = defineEmits<{
  select: [item: OpenVsxFileIconThemeItem]
  primaryAction: [item: OpenVsxFileIconThemeItem]
}>()

const iconVisible = shallowRef(true)

function select(): void {
  emit('select', props.item)
}

function primaryAction(): void {
  if (!props.themeSelected && !props.actionDisabled)
    emit('primaryAction', props.item)
}

function hideBrokenIcon(): void {
  iconVisible.value = false
}
</script>

<template>
  <article
    :class="[
      'group relative min-h-18 overflow-hidden rounded-xl',
      'transition-colors',
      selected
        ? 'bg-[var(--surface-selected)]'
        : 'bg-transparent hover:bg-[var(--surface-hover)]',
    ]"
  >
    <Button
      :class="[
        'grid min-h-18 w-full grid-cols-[32px_minmax(0,1fr)] items-start gap-2 bg-transparent px-2 pb-7 pt-2 text-left',
        'focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--accent)]',
      ]"
      :aria-label="`View ${item.themeLabel} details`"
      :aria-pressed="selected"
      :title="item.description"
      @click="select"
    >
      <span class="relative inline-flex size-8 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-item)] shadow-sm">
        <div aria-hidden="true" class="i-mingcute:palette-line size-4 text-[var(--text-muted)]" />
        <img
          v-if="item.iconUrl && iconVisible"
          class="absolute inset-0 size-full object-cover"
          :src="item.iconUrl"
          alt=""
          draggable="false"
          @error="hideBrokenIcon"
        >
      </span>
      <span class="min-w-0 pt-0.5">
        <span class="block truncate [font-size:var(--font-size-ui-sm)] font-580 text-[var(--text-primary)]">
          {{ item.themeLabel }}
        </span>
        <span class="mt-0.5 block truncate [font-size:var(--font-size-ui-2xs)] text-[var(--text-muted)]">
          {{ item.extensionId }}
        </span>
      </span>
    </Button>

    <span
      v-if="themeSelected"
      class="absolute bottom-1.5 right-1.5 inline-flex h-5 items-center gap-1 rounded-md bg-[var(--surface-selected)] px-1.5 [font-size:var(--font-size-ui-2xs)] font-600 text-[var(--accent)]"
      role="status"
    >
      <div aria-hidden="true" class="i-mingcute:check-fill size-3" />
      Selected
    </span>
    <ActionButton
      v-else
      class="absolute bottom-1.5 right-1.5"
      size="compact"
      :tone="extensionInstalled ? 'primary' : 'neutral'"
      :disabled="actionDisabled"
      :aria-label="extensionInstalled ? `Select ${item.themeLabel}` : `Install ${item.displayName}`"
      @click="primaryAction"
    >
      <div
        aria-hidden="true"
        :class="[
          'size-3',
          actionKind
            ? 'i-mingcute:loading-3-line animate-spin'
            : extensionInstalled
                ? 'i-mingcute:palette-line'
              : 'i-mingcute:download-2-line',
        ]"
      />
      {{ actionKind === 'installing' ? 'Installing' : actionKind === 'selecting' ? 'Selecting' : actionKind === 'uninstalling' ? 'Uninstalling' : extensionInstalled ? 'Select Theme' : 'Install' }}
    </ActionButton>
  </article>
</template>
