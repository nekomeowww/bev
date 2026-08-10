<template>
  <nav
    :class="[
      'window-no-drag flex h-9 items-center gap-0.5 px-1.5',
      'text-[var(--text-muted)]',
    ]"
    aria-label="Workspace tools"
  >
    <button
      :class="[
        'relative inline-flex size-7 items-center justify-center border-0 rounded-lg bg-transparent p-0',
        'bg-[var(--surface-selected)] text-[var(--text-primary)] transition-colors',
        'hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
        'focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
      ]"
      type="button"
      aria-label="File Explorer"
      title="File Explorer"
      aria-current="page"
    >
      <div aria-hidden="true" class="i-mingcute:folders-fill size-3.5" />
      <span
        aria-hidden="true"
        class="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-[var(--accent)]"
      />
    </button>
  </nav>
</template>
