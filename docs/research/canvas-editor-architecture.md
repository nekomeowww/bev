# Research on Canvas/DOM Visual Editors, with an Emphasis on Architecture

> Research date: 2026-08-09. This document relies on project source code and official product documentation. It does not treat Pencil's undisclosed rendering internals as facts.

## Executive Summary

`canvas-timeline` does not "draw React nodes onto a Canvas." It uses a layered hybrid architecture better suited to high-density editors: **serializable domain state + a headless editing engine + a Worker/OffscreenCanvas rendering layer + a small DOM/React interaction and product UI layer**. For timeline interfaces, this boundary scales better than rendering one DOM element per clip.

A Figma-like two-dimensional canvas should establish the same kind of boundary before selecting a graphics library. The document model, or scene graph, is the primary data; the renderer, DOM inspector, exporter, and collaboration client are different projections of that model. Pencil's public `.pen` format follows this approach: a JSON node tree with an infinite two-dimensional coordinate system, parent-relative coordinates, layout, component references, and variables. It does not use the final web DOM directly as the design file.

## 1. How `techsquidtv/canvas-timeline` Works

### Layers and Data Flow

Its official architecture documentation divides responsibilities into four layers:

1. **Core**: `TimelineEngine` has exclusive control over state changes and handles editing commands, playback, undo/redo, snapping, and hit-testing calculations. The core `TimelineState` is the serializable single source of truth.
2. **Renderer**: Draws high-density pixel content such as the ruler, tracks, clips, and feedback lines.
3. **React**: Provides the `Provider`, layout, scrollbars, focus handling, pointer interactions, and accessible controls.
4. **Application**: Handles media decoding, persistence, the toolbar and inspector, and business metadata.

The source code and architecture documentation explicitly recommend keeping large media-related data, such as URLs, waveforms, and transcripts, in the application layer and mapping it through `sourceId` or `clip.id`. History snapshots then contain only compact structural state. See the [architecture documentation](https://github.com/techsquidtv/canvas-timeline/blob/main/apps/www/src/content/docs/architecture.mdx) and [core package](https://github.com/techsquidtv/canvas-timeline/tree/main/packages/core/src).

### Render Worker

`CanvasRenderer` creates a `canvas` with `pointer-events: none`. After confirming support for `Worker` and `transferControlToOffscreen()`, it transfers the `OffscreenCanvas`, state, DPR, and options to a module worker as transferable data. The main thread subscribes only to the engine's render and playhead events and sends incremental messages; a `ResizeObserver` sends dimension updates. See the [`CanvasRenderer` source](https://github.com/techsquidtv/canvas-timeline/blob/main/packages/renderer/src/CanvasRenderer.tsx).

The worker receives messages such as `INIT`, `UPDATE_STATE`, `UPDATE_PLAYHEAD`, and `RESIZE`. A `renderRequested` flag coalesces updates within the same frame before `requestAnimationFrame` calls the pure `renderTimeline(...)` function. This avoids an immediate redraw for every state or pointer update and moves 2D drawing off the main thread. See the [worker source](https://github.com/techsquidtv/canvas-timeline/blob/main/packages/renderer/src/worker.ts).

### Interaction Does Not Live in the Canvas

The Canvas draws only the visual result. React's delegated interaction layer receives pointer events, uses the core geometry and hit-testing logic to identify targets, and displays a small number of interaction affordances. The official architecture documentation summarizes this as "Canvas for density, React for interaction." This design retains DOM focus management, keyboard handling, native scrollbars, and accessibility without reimplementing every control inside the Canvas. See [Rendering layers in the architecture documentation](https://github.com/techsquidtv/canvas-timeline/blob/main/apps/www/src/content/docs/architecture.mdx#rendering-layers) and the [interaction layer source](https://github.com/techsquidtv/canvas-timeline/blob/main/packages/react/src/components/interactions/ClipInteractionLayer.tsx).

### Reusable Design Principles

- Render input should be plain data independent of the React component tree. This allows the renderer to run in a worker, be tested, and be replaced.
- Define coordinate transformations explicitly for every space. Here, the transformation is time/track ↔ viewport; in a Figma-like editor, it is world ↔ viewport ↔ local node.
- Hit testing and rendered geometry should share the same geometry calculations rather than inferring positions from DOM rectangles.
- Cross-thread state should remain small and cloneable. High-frequency transient state, such as hover and drag feedback, can remain separate from the persistent document.
- `OffscreenCanvas` is a performance optimization, not the product model. A fallback or support policy is required when Worker or OffscreenCanvas support is unavailable; the source reports when these capabilities are missing.

## 2. Pencil and the Design-as-Code Approach

### Publicly Verifiable Document Model

Pencil's `.pen` format is a textual JSON object tree. Every node has a unique `id` and `type` on an infinite two-dimensional canvas. Top-level nodes use canvas coordinates, while child elements are positioned relative to their parent. A parent can control the dimensions and positions of its children through flex-style properties such as `layout`, `justifyContent`, and `alignItems`. See the [`.pen` format](https://docs.pencil.dev/for-developers/the-pen-format).

This suggests the following practical minimum schema for a Figma-like document:

```text
Document
  variables / themes / assets
  root children[]                         # world-space nodes
Node
  id, type, name, visible, locked
  transform / x,y,width,height
  fills, stroke, effects, opacity
  layout (absolute | row | column)       # or input to a separate layout engine
  children[]
  component/ref + overrides
```

Pencil also models reuse explicitly: `reusable: true` defines a node as a component, while `type: "ref"` references a component by ID. An instance can store overrides for itself and its descendants. Variables support design tokens and theme evaluation. See [Components and instances](https://docs.pencil.dev/for-developers/the-pen-format#components-and-instances) and [Variables and themes](https://docs.pencil.dev/for-developers/the-pen-format#variables-and-themes).

### How Code Enters the Canvas

The public "Code on Canvas" feature does not edit the real page DOM. A Script node points to a `.js` file in the workspace. The script returns an array of nodes that conform to the same `.pen` schema, and the editor renders them as derived child layers of that node. The output is not written to undo history; it can be converted into ordinary layers when manual editing is required. The script runs in a synchronous sandbox without access to the DOM, network, or file system. This kind of **restricted, deterministic node generator** is more predictable than embedding arbitrary React or HTML directly in the primary scene graph and is better suited to persistence, diffs, and collaboration. See [Code on Canvas](https://docs.pencil.dev/core-concepts/code-on-canvas).

Pencil's Code → Design and Design → Code workflows use `.pen` files and code in the same workspace, allowing an agent to import hierarchy, styles, and layout or generate code. The official documentation does not provide public evidence that the browser DOM is used as the canvas renderer, so its private rendering stack should not be inferred from these features. See [Design ↔ Code](https://docs.pencil.dev/design-and-code/design-to-code).

The CLI also indicates that the desktop application, IDE extension, and headless CLI share the same editor engine. This is another product-level signal that the document/model, rendering, and UI shell are separated. See the [pen.dev CLI](https://docs.pencil.dev/for-developers/pen-cli).

## 3. Technical Choices for a Visual Web DOM Editor

Two product goals should be kept distinct:

| Goal | Primary editing object | Canvas/preview implementation | Key constraints |
| --- | --- | --- | --- |
| Figma, whiteboard, or vector design tool | A custom scene graph | Canvas 2D, WebGL/WebGPU, or Skia; DOM only for overlays and chrome | Must implement layout, text, hit testing, export, and accessibility mapping |
| Web page builder | HTML/CSS/component tree | DOM or an isolated iframe as the final renderer | Must preserve the CSS cascade, responsive behavior, iframe and third-party components, and runtime behavior |
| Hybrid design-to-code tool | Normalized design tree + code bindings | Custom scene renderer, with a DOM preview where necessary | Must not force visual editing state and arbitrary runtime DOM to be identical |

If the goal is to edit the real DOM of an existing website, a DOM or iframe preview is a reasonable choice because CSS layout, fonts, HTML accessibility, and component runtime behavior are part of the requirements. The infinite-canvas layer should still contain only one world-transform container. Selection boxes, drag previews, and alignment guides should live in a separate overlay so that each node does not repeatedly trigger layout or React rerenders.

If the goal is Figma-scale scenes and graphics capabilities, use a canvas-first hybrid: **scene graph + spatial index + retained renderer + DOM overlays**. This has the same boundary as Canvas Timeline, with the coordinate system changed from time/tracks to two-dimensional matrices.

## 4. Recommended Minimum Implementation Sequence and Library Capability Checklist

Establish replaceable abstractions before selecting a Canvas or WebGL library:

1. **Model / commands**: A scene graph with stable IDs, selection, transforms, layout properties, component instances, and JSON serialization. Use commands or transactions to record undo/redo and collaboration-compatible operations.
2. **Geometry core**: `worldToScreen`/`screenToWorld` matrices, AABB/path hit testing, selection boxes, alignment and snapping, and a spatial index such as an R-tree or grid. This layer is central to performance and consistency.
3. **Renderer**: Cull by viewport and separate background, content, selection, and guide layers. Account for DPR, text measurement, and offscreen caching during zoom. Use an OffscreenCanvas worker when drawing work exceeds the main-thread budget.
4. **Input and overlay**: Use Pointer Events and pointer capture, with an interaction state machine such as `idle`, `select`, `marquee`, `drag`, `resize`, and `text-edit`. Use DOM overlays for text editing, menus, tooltips, and property panels.
5. **Layout, text, and media**: Implement only a small subset of flex and constraints internally, or integrate a Yoga-style layout engine. Decide early whether text uses browser text, Canvas text, or a shaping engine to avoid inconsistencies in export and measurement.
6. **Cross-cutting product concerns**: Clipboard support, SVG/PNG/PDF import and export, keyboard and screen-reader fallbacks, persistence, collaborative CRDTs, performance profiling, and visual regression tests.

The first version should be limited to rectangles, text, images, groups and frames, single and multiple selection, pan and zoom, drag and resize, undo/redo, and JSON. Boolean paths, complex effects, component overrides, and multiplayer collaboration should follow later. Pencil's public format likewise shows that components, theme variables, and layout belong in the document model rather than being assembled temporarily in the UI layer.

## Sources

- [Canvas Timeline architecture](https://github.com/techsquidtv/canvas-timeline/blob/main/apps/www/src/content/docs/architecture.mdx)
- [Canvas Timeline renderer source](https://github.com/techsquidtv/canvas-timeline/blob/main/packages/renderer/src/CanvasRenderer.tsx)
- [Canvas Timeline worker source](https://github.com/techsquidtv/canvas-timeline/blob/main/packages/renderer/src/worker.ts)
- [Canvas Timeline interaction layer source](https://github.com/techsquidtv/canvas-timeline/blob/main/packages/react/src/components/interactions/ClipInteractionLayer.tsx)
- [pen.dev `.pen` format](https://docs.pencil.dev/for-developers/the-pen-format)
- [pen.dev Code on Canvas](https://docs.pencil.dev/core-concepts/code-on-canvas)
- [pen.dev Design ↔ Code](https://docs.pencil.dev/design-and-code/design-to-code)
- [pen.dev CLI](https://docs.pencil.dev/for-developers/pen-cli)
