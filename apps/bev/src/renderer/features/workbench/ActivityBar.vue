<script setup lang="ts">
import { TabsIndicator, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'

import IconButton from '../../ui/IconButton.vue'

export type WorkbenchSidebarView = 'explorer' | 'extensions'

const props = defineProps<{
  activeView: WorkbenchSidebarView
}>()

const emit = defineEmits<{
  selectView: [view: WorkbenchSidebarView]
}>()

function selectView(value: string | number): void {
  if (value === 'explorer' || value === 'extensions')
    emit('selectView', value)
}
</script>

<template>
  <TabsRoot
    :model-value="props.activeView"
    class="window-no-drag shrink-0"
    @update:model-value="selectView"
  >
    <TabsList
      :class="[
        'relative flex h-9 items-center gap-0.5 px-1.5',
        'text-[var(--text-muted)]',
      ]"
      aria-label="Workspace tools"
    >
      <TabsIndicator
        :class="[
          'pointer-events-none absolute bottom-0 left-0 h-0.5',
          'w-[var(--reka-tabs-indicator-size)] translate-x-[var(--reka-tabs-indicator-position)]',
          'transition-[width,transform] duration-200 ease-out motion-reduce:transition-none',
        ]"
      >
        <span class="mx-1 block h-full rounded-full bg-[var(--accent)]" />
      </TabsIndicator>

      <TabsTrigger value="explorer" as-child>
        <IconButton
          label="File Explorer"
          :aria-current="props.activeView === 'explorer' ? 'page' : undefined"
        >
          <div
            aria-hidden="true"
            :class="[
              'i-mingcute:folders-fill size-3.5',
              props.activeView === 'explorer' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]',
            ]"
          />
        </IconButton>
      </TabsTrigger>

      <TabsTrigger value="extensions" as-child>
        <IconButton
          label="Extensions"
          :aria-current="props.activeView === 'extensions' ? 'page' : undefined"
        >
          <div
            aria-hidden="true"
            :class="[
              'size-3.5',
              props.activeView === 'extensions' ? 'i-mingcute:plugin-2-fill' : 'i-mingcute:plugin-2-line',
              props.activeView === 'extensions' ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]',
            ]"
          />
        </IconButton>
      </TabsTrigger>
    </TabsList>
  </TabsRoot>
</template>
