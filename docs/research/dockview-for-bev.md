# Evaluating Dockview for Bev's Panel Layout

Research date: 2026-08-09

## Conclusion

Dockview is a viable choice for Bev, especially if the product is expected to evolve toward a VS Code-style interface with draggable panels, panel groups, tabs, and persistent workspace layouts. The current `App.vue` has only two fixed columns: a `248px` sidebar and a main area. If the near-term requirement is limited to dragging a single divider, the full Dockview package would introduce layout state, tab bars, and drag-and-drop interactions that are not yet needed. In that case, `SplitviewVue` would require fewer changes. If dockable Inspector, Diagnostics, or Terminal panels are already planned, adopting `DockviewVue` directly is recommended.

The recommended initial mapping is:

| Bev area | Dockview structure | Notes |
| --- | --- | --- |
| `WorkspaceSidebar` | Left Edge Group | Initial width of approximately `248px`; can be collapsed and remember its width. Use a regular Group instead if it may need to float or pop out in the future. |
| `OutlineCanvas` | Central regular Panel | The main editing area, with room for multiple outline tabs. Preserving DOM state is recommended. |
| `SymbolInspector` | Right Edge Group or regular Group | Use an Edge Group for a fixed tool panel; use a regular Group if it must be docked into the main area or floated. |
| `DiagnosticTray` / Terminal | Bottom Edge Group or regular Group | Use an Edge Group for a fixed, collapsible tool panel; use a regular Group if arbitrary docking is required. |

Edge Groups stay attached to the four edges and support tabs, drag and drop, collapsing, size constraints, and serialization. They cannot be maximized, floated, or popped out. Whether an area should use an Edge Group therefore depends on whether it is a fixed tool panel. See the [official Edge Groups documentation](https://dockview.dev/docs/core/groups/edgeGroups/).

## Vue 3 Integration

The official package is `dockview-vue`. As of the research date, the stable npm release is `7.0.4`. It depends on `dockview ^7.0.4` and declares a Vue peer dependency of `^3.4.0`; Bev's current Vue version, `3.5.32`, satisfies that range. See the [npm metadata for version 7.0.4](https://registry.npmjs.org/dockview-vue/7.0.4).

The Vue package exports `DockviewVue`, `SplitviewVue`, `GridviewVue`, and `PaneviewVue`. `DockviewVue` accepts maps of Vue panel and tab components, along with components for left, right, and prefix header actions. Once mounted, it exposes the `DockviewApi` through the `ready` event. See the [Vue v7 type definitions](https://github.com/dockview/dockview/blob/v7.0.4/packages/dockview-vue/src/dockview/types.ts). The official example uses `@ready="onReady"` and then calls `event.api.addPanel(...)` to create panels. See the [official Vue example](https://github.com/dockview/dockview/blob/v7.0.4/packages/docs/templates/dockview/basic/vue/src/index.ts).

Integrating Dockview into Bev requires adjusting the state boundaries. Currently, `App.vue` creates `useWorkspace()` and connects `WorkspaceSidebar` and `OutlineCanvas` through ordinary props and emits. Dockview instantiates panel components itself, with dynamic panel parameters supplied through `params`. Do not put the entire workspace, Vue refs, or LSP objects into panel params. Layout persistence includes params, while application state has a separate lifecycle from layout state. A more robust approach is:

1. Let `App.vue`, or a dedicated `BevDock.vue`, hold only the `DockviewApi` and the layout initialization and restoration logic.
2. Move workspace, outline, selection, annotations, and LSP insights into shared stores or composables.
3. Store only small, serializable panel identities in panel params, such as a file path or view ID.
4. Continue implementing panel components with the existing UnoCSS and Iconify conventions; Dockview should manage only the outer layout.

The official documentation likewise describes panel params as small, static, serializable data rather than an application-state container. See [Updating a Panel](https://dockview.dev/docs/core/panels/update/).

## Layout and Interaction Capabilities

Dockview's basic model is `Panel -> Group with a tab bar -> resizable Grid`. Users can reorder tabs, move them across Groups, create a new Group by dropping at the edge of a target, or convert a Group into a floating group. See [Core Concepts](https://dockview.dev/docs/core/overview/). Through the API, a Panel can also be placed `left`, `right`, `above`, `below`, or `within` another Panel, a Group, or the entire container. Initial, minimum, and maximum dimensions can be set, although constraints may be ignored when space is insufficient to avoid overflow. See [Adding Panels](https://dockview.dev/docs/core/panels/add/).

Container resizing is handled by `ResizeObserver` by default. Automatic resizing can also be disabled in favor of calling `api.layout(width, height)` manually. See [Sizing & Layout](https://dockview.dev/docs/core/sizing/). This behavior fits Electron window resizing and saves Bev from implementing splitter pointer capture, minimum widths, and window resize handling itself.

Floating Groups are freely positioned overlays within the Dockview container and support multiple floating containers and nested layouts. See [Floating Groups](https://dockview.dev/docs/core/groups/floatingGroups/). Popouts open a separate browser window and require a blank page. `popoutUrl` must be a same-origin HTTP(S) URL; the library rejects cross-origin URLs and schemes such as `javascript:`, `data:`, and `blob:`. See [Popout Windows](https://dockview.dev/docs/core/groups/popoutGroups/). This suggests that if Bev's packaged renderer loads from `file://`, the built-in popout feature cannot be assumed to work. It should first be verified in a packaged build. If the same-origin HTTP(S) requirement cannot be met, the entry point should be disabled or multi-window support should be implemented with Electron `BrowserWindow` and IPC.

## Saving and Restoring Layouts

`api.toJSON()` returns the complete layout, and `onDidLayoutChange` can be used to trigger automatic saves. See [Saving State](https://dockview.dev/docs/core/state/save/). `api.fromJSON()` restores a layout. Invalid or corrupted data causes an error and resets Dockview to a state from which another layout can be loaded. See [Loading State](https://dockview.dev/docs/core/state/load/).

Bev should wrap the saved layout in a versioned envelope:

```ts
interface BevLayoutEnvelope {
  schemaVersion: 1
  dockviewVersion: 7
  layout: SerializedDockview
}
```

On startup, migrate the data according to `schemaVersion` and create the default layout if restoration fails. The layout JSON should cover only Groups, Panels, dimensions, tab order, and panel identity. File contents, outlines, diagnostics, and LSP state should remain under Bev's own state management.

## Custom Tabs, Headers, and Themes

Each Panel can select a custom tab renderer through `tabComponent`, while its title can still be updated through the panel API. See [Adding Panels](https://dockview.dev/docs/core/panels/add/). The Vue wrapper also provides `tabComponents`, `defaultTabComponent`, `leftHeaderActionsComponent`, `rightHeaderActionsComponent`, and `prefixHeaderActionsComponent`. Bev can therefore implement its own file icons, dirty indicators, close buttons, and panel action areas with Vue and UnoCSS. See the [Vue v7 type definitions](https://github.com/dockview/dockview/blob/v7.0.4/packages/dockview-vue/src/dockview/types.ts).

Dockview requires its structural stylesheet, `dockview.css`, to be imported explicitly. Themes are primarily controlled through `--dv-*` CSS variables, while behavior such as gaps, drag-and-drop overlays, tab animations, and collapsed Edge Group sizes is configured through the theme object. See [Theming](https://dockview.dev/docs/core/theming/). This does not conflict with Bev's UnoCSS-first conventions, but it introduces two boundaries:

- Dockview's third-party structural CSS must remain and cannot be fully replaced with UnoCSS utilities.
- Map `--dv-*` variables to Bev's `--surface-*`, `--border-*`, and `--text-*` variables in a single global `.bev-dockview-theme` rule. Business components should not depend on internal `.dv-*` selectors.

Panels and custom tabs or headers should continue to follow the repository's `AGENTS.md` conventions for `class=""`, `:class="[]"`, and UnoCSS Iconify.

## Canvas Lifecycle Risks

Dockview's default `onlyWhenVisible` renderer removes hidden tabs from the DOM. This loses DOM scroll position and can cause size measurements and `ResizeObserver` readings to report `0 × 0`. Setting `renderer: 'always'` preserves the DOM and hides it visually, which retains DOM state, but animations, `requestAnimationFrame`, and subscriptions continue running while the panel is hidden. See [Rendering Panels](https://dockview.dev/docs/core/panels/rendering/).

`OutlineCanvas` depends on viewport dimensions, camera transforms, and pointer interactions. Its Panel should use `renderer: 'always'`, while future rendering loops, expensive observers, and background computations should be paused through `onDidVisibilityChange`. The same strategy applies to a Terminal that needs to retain its native scroll position. A standard Inspector or Diagnostics panel can keep the default `onlyWhenVisible` behavior.

## Versions, Maintenance, and Licensing

Both `dockview-vue@7.0.4` and `dockview@7.0.4` are licensed under MIT. npm metadata shows that `dockview-vue@7.0.4` was published on 2026-07-22. The project published v7.0.2, v7.0.3, and v7.0.4 on 2026-06-22, 2026-07-21, and 2026-07-22, respectively. As of the research date, the repository still had subsequent commits and experimental packages, indicating active maintenance. See the [npm version metadata](https://registry.npmjs.org/dockview-vue/7.0.4), [official releases](https://github.com/dockview/dockview/releases), and [MIT license file](https://github.com/dockview/dockview/blob/v7.0.4/LICENCE.md).

The fast release cadence also means that matching versions of `dockview-vue` and `dockview` should be pinned, and migration notes should be reviewed before major upgrades. v7 itself changed package names and the relationships between framework packages, indicating that major versions may include integration-layer changes. See [Migrating to v7](https://dockview.dev/docs/overview/migrating-to-v7/).

## Recommended Implementation Sequence

1. Build a `DockviewVue` spike containing only `WorkspaceSidebar`, `OutlineCanvas`, a placeholder Inspector on the right, and a placeholder Terminal at the bottom, without changing business behavior.
2. Disable popouts for the first iteration. Verify resizing, drag and drop, tabs, Edge Group collapsing, the macOS title-bar drag region, and UnoCSS theme mapping.
3. Move workspace and outline state out of the local props/emits chain in `App.vue`, then integrate the real Panels.
4. Save layouts to local storage in a schema-versioned envelope. Test corrupted JSON, missing Panels, and post-upgrade fallback behavior.
5. Verify canvas pointer input, `ResizeObserver`, context menus, popover z-index, and hide/restore behavior in both development and packaged Electron builds.

If the spike's near-term acceptance criterion is limited to a resizable left sidebar, start with `SplitviewVue`. If it also requires panels to dock on all four sides, merge into tabs, and save and restore their layout, `DockviewVue` is the closer match.
