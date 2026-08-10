/**
 * PROTOTYPE — throw this entry point away after it proves that LspSession can
 * drive rust-analyzer outside an editor. The reusable result lives in src/.
 */
import type { Hover, PublishDiagnosticsParams } from 'vscode-languageserver-protocol'
import { resolve } from 'node:path'
import { ResponseError } from 'vscode-jsonrpc'
import { RustAnalyzerAdapter } from '../src/languages/rust/rust-analyzer.js'
import { LspClient } from '../src/lsp/client.js'
import { DocumentManager } from '../src/lsp/documents.js'

const workspaceRoot = resolve(process.argv[2] ?? 'prototypes/fixtures/rust-workspace')
const documentPath = process.argv[3] ?? 'src/lib.rs'
const diagnosticsTimeoutMs = 5_000

const rustAnalyzer = new RustAnalyzerAdapter({
  onStderr: chunk => process.stderr.write(`[rust-analyzer] ${chunk}`),
})
const session = rustAnalyzer.createSession(workspaceRoot)
const documents = new DocumentManager(session)
const client = new LspClient(session)

function printState(label: string, value: unknown): void {
  process.stdout.write(`\n=== ${label} ===\n`)
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function nextDiagnostics(): Promise<PublishDiagnosticsParams | undefined> {
  return new Promise((resolveDiagnostics) => {
    const timeout = setTimeout(() => resolveDiagnostics(undefined), diagnosticsTimeoutMs)
    const subscription = session.onNotification(
      'textDocument/publishDiagnostics',
      (params: PublishDiagnosticsParams) => {
        clearTimeout(timeout)
        subscription.dispose()
        resolveDiagnostics(params)
      },
    )
  })
}

async function withContentModifiedRetry<Result>(operation: () => Promise<Result>): Promise<Result> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await operation()
    }
    catch (error) {
      const isContentModified = error instanceof ResponseError && error.code === -32801
      if (!isContentModified || attempt === 5)
        throw error

      await new Promise(resolveDelay => setTimeout(resolveDelay, attempt * 100))
    }
  }

  throw new Error('unreachable retry state')
}

try {
  const capabilities = await session.start()
  printState('initialized', {
    state: session.state,
    workspaceRoot,
    selectedCapabilities: {
      documentSymbolProvider: capabilities.documentSymbolProvider,
      hoverProvider: capabilities.hoverProvider,
      definitionProvider: capabilities.definitionProvider,
      referencesProvider: capabilities.referencesProvider,
      callHierarchyProvider: capabilities.callHierarchyProvider,
    },
  })

  const diagnostics = nextDiagnostics()
  const document = await documents.open({
    path: documentPath,
    languageId: 'rust',
  })
  printState('document opened', document)

  const symbols = await client.documentSymbols(document)
  printState('document symbols', symbols)

  printState('first diagnostics publication', await diagnostics ?? {
    status: 'not published within timeout',
  })

  const hover = await withContentModifiedRetry<Hover | null>(() => (
    client.hover(document, { line: 5, character: 10 })
  ))
  printState('hover at 6:11', hover)
}
finally {
  await session.shutdown()
  printState('shutdown', { state: session.state })
}
