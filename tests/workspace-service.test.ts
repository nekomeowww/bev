import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import { WorkspaceService } from '../apps/bev/src/main/services/workspace.js'
import { LspSession } from '../src/lsp/session.js'

const fakeServerPath = fileURLToPath(
  new URL('./fixtures/fake-lsp-server.mjs', import.meta.url),
)
const temporaryDirectories: string[] = []

afterEach(async () => {
  const directories = temporaryDirectories.splice(0)
  await Promise.all(directories.map(path => rm(path, { recursive: true, force: true })))
})

describe('WorkspaceService', () => {
  it('deduplicates concurrent document opens and publishes diagnostics', async () => {
    const rootPath = await createRustWorkspace('concurrent')
    const workspace = createWorkspaceService()
    const updates: Array<{ path: string, count: number }> = []
    const stopDiagnostics = workspace.onDiagnostics(update => updates.push({
      path: update.path,
      count: update.diagnostics.length,
    }))

    try {
      await workspace.open(rootPath)
      const [first, second, other] = await Promise.all([
        workspace.outline('src/lib.rs'),
        workspace.outline('src/lib.rs'),
        workspace.outline('src/other.rs'),
      ])

      expect(first.path).toBe('src/lib.rs')
      expect(first.symbols.map(symbol => symbol.name)).toEqual(['main'])
      expect(second).toEqual(first)
      expect(other.path).toBe('src/other.rs')
      expect(other.symbols.map(symbol => symbol.name)).toEqual(['main'])
      expect(updates).toContainEqual({ path: 'src/lib.rs', count: 1 })
    }
    finally {
      stopDiagnostics()
      await workspace.dispose()
    }
  })

  it('closes LSP documents and can reopen them cleanly', async () => {
    const rootPath = await createRustWorkspace('document-lifecycle')
    const workspace = createWorkspaceService()

    try {
      await workspace.open(rootPath)
      await expect(workspace.outline('src/lib.rs')).resolves.toMatchObject({
        symbols: [{ name: 'main' }],
      })

      await workspace.closeDocument('src/lib.rs')

      await expect(workspace.outline('src/lib.rs')).resolves.toMatchObject({
        symbols: [{ name: 'main' }],
      })
    }
    finally {
      await workspace.dispose()
    }
  })

  it('reports explicit analysis loading and refreshes after roots are scanned', async () => {
    const rootPath = await createRustWorkspace('runtime-readiness')
    const workspace = createWorkspaceService()

    try {
      await workspace.open(rootPath)

      const statuses: string[] = []
      const stopStatuses = workspace.onLanguageStatus(update => statuses.push(update.status))
      await expect(workspace.outline('src/loading.rs')).resolves.toMatchObject({
        analysisStatus: 'loading',
        symbols: [],
      })
      await new Promise(resolveDelay => setTimeout(resolveDelay, 75))
      await expect(workspace.outline('src/loading.rs')).resolves.toMatchObject({
        analysisStatus: 'ready',
        symbols: [{ name: 'main' }],
      })
      expect(statuses).toEqual(['loading', 'ready'])
      stopStatuses()
    }
    finally {
      await workspace.dispose()
    }
  })

  it('serializes workspace changes so the last request remains current', async () => {
    const firstRoot = await createRustWorkspace('first')
    const secondRoot = await createRustWorkspace('second')
    const workspace = createWorkspaceService()

    try {
      await Promise.all([
        workspace.open(firstRoot),
        workspace.open(secondRoot),
      ])

      expect(workspace.current?.rootPath).toBe(secondRoot)
      expect(workspace.current?.rootName).toBe('second')
    }
    finally {
      await workspace.dispose()
    }
  })

  it('starts rust-analyzer at the Cargo workspace root instead of a member crate', async () => {
    const rootPath = await createNestedRustWorkspace('nested-root')
    const sessionRoots: string[] = []
    const workspace = new WorkspaceService({
      createLanguageSession: ({ rootPath: sessionRoot }) => {
        sessionRoots.push(sessionRoot)
        return new LspSession({
          workspaceRoot: sessionRoot,
          server: {
            command: process.execPath,
            args: [fakeServerPath],
          },
          settings: {},
        })
      },
    })

    try {
      await workspace.open(rootPath)
      await workspace.outline('crates/member/src/lib.rs')

      expect(sessionRoots).toEqual([rootPath])
    }
    finally {
      await workspace.dispose()
    }
  })

  it('reports unsupported source files instead of returning empty success', async () => {
    const rootPath = await createRustWorkspace('unsupported')
    const workspace = createWorkspaceService()

    try {
      await workspace.open(rootPath)
      await expect(workspace.outline('Cargo.toml')).rejects.toThrow(
        'No language server is configured for this file type',
      )
    }
    finally {
      await workspace.dispose()
    }
  })

  it('reads source documents with an explicit language', async () => {
    const rootPath = await createRustWorkspace('source-preview')
    const workspace = createWorkspaceService()

    try {
      await workspace.open(rootPath)

      await expect(workspace.source('src/lib.rs')).resolves.toEqual({
        path: 'src/lib.rs',
        languageId: 'rust',
        content: 'fn main() {}\n',
      })
      await expect(workspace.source('Cargo.toml')).resolves.toMatchObject({
        path: 'Cargo.toml',
        languageId: 'plaintext',
      })
    }
    finally {
      await workspace.dispose()
    }
  })

  it('does not read files outside the workspace', async () => {
    const rootPath = await createRustWorkspace('source-boundary')
    const workspace = createWorkspaceService()

    try {
      await workspace.open(rootPath)
      await expect(workspace.source('../outside.rs')).rejects.toThrow('outside the workspace')
    }
    finally {
      await workspace.dispose()
    }
  })

  it('rejects requests scoped to a stale workspace root', async () => {
    const firstRoot = await createRustWorkspace('scope-first')
    const secondRoot = await createRustWorkspace('scope-second')
    const workspace = createWorkspaceService()

    try {
      await workspace.open(firstRoot)
      workspace.assertCurrentRoot(firstRoot)

      await workspace.open(secondRoot)
      expect(() => workspace.assertCurrentRoot(firstRoot)).toThrow(
        'workspace changed in the application process',
      )
    }
    finally {
      await workspace.dispose()
    }
  })
})

function createWorkspaceService(): WorkspaceService {
  return new WorkspaceService({
    createLanguageSession: ({ rootPath }) => new LspSession({
      workspaceRoot: rootPath,
      server: {
        command: process.execPath,
        args: [fakeServerPath],
      },
      settings: {},
    }),
  })
}

async function createRustWorkspace(name: string): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), 'cint-workspace-'))
  temporaryDirectories.push(parent)
  const rootPath = join(parent, name)
  await mkdir(join(rootPath, 'src'), { recursive: true })
  await writeFile(join(rootPath, 'Cargo.toml'), `[package]\nname = "${name}"\nversion = "0.1.0"\n`)
  await writeFile(join(rootPath, 'src/lib.rs'), 'fn main() {}\n')
  await writeFile(join(rootPath, 'src/other.rs'), 'fn other() {}\n')
  await writeFile(join(rootPath, 'src/loading.rs'), 'fn loading() {}\n')
  return rootPath
}

async function createNestedRustWorkspace(name: string): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), 'cint-workspace-'))
  temporaryDirectories.push(parent)
  const rootPath = join(parent, name)
  const memberPath = join(rootPath, 'crates/member')
  await mkdir(join(memberPath, 'src'), { recursive: true })
  await writeFile(join(rootPath, 'Cargo.toml'), '[workspace]\nmembers = ["crates/member"]\n')
  await writeFile(join(memberPath, 'Cargo.toml'), '[package]\nname = "member"\nversion = "0.1.0"\n')
  await writeFile(join(memberPath, 'src/lib.rs'), 'fn member() {}\n')
  return rootPath
}
