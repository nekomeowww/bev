# Bev

**Bev** stands for **Birdeye's View**. It hosts language servers outside an
editor to build navigable semantic views of codebases.

The repository contains reusable LSP modules and an Electron architecture
canvas. Bev keeps the rendered architecture as interactive Vue DOM on a
pan/zoom world: this preserves native component behavior, keyboard focus,
drag-and-drop, Reka UI menus and virtualized file navigation without making Vue
Flow the document model.

## Architecture

The reusable code is deliberately split into four focused modules:

- `LspSession` owns one server process, JSON-RPC connection, initialization,
  server-initiated requests, capabilities and shutdown.
- `DocumentManager` owns open-document text, versions and synchronization.
- `LspClient` exposes the typed standard LSP queries Bev needs.
- `RustAnalyzerAdapter` hides rust-analyzer launch and configuration details.

Raw requests and notifications remain available for language-server extensions,
but normal callers should prefer the typed modules.

Bev starts one language-server runtime per detected project root and language,
so nested Cargo/npm/Go/Python projects work inside monorepos. The current canvas
visualizes document symbols, hover documentation, definitions,
implementations, references, call hierarchy and published diagnostics. Language
renderers are registered independently; Rust has a grouped renderer and other
languages use the generic renderer.

```ts
import {
  DocumentManager,
  LspClient,
  RustAnalyzerAdapter,
} from '@bev-dev/bev'

const workspaceRoot = '/absolute/path/to/rust-project'
const session = new RustAnalyzerAdapter().createSession(workspaceRoot)
await session.start()

const documents = new DocumentManager(session)
const client = new LspClient(session)
const document = await documents.open({
  path: 'src/lib.rs',
  languageId: 'rust',
})

console.log(await client.documentSymbols(document))
await documents.close(document.uri)
await session.shutdown()
```

## Development

Run the fake-server integration test:

```bash
pnpm test
```

Type-check and build the reusable package:

```bash
pnpm check
pnpm build
```

Run the desktop architecture canvas:

```bash
pnpm --filter @bev-dev/bev-desktop dev
```

The supported server executables are discovered from `PATH`: `rust-analyzer`,
`typescript-language-server`, `vue-language-server`,
`basedpyright-langserver`, and `gopls`. A missing server is reported in the
canvas instead of preventing the app from opening.

Run the throwaway rust-analyzer prototype against its fixture workspace:

```bash
rustup component add rust-analyzer
pnpm prototype:rust
```

Or point it at another workspace and file:

```bash
pnpm prototype:rust /absolute/path/to/workspace src/lib.rs
```
