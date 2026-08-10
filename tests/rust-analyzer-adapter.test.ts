import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RustAnalyzerAdapter } from '../src/languages/rust/rust-analyzer.js'
import { LspClient } from '../src/lsp/client.js'
import { DocumentManager } from '../src/lsp/documents.js'

const fakeServerPath = fileURLToPath(
  new URL('./fixtures/fake-lsp-server.mjs', import.meta.url),
)

describe('RustAnalyzerAdapter', () => {
  it('creates a Rust-configured LSP session without exposing launch details to callers', async () => {
    const adapter = new RustAnalyzerAdapter({
      command: process.execPath,
      args: [fakeServerPath],
      checkCommand: 'clippy',
    })
    const session = adapter.createSession(process.cwd())
    const documents = new DocumentManager(session)
    const client = new LspClient(session)

    await session.start()
    try {
      const document = await documents.open({
        path: 'src/lib.rs',
        languageId: 'rust',
        text: 'pub fn inspect() {}',
      })
      const symbols = await client.documentSymbols(document)
      expect(symbols).toEqual([
        expect.objectContaining({ name: 'main', detail: 'clippy' }),
      ])
    }
    finally {
      await session.shutdown()
    }
  })
})
