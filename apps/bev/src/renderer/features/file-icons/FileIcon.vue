<script setup lang="ts">
import type { CSSProperties } from 'vue'

import { computed } from 'vue'

import { useFileIconThemeContext } from './useFileIconTheme'

const props = defineProps<{
  path: string
  kind: 'directory' | 'file'
  expanded?: boolean
  root?: boolean
  languageId?: string
  selected?: boolean
}>()

const fileIcons = useFileIconThemeContext()
const resolved = computed(() => fileIcons.resolveIcon({
  path: props.path,
  kind: props.kind,
  ...(props.expanded === undefined ? {} : { expanded: props.expanded }),
  ...(props.root === undefined ? {} : { root: props.root }),
  ...(props.languageId === undefined ? {} : { languageId: props.languageId }),
}))
const maskStyle = computed<CSSProperties | undefined>(() => {
  const icon = resolved.value
  if (!icon?.usesCurrentColor)
    return undefined
  return {
    backgroundColor: 'currentColor',
    maskImage: `url("${icon.url}")`,
    maskPosition: 'center',
    maskRepeat: 'no-repeat',
    maskSize: 'contain',
  }
})
const fallbackClass = computed(() => props.kind === 'directory'
  ? (props.expanded ? 'i-mingcute:folder-open-fill' : 'i-mingcute:folder-line')
  : (props.selected ? 'i-mingcute:file-code-fill' : 'i-mingcute:file-code-line'))
</script>

<template>
  <span aria-hidden="true" class="inline-flex shrink-0 items-center justify-center">
    <span v-if="maskStyle" class="size-full" :style="maskStyle" />
    <img
      v-else-if="resolved"
      class="size-full object-contain"
      :src="resolved.url"
      alt=""
      draggable="false"
    >
    <span v-else :class="['size-full', fallbackClass]" />
  </span>
</template>
