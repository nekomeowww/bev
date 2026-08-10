import { defineConfig, presetIcons, presetWind3, transformerVariantGroup } from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
    presetIcons({
      scale: 1,
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  shortcuts: {
    'ui-icon': 'inline-block size-[1em] shrink-0 align-middle',
    'bev-context-menu': 'z-100 min-w-44 border border-[var(--border-strong)] rounded-xl bg-[var(--surface-popover)] p-1.5 text-[var(--text-primary)] shadow-[var(--shadow-popover)] backdrop-blur-3xl',
    'bev-menu-item': 'flex min-h-7 cursor-default select-none items-center gap-2 rounded-lg px-2 [font-size:var(--font-size-ui-xs)] text-[var(--text-secondary)] outline-none data-[highlighted]:bg-[var(--surface-hover)] data-[highlighted]:text-[var(--text-primary)]',
    'bev-menu-separator': 'my-1 h-px bg-[var(--border-subtle)]',
  },
  rules: [
    [/^window-drag-region$/, () => ({ '-webkit-app-region': 'drag' })],
    [/^window-no-drag$/, () => ({ '-webkit-app-region': 'no-drag' })],
  ],
  transformers: [
    transformerVariantGroup(),
  ],
})
