# VS Code File Icon Themes and Open VSX Consumption

Research date: 2026-08-10

## Conclusion

Bev can render the same file icons in both its Explorer and editor tabs without running VS Code or an extension host. A file icon theme is fundamentally declarative data: an extension `package.json` contributes one or more theme JSON files, and each theme JSON maps file/folder identities to SVG/PNG assets or font glyphs. Bev needs one shared resolver and one shared icon component; Explorer rows and tabs should only supply resource metadata to it.

Open VSX exposes enough first-party HTTP APIs to acquire these assets. The safest default is to resolve a concrete extension version, download its VSIX from the metadata response's `files.download` URL, verify and unpack the required files into an application-managed cache, and never execute the extension's `main` or `browser` entry point. Open VSX also exposes `/vscode/unpkg/{namespace}/{extension}/{version}/...` for individual files inside a VSIX; that is useful for previews or lazy loading, but a local versioned cache is more deterministic and avoids hundreds of requests for large SVG themes.

## 1. VS Code's Theme Format

An extension declares file icon themes under `contributes.iconThemes`. Each entry has an `id`, user-facing `label`, and `path` to the theme JSON within the extension. The active ID is persisted as `workbench.iconTheme`, and VS Code uses file icon themes in the Explorer and editor tabs, among other surfaces. See the official [File Icon Theme guide](https://code.visualstudio.com/api/extension-guides/file-icon-theme), [Themes documentation](https://code.visualstudio.com/docs/configure/themes#_file-icon-themes), and [theming capability overview](https://code.visualstudio.com/api/extension-capabilities/theming#_file-icon-theme).

The theme JSON has two layers:

- `iconDefinitions` maps an arbitrary definition ID to either `iconPath` for an SVG/PNG or to a font glyph (`fontCharacter`, with optional `fontColor`, `fontSize`, and `fontId`).
- Associations such as `file`, `folder`, `folderExpanded`, `rootFolder`, `rootFolderExpanded`, `folderNames`, `folderNamesExpanded`, `rootFolderNames`, `rootFolderNamesExpanded`, `fileExtensions`, `fileNames`, and `languageIds` map resource identities to definition IDs.

The optional `fonts` array defines font IDs, source files/formats, weight, style, and size. VS Code emits an `@font-face` for these sources. The source loader resolves both image and font paths relative to the directory containing the theme JSON. See the [theme schema and loader source](https://github.com/microsoft/vscode/blob/72986a28c3fa2a61ea138f90018bb56590208b05/src/vs/workbench/services/themes/browser/fileIconThemeData.ts#L160-L480) and the [official format guide](https://code.visualstudio.com/api/extension-guides/file-icon-theme#_icon-definitions).

The optional `light` and `highContrast` objects contain the same associations and override the base mapping. VS Code applies `light` under its light theme class and applies `highContrast` to both high-contrast dark and high-contrast light. There is not a separate file-icon association object for high-contrast light. See [`collectSelectors` in the VS Code loader](https://github.com/microsoft/vscode/blob/72986a28c3fa2a61ea138f90018bb56590208b05/src/vs/workbench/services/themes/browser/fileIconThemeData.ts#L254-L385).

Additional supported behavior includes:

- `hidesExplorerArrows`, which lets the theme request hidden tree twisties;
- `showLanguageModeIcons`, which controls fallback to icons contributed by registered languages;
- `usesCurrentColor`, which makes image icons CSS masks filled with `currentColor` rather than ordinary background images.

These are implemented by the official [file icon theme loader](https://github.com/microsoft/vscode/blob/72986a28c3fa2a61ea138f90018bb56590208b05/src/vs/workbench/services/themes/browser/fileIconThemeData.ts#L220-L462). `hidesExplorerArrows` is presentation policy rather than part of selecting the icon, so Bev may choose whether to honor it.

## 2. Matching and Precedence

Matching is case-insensitive. Patterns and wildcards are not supported. For `folderNames`, `folderNamesExpanded`, `fileExtensions`, and `fileNames`, a key may include one direct parent folder segment, such as `system/win.ini` or `system/ini`. Multiple-dot filenames generate suffix candidates: `lib.d.ts` can match both `d.ts` and `ts`. The documented strength order is:

```text
file name + parent
> file name
> extension + parent
> extension
> language ID
> generic file
```

See the official [File association documentation](https://code.visualstudio.com/api/extension-guides/file-icon-theme#_file-association). VS Code realizes this ordering with generated CSS specificity: it attaches filename, every extension suffix, parent-directory, and language classes to the same label, then makes filename and extension selectors progressively stronger. See [`getIconClasses`](https://github.com/microsoft/vscode/blob/72986a28c3fa2a61ea138f90018bb56590208b05/src/vs/editor/common/services/getIconClasses.ts#L18-L108) and the [selector generation](https://github.com/microsoft/vscode/blob/72986a28c3fa2a61ea138f90018bb56590208b05/src/vs/workbench/services/themes/browser/fileIconThemeData.ts#L270-L379).

A Bev resolver does not need to reproduce the CSS trick. It should encode the precedence explicitly. For a file, normalize the basename and direct parent to lowercase, try parent-qualified and ordinary `fileNames`, then all longest-to-shortest extension suffixes in the same qualified/unqualified order, then `languageIds`, and finally `file`. For a folder, try the corresponding root/name/expanded associations before the generic root/folder definitions, with the collapsed icon as the expanded fallback when no expanded definition exists.

Language-ID matching deserves a separate boundary. VS Code first uses the open text model's language ID, otherwise asks its language service to infer from path or first line; the file-icon guide notes that a language contribution's `firstLine` rule is not considered for theme association. Bev can get parity for common files by maintaining a language registry derived from the extensions it supports, but exact parity requires VS Code-compatible language contributions, not only `path.extname()`. See [`detectLanguageId`](https://github.com/microsoft/vscode/blob/72986a28c3fa2a61ea138f90018bb56590208b05/src/vs/editor/common/services/getIconClasses.ts#L85-L108) and the [language association note](https://code.visualstudio.com/api/extension-guides/file-icon-theme#_file-association).

## 3. How VS Code Renders the Result

VS Code does not place a separate `<img>` selected by imperative code in every row. Its resource-label layer computes classes such as `file-icon`, `{name}-name-file-icon`, `{suffix}-ext-file-icon`, `{parent}-name-dir-icon`, and `{language}-lang-file-icon`. The theme loader compiles associations into CSS selectors targeting `::before`; image definitions become `background-image` (or a mask for `usesCurrentColor`) and font definitions become glyph content and font styles. See [`ResourceLabel` calling `getIconClasses`](https://github.com/microsoft/vscode/blob/72986a28c3fa2a61ea138f90018bb56590208b05/src/vs/workbench/browser/labels.ts#L650-L700) and the [loader's CSS generation](https://github.com/microsoft/vscode/blob/72986a28c3fa2a61ea138f90018bb56590208b05/src/vs/workbench/services/themes/browser/fileIconThemeData.ts#L387-L462).

Both Explorer and tabs reuse this resource-label machinery. Explorer enables the `show-file-icons` container class, while editor tab controls create resource labels and the editor group toggles `show-file-icons`. See the [Explorer setup](https://github.com/microsoft/vscode/blob/72986a28c3fa2a61ea138f90018bb56590208b05/src/vs/workbench/contrib/files/browser/views/explorerView.ts#L1010-L1025), [multi-tab resource labels](https://github.com/microsoft/vscode/blob/72986a28c3fa2a61ea138f90018bb56590208b05/src/vs/workbench/browser/parts/editor/multiEditorTabsControl.ts#L880-L900), and [editor-group icon toggle](https://github.com/microsoft/vscode/blob/72986a28c3fa2a61ea138f90018bb56590208b05/src/vs/workbench/browser/parts/editor/editorGroupView.ts#L545-L558).

For Bev, a direct data resolver is simpler than reproducing VS Code's generated selector system:

```text
FileIconThemeService
  load(package manifest + theme JSON)
  selectVariant(colorScheme)
  resolve({ path, kind, expanded, root, languageId }) -> IconDefinition | undefined
  assetUrl(definition) -> app-managed URL

FileIcon.vue
  renders an image/mask or a font glyph

Explorer row ─┐
              ├─ FileIcon.vue
Editor tab ───┘
```

This produces one source of truth for both surfaces and allows memoization by `(themeVersion, colorScheme, kind, normalizedParent, basename, languageId, expanded)`.

## 4. Open VSX Metadata and Downloads

The registry's public API is described by its official [Swagger UI](https://open-vsx.org/swagger-ui/index.html) and implemented in [`RegistryAPI`](https://github.com/eclipse-openvsx/openvsx/blob/cddbe855a74e4be904f92028ffb569d705beb11d/server/src/main/java/org/eclipse/openvsx/RegistryAPI.java#L228-L427). Relevant endpoints are:

| Purpose | Endpoint |
| --- | --- |
| Latest extension metadata | `GET /api/{namespace}/{extension}` |
| Latest for a target | `GET /api/{namespace}/{extension}/{targetPlatform}` |
| Concrete version metadata | `GET /api/{namespace}/{extension}/{version}` |
| Concrete target/version | `GET /api/{namespace}/{extension}/{targetPlatform}/{version}` |
| Query exact coordinates | `GET /api/v2/-/query?...` |
| List versions | `GET /api/{namespace}/{extension}/versions` |
| Download/read registered files | URLs returned in the metadata `files` map |
| Browse arbitrary VSIX entries | `GET /vscode/unpkg/{namespace}/{extension}/{version}/**` |

Metadata includes `namespace`, `name`, `version`, `targetPlatform`, `engines`, categories/tags, license metadata, target-specific `downloads`, and a `files` map. The `files` map can include `download`, `manifest`, `icon`, `readme`, `license`, `changelog`, `vsixmanifest`, `sha256`, `signature`, and `publicKey`. See the official [`ExtensionJson` schema](https://github.com/eclipse-openvsx/openvsx/blob/cddbe855a74e4be904f92028ffb569d705beb11d/server/src/main/java/org/eclipse/openvsx/json/ExtensionJson.java#L25-L220) and [`LocalRegistryService` population of file URLs](https://github.com/eclipse-openvsx/openvsx/blob/cddbe855a74e4be904f92028ffb569d705beb11d/server/src/main/java/org/eclipse/openvsx/LocalRegistryService.java#L992-L1040).

For example, the live official metadata endpoint [`/api/PKief/material-icon-theme/latest`](https://open-vsx.org/api/PKief/material-icon-theme/latest) currently returns a concrete universal version and a `files.download` VSIX URL. Consumers should use the URL returned by the response rather than constructing a filename. The registry download route may respond `302 Location` to its object store; follow redirects. Open VSX documents both `200` and `302` file responses and applies CORS to the routes in [`RegistryAPI`](https://github.com/eclipse-openvsx/openvsx/blob/cddbe855a74e4be904f92028ffb569d705beb11d/server/src/main/java/org/eclipse/openvsx/RegistryAPI.java#L669-L777).

The `/api/.../file/**` route only serves file resources the registry extracted and registered; it is not a general view of every VSIX entry. To retrieve arbitrary packaged files without downloading the whole archive, use the official `unpkg` compatibility endpoint. It returns a file or, for a directory, a JSON list of child URLs. See [`VSCodeAPI.browse`](https://github.com/eclipse-openvsx/openvsx/blob/cddbe855a74e4be904f92028ffb569d705beb11d/server/src/main/java/org/eclipse/openvsx/adapter/VSCodeAPI.java#L382-L441) and its [archive extraction implementation](https://github.com/eclipse-openvsx/openvsx/blob/cddbe855a74e4be904f92028ffb569d705beb11d/server/src/main/java/org/eclipse/openvsx/adapter/WebResourceService.java#L90-L169). Concrete examples are the Material Icon Theme [package manifest](https://open-vsx.org/vscode/unpkg/PKief/material-icon-theme/5.37.0/extension/package.json), [theme JSON](https://open-vsx.org/vscode/unpkg/PKief/material-icon-theme/5.37.0/extension/dist/material-icons.json), and [TypeScript SVG](https://open-vsx.org/vscode/unpkg/PKief/material-icon-theme/5.37.0/extension/icons/typescript.svg).

Use a concrete version in cache keys and asset URLs. The registry intentionally sends `no-cache, public` for latest/alias metadata, while concrete metadata is cacheable; its unpkg response is also cacheable. Those policies are visible in the official [metadata controller](https://github.com/eclipse-openvsx/openvsx/blob/cddbe855a74e4be904f92028ffb569d705beb11d/server/src/main/java/org/eclipse/openvsx/RegistryAPI.java#L243-L426) and [browse service/controller](https://github.com/eclipse-openvsx/openvsx/blob/cddbe855a74e4be904f92028ffb569d705beb11d/server/src/main/java/org/eclipse/openvsx/adapter/VSCodeAPI.java#L382-L441).

## 5. Recommended Bev Loader

1. Accept an explicit Open VSX coordinate such as `PKief/material-icon-theme`, optionally pinned to a version. Treat registry search and theme installation as a separate feature from rendering.
2. Resolve latest metadata once, then pin the returned concrete `version` and `targetPlatform`. A theme-only extension is usually `universal`, but do not assume that for every extension.
3. Prefer `files.download`, and optionally verify the published SHA-256/signature resources when present. Unpack only `extension/package.json`, selected theme JSON files, and assets transitively referenced by them.
4. Read `contributes.iconThemes`; do not import or execute `main`, `browser`, commands, or configuration code. Some popular icon-theme extensions use executable code to regenerate their JSON from settings, so Bev will support the static packaged theme but not those VS Code-specific customization commands unless it deliberately reimplements them.
5. Parse JSON/JSONC with size/depth limits. Resolve every theme/font/icon reference against the theme JSON directory, normalize it, and reject absolute paths, URL schemes, NUL bytes, and any result outside the extracted `extension/` root. During ZIP extraction, reject traversal paths and symlinks rather than trusting archive entry names.
6. Store assets under a content- or coordinate-addressed cache such as `{namespace}/{name}/{version}/{targetPlatform}`. Retain license text and metadata with the cached theme; icon artwork remains subject to the extension's license.
7. Expose only typed theme metadata and opaque asset URLs to the Vue renderer through a narrow preload API. Use one resolver/component for Explorer and tabs.

For remote or downloaded SVG, do not inject its markup into the app DOM. Render a validated local asset as `<img>`, CSS `background-image`, or CSS mask, which also matches VS Code's non-inline rendering approach. Keep `nodeIntegration` disabled, context isolation and sandboxing enabled, use a restrictive CSP, and validate IPC senders. These are Electron's official [security recommendations](https://www.electronjs.org/docs/latest/tutorial/security) and [context isolation guidance](https://www.electronjs.org/docs/latest/tutorial/context-isolation). If Bev uses an `app-icon://` custom protocol for cached assets, register only the privileges it needs and keep `bypassCSP` false; see Electron's official [`protocol` API](https://www.electronjs.org/docs/latest/api/protocol).

## 6. Scope and Compatibility Decisions

The following staged compatibility target is practical:

- **Phase 1:** image definitions, base/light/high-contrast variants, all filename/extension/folder/root associations, parent-qualified matches, open/closed folders, and generic fallbacks.
- **Phase 2:** font definitions and `usesCurrentColor` masks.
- **Phase 3:** language-contribution ingestion for stronger `languageIds` parity and optional support for theme-specific settings that generate a modified theme JSON.

Phase 1 is enough for themes such as Material Icon Theme's packaged static JSON and provides the visible result the user expects in Explorer and tabs. The chief parity gap will be language-ID inference and extension-specific runtime customization, not the icon asset format itself.

## 7. Bev Integration Points

The current renderer already supplies almost all resolver inputs:

- `WorkspaceEntry` carries `name`, workspace-relative `path`, `kind`, and optional `languageId` in `apps/bev/src/shared/workspace.ts`.
- `WorkspaceSidebar.vue` flattens those values together with the folder's expanded state, but currently chooses fixed MingCute folder/file classes inline.
- `EditorHost.vue` creates every Dockview panel with a workspace-relative `path`; `ViewerTab.vue` currently derives the basename and chooses another fixed MingCute file class. The tab does not currently receive `languageId`, so filename/extension matching works immediately while full language-ID parity needs either a shared path-to-language registry or an added tab parameter.
- `App.vue` is already the common composition root, while Dockview descendants receive shared services through a typed provide/inject context. A separate file-icon-theme context can therefore serve both the sidebar and `ViewerTab` without putting icon logic into `App.vue` or duplicating it in feature components.

The recommended component and service boundaries are:

```text
main/services/file-icon-theme.ts
  Open VSX metadata, download/cache, archive validation, manifest/theme loading

shared/file-icons.ts
  typed IPC requests/responses and serializable compiled-theme types

renderer/features/file-icons/useFileIconTheme.ts
  load/select theme, choose color variant, memoized synchronous resolver

renderer/features/file-icons/FileIcon.vue
  render image, mask, or font definition; fall back to the existing generic icon

WorkspaceSidebar.vue ─┐
                      ├── FileIcon.vue
ViewerTab.vue ─────────┘
```

Resolve the whole theme once and keep per-row selection synchronous. `WorkspaceSidebar` uses a virtual list and the workspace service allows up to 30,000 entries, so an IPC request or network request per rendered icon would create avoidable churn. Asset bytes can instead be served from the versioned cache through a path-confined custom protocol, or converted to object URLs once per distinct icon definition.

One existing security setting should be revisited before exposing downloaded assets: the main window has `contextIsolation: true` and `nodeIntegration: false`, but explicitly sets `sandbox: false`. The icon feature does not require renderer Node access; enabling the renderer sandbox, adding a restrictive CSP, and keeping all registry/archive access in the main process would align the implementation with Electron's security guidance.

An incremental implementation can be kept reviewable:

1. Add and test the pure resolver against synthetic themes, including case folding, multi-dot extensions, parent-qualified keys, light overrides, and folder expansion fallbacks.
2. Add a main-process Open VSX loader for a user-selected coordinate and concrete version. Cache the static packaged theme only; never activate extension code.
3. Add `FileIcon.vue` and replace the two fixed icon call sites. Keep the current MingCute icons as loading/error/unsupported fallbacks.
4. Add settings UI for registry coordinate, contributed theme ID, update/pin behavior, and “None”. Honor `hidesExplorerArrows` only after the theme is successfully loaded.
5. Add font themes, `usesCurrentColor`, and broader language contribution parity after image-theme behavior is stable.
