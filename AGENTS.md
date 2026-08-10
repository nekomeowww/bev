# Cint contribution guide

These rules apply to the entire repository. A more specific `AGENTS.md` may refine them for its subtree.

## Vue components

- Use Vue 3 Composition API with `<script setup lang="ts">`.
- Type props, emits, and reusable class maps. Keep rendering declarative and move non-trivial behavior into functions or composables.
- Keep runtime layout values in `:style` only when they cannot be known at build time, such as canvas transforms, pointer coordinates, or tree indentation.

## UnoCSS first

- Prefer UnoCSS utilities in templates. Do not add a component `<style>` block for ordinary layout, spacing, typography, colors, borders, shadows, hover states, or transitions.
- A short, fixed set of utilities belongs in `class=""`.
- Use `:class="[]"` when classes are conditional or long enough to benefit from grouping. Put one logical group in each string:

```vue
<button
  :class="[
    'relative inline-flex size-8 items-center justify-center',
    'border border-[var(--border-subtle)] rounded-lg',
    'bg-[var(--surface-item)] text-[var(--text-secondary)] shadow-sm',
    'transition-colors hover:bg-[var(--surface-item-hover)]',
    active && 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]',
  ]"
>
  <div aria-hidden="true" class="i-lucide:scan-search size-4" />
</button>
```

- Within a class array, group utilities in this order when applicable:
  1. position and stacking;
  2. display and layout;
  3. size and overflow;
  4. spacing;
  5. border, background, and effects;
  6. typography and color;
  7. interaction, state, and transition;
  8. conditional classes.
- Use blank lines between large class-array groups when it improves scanning, as in AIRI's `packages/ui` button components.
- Do not construct utility names with string interpolation. UnoCSS cannot reliably extract them. Use a typed lookup map or complete ternary strings instead.
- Reuse theme CSS custom properties through arbitrary utilities, for example `bg-[var(--surface-panel)]` and `text-[var(--text-primary)]`.
- CSS is reserved for global theme tokens and resets, native Electron properties such as `-webkit-app-region`, keyframes, and visual effects that utilities cannot express clearly. Add a short comment when introducing another exception.

## Icons

- Use UnoCSS Iconify classes, not icon component imports or handwritten SVG markup.
- Use the form `<div aria-hidden="true" class="i-lucide:folder size-4 shrink-0" />`.
- Always specify the icon size at the call site. Use `size-3`, `size-3.5`, or `size-4` for compact controls unless the design requires otherwise.
- Icon-only interactive controls need an accessible name through `aria-label` or visible text; `title` alone is not sufficient.

## Component class ownership

- `App.vue` owns only the application grid and native title-bar drag surface.
- Workspace components own tree layout and workspace interactions.
- Outline components own canvas camera, renderer, cards, toolbar, and inspector presentation.
- Annotation components own annotation popovers and context chips.
- Put a reusable visual primitive in the shared UI package instead of copying a long class list between features.

## Verification

- Run `pnpm --filter @nekomeowww/bev typecheck` after Vue or TypeScript changes.
- Run `pnpm test` for behavior changes covered by the repository test suite.
- Run `pnpm --filter @nekomeowww/bev build` after UnoCSS configuration or class extraction changes.
