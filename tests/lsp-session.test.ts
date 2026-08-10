import type {
  DocumentSymbol,
  PublishDiagnosticsParams,
  ServerCapabilities,
} from 'vscode-languageserver-protocol'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LspSession } from '../src/lsp/session.js'

const fakeServerPath = fileURLToPath(
  new URL('./fixtures/fake-lsp-server.mjs', import.meta.url),
)

describe('LspSession', () => {
  it('initializes a server, answers configuration requests, and exchanges document messages', async () => {
    const session = new LspSession({
      workspaceRoot: process.cwd(),
      server: {
        command: process.execPath,
        args: [fakeServerPath],
      },
      settings: {
        'rust-analyzer': {
          check: { command: 'clippy' },
        },
      },
    })

    try {
      const capabilities: ServerCapabilities = await session.start()
      expect(capabilities.documentSymbolProvider).toBe(true)

      const diagnostics = new Promise<PublishDiagnosticsParams>((resolve) => {
        session.onNotification('textDocument/publishDiagnostics', resolve)
      })

      const document = {
        uri: new URL('file:///workspace/src/main.rs').href,
        languageId: 'rust',
        version: 1,
      }
      await session.notifyRaw('textDocument/didOpen', {
        textDocument: { ...document, text: 'fn main() {}' },
      })

      const symbols = await session.requestRaw<DocumentSymbol[]>(
        'textDocument/documentSymbol',
        { textDocument: { uri: document.uri } },
      )

      expect(symbols).toEqual([
        expect.objectContaining({ name: 'main', detail: 'clippy' }),
      ])
      await expect(diagnostics).resolves.toEqual(expect.objectContaining({
        uri: document.uri,
        version: 1,
        diagnostics: [expect.objectContaining({ message: 'fixture diagnostic' })],
      }))
    }
    finally {
      await session.shutdown()
    }
  })

  it('rejects startup when the language-server executable cannot be spawned', async () => {
    const session = new LspSession({
      workspaceRoot: process.cwd(),
      server: {
        command: 'cint-language-server-that-does-not-exist',
      },
    })

    const startup = Promise.race([
      session.start(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('startup remained pending')), 500)
      }),
    ])

    await expect(startup).rejects.toThrow(/ENOENT|spawn/)
    expect(session.state).toBe('stopped')
  })

  it('stops the server process when protocol initialization fails', async () => {
    const session = new LspSession({
      workspaceRoot: process.cwd(),
      server: {
        command: process.execPath,
        args: [fakeServerPath],
        env: { CINT_FAKE_INITIALIZE_ERROR: '1' },
      },
    })

    await expect(session.start()).rejects.toThrow('fixture initialize failure')
    expect(session.state).toBe('stopped')
  })
})
