import type {
  CallHierarchyItem,
  Diagnostic,
  DocumentSymbol,
  Hover,
  Location,
  LocationLink,
  Position,
  PublishDiagnosticsParams,
  ServerCapabilities,
  SymbolInformation,
  TypeHierarchyItem,
} from 'vscode-languageserver-protocol'

import { readFile, readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ResponseError } from 'vscode-jsonrpc'
import type { Disposable } from 'vscode-jsonrpc'

import {
  DocumentManager,
  LspClient,
  LspSession,
  RustAnalyzerAdapter,
  type DocumentHandle,
} from '../../../../../src/index.js'
import type {
  OutlineSnapshot,
  OutlineDiagnostic,
  OutlineSymbol,
  SourceReference,
  SourceDocumentSnapshot,
  SymbolInsight,
  WorkspaceDiagnosticsUpdate,
  WorkspaceLanguageStatusUpdate,
  WorkspaceEntry,
  WorkspaceSnapshot,
} from '../../shared/workspace.js'

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.idea',
  '.next',
  '.nuxt',
  '.output',
  '.turbo',
  '.vscode',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
])

const MAX_WORKSPACE_ENTRIES = 30_000

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.c': 'c',
  '.cc': 'cpp',
  '.cpp': 'cpp',
  '.css': 'css',
  '.go': 'go',
  '.h': 'c',
  '.hpp': 'cpp',
  '.html': 'html',
  '.java': 'java',
  '.js': 'javascript',
  '.jsx': 'javascriptreact',
  '.json': 'json',
  '.kt': 'kotlin',
  '.md': 'markdown',
  '.py': 'python',
  '.rs': 'rust',
  '.scss': 'scss',
  '.swift': 'swift',
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.vue': 'vue',
  '.yaml': 'yaml',
  '.yml': 'yaml',
}

const SYMBOL_KIND_LABELS = [
  'Unknown',
  'File',
  'Module',
  'Namespace',
  'Package',
  'Class',
  'Method',
  'Property',
  'Field',
  'Constructor',
  'Enum',
  'Interface',
  'Function',
  'Variable',
  'Constant',
  'String',
  'Number',
  'Boolean',
  'Array',
  'Object',
  'Key',
  'Null',
  'Enum member',
  'Struct',
  'Event',
  'Operator',
  'Type parameter',
] as const

interface LanguageRuntime {
  session: LspSession
  documents: DocumentManager
  client: LspClient
  provider: string
  capabilities: ServerCapabilities
  rootPath: string
  subscriptions: Disposable[]
  readiness: LanguageRuntimeReadiness
}

interface LanguageRuntimeReadiness {
  rootsScanning: boolean | undefined
}

interface OpenDocumentRuntime {
  languageId: string
  document: DocumentHandle
  runtime: LanguageRuntime
  activeRequests: number
  closeRequested: boolean
  closing?: Promise<void>
  lastSymbols?: OutlineSymbol[]
}

export interface LanguageSessionFactoryInput {
  languageId: string
  rootPath: string
  server: { command: string, args?: string[] }
}

export interface WorkspaceServiceOptions {
  createLanguageSession?: (input: LanguageSessionFactoryInput) => LspSession
}

export class WorkspaceService {
  readonly #createLanguageSession: (input: LanguageSessionFactoryInput) => LspSession
  #rootPath: string | null = null
  #snapshot: WorkspaceSnapshot | null = null
  #runtimeGeneration = 0
  #openTail: Promise<void> = Promise.resolve()
  readonly #languages = new Map<string, LanguageRuntime>()
  readonly #languageStarts = new Map<string, Promise<LanguageRuntime>>()
  readonly #documents = new Map<string, OpenDocumentRuntime>()
  readonly #documentOpens = new Map<string, Promise<OpenDocumentRuntime>>()
  readonly #diagnostics = new Map<string, OutlineDiagnostic[]>()
  readonly #diagnosticListeners = new Set<(update: WorkspaceDiagnosticsUpdate) => void>()
  readonly #languageStatusListeners = new Set<(update: WorkspaceLanguageStatusUpdate) => void>()

  constructor(options: WorkspaceServiceOptions = {}) {
    this.#createLanguageSession = options.createLanguageSession === undefined
      ? createLanguageSession
      : options.createLanguageSession
  }

  get current(): WorkspaceSnapshot | null {
    return this.#snapshot
  }

  assertCurrentRoot(rootPath: string): void {
    if (this.#rootPath !== resolve(rootPath))
      throw new Error('The workspace changed in the application process; reopen it before requesting file data')
  }

  open(rootPath: string): Promise<WorkspaceSnapshot> {
    const operation = this.#openTail.then(() => this.#openExclusive(rootPath))
    this.#openTail = operation.then(() => undefined, () => undefined)
    return operation
  }

  onDiagnostics(listener: (update: WorkspaceDiagnosticsUpdate) => void): () => void {
    this.#diagnosticListeners.add(listener)
    return () => this.#diagnosticListeners.delete(listener)
  }

  onLanguageStatus(listener: (update: WorkspaceLanguageStatusUpdate) => void): () => void {
    this.#languageStatusListeners.add(listener)
    return () => this.#languageStatusListeners.delete(listener)
  }

  async #openExclusive(rootPath: string): Promise<WorkspaceSnapshot> {
    const absoluteRoot = resolve(rootPath)
    let count = 0
    const entries = await this.#scanDirectory(absoluteRoot, '', () => {
      count += 1
      if (count > MAX_WORKSPACE_ENTRIES)
        throw new Error(`Workspace contains more than ${MAX_WORKSPACE_ENTRIES.toLocaleString()} entries`)
    })

    if (this.#rootPath !== absoluteRoot)
      await this.#resetLanguageRuntimes()

    this.#rootPath = absoluteRoot
    this.#snapshot = {
      rootPath: absoluteRoot,
      rootName: basename(absoluteRoot),
      entries,
    }
    return this.#snapshot
  }

  async outline(relativePath: string): Promise<OutlineSnapshot> {
    if (!this.#rootPath)
      throw new Error('Open a workspace before requesting an outline')

    const languageId = resolveLanguageId(relativePath)
    if (!languageId)
      throw new Error('No language server is configured for this file type')

    const runtime = await this.#languageRuntime(languageId, relativePath)
    if (!capabilityAvailable(runtime.capabilities.documentSymbolProvider))
      throw new Error(`${runtime.provider} does not support document symbols`)

    const openDocument = await this.#openDocument(relativePath, languageId, runtime)
    const result = await this.#useDocument(openDocument, () =>
      retryContentModified(() => runtime.client.documentSymbols(openDocument.document)),
    )
    const analysisStatus = result === null && runtime.readiness.rootsScanning === true
      ? 'loading'
      : 'ready'
    const symbols = result === null
      ? (openDocument.lastSymbols === undefined ? [] : openDocument.lastSymbols)
      : normalizeSymbols(result)
    if (result !== null)
      openDocument.lastSymbols = symbols
    const publishedDiagnostics = this.#diagnostics.get(openDocument.document.uri)
    return {
      path: relativePath,
      languageId,
      symbols,
      diagnostics: publishedDiagnostics === undefined
        ? { status: 'pending' }
        : { status: 'ready', items: publishedDiagnostics },
      provider: runtime.provider,
      capabilities: listCapabilities(runtime.capabilities),
      analysisStatus,
    }
  }

  async closeDocument(relativePath: string): Promise<void> {
    if (!this.#rootPath)
      return

    const absolutePath = resolveWorkspacePath(this.#rootPath, relativePath)
    const opening = this.#documentOpens.get(absolutePath)
    if (opening) {
      try {
        await opening
      }
      catch {
        return
      }
    }

    const openDocument = this.#documents.get(absolutePath)
    if (!openDocument)
      return
    openDocument.closeRequested = true
    await this.#closeDocumentWhenUnused(absolutePath, openDocument)
  }

  async source(relativePath: string): Promise<SourceDocumentSnapshot> {
    if (!this.#rootPath)
      throw new Error('Open a workspace before reading source')

    const absolutePath = resolveWorkspacePath(this.#rootPath, relativePath)
    const file = await stat(absolutePath)
    if (!file.isFile())
      throw new Error(`${relativePath} is not a source file`)
    if (file.size > 2_000_000)
      throw new Error(`${relativePath} is too large to preview`)

    const languageId = resolveLanguageId(relativePath)
    return {
      path: relativePath,
      languageId: languageId === undefined ? 'plaintext' : languageId,
      content: await readFile(absolutePath, 'utf8'),
    }
  }

  async inspectSymbol(relativePath: string, position: Position): Promise<SymbolInsight> {
    if (!this.#rootPath)
      throw new Error('Open a workspace before inspecting a symbol')
    const rootPath = this.#rootPath

    const languageId = resolveLanguageId(relativePath)
    if (!languageId)
      throw new Error('No language server is configured for this file type')

    const runtime = await this.#languageRuntime(languageId, relativePath)
    const openDocument = await this.#openDocument(relativePath, languageId, runtime)
    const [
      hover,
      definitions,
      declarations,
      typeDefinitions,
      implementations,
      references,
      calls,
      types,
    ] = await this.#useDocument(openDocument, () => Promise.all([
      requestWhenSupported(runtime.capabilities.hoverProvider, () => runtime.client.hover(openDocument.document, position)),
      requestWhenSupported(runtime.capabilities.definitionProvider, () => runtime.client.definition(openDocument.document, position)),
      requestWhenSupported(runtime.capabilities.declarationProvider, () => runtime.client.declaration(openDocument.document, position)),
      requestWhenSupported(runtime.capabilities.typeDefinitionProvider, () => runtime.client.typeDefinition(openDocument.document, position)),
      requestWhenSupported(runtime.capabilities.implementationProvider, () => runtime.client.implementation(openDocument.document, position)),
      requestWhenSupported(runtime.capabilities.referencesProvider, () => runtime.client.references(openDocument.document, position)),
      this.#callHierarchy(runtime, openDocument.document, position),
      this.#typeHierarchy(runtime, openDocument.document, position),
    ]))
    const hoverText = hover === null ? undefined : normalizeHover(hover)

    return {
      path: relativePath,
      position,
      ...(hoverText === undefined ? {} : { hover: hoverText }),
      definitions: normalizeLocations(definitions, rootPath),
      declarations: normalizeLocations(declarations, rootPath),
      typeDefinitions: normalizeLocations(typeDefinitions, rootPath),
      implementations: normalizeLocations(implementations, rootPath),
      references: normalizeLocations(references, rootPath),
      incomingCalls: calls.incoming.map(call => normalizeCallItem(call.from, rootPath)),
      outgoingCalls: calls.outgoing.map(call => normalizeCallItem(call.to, rootPath)),
      supertypes: types.supertypes.map(item => normalizeTypeItem(item, rootPath)),
      subtypes: types.subtypes.map(item => normalizeTypeItem(item, rootPath)),
    }
  }

  async dispose(): Promise<void> {
    await this.#openTail
    await this.#resetLanguageRuntimes()
    this.#diagnosticListeners.clear()
    this.#languageStatusListeners.clear()
  }

  async #scanDirectory(
    absoluteDirectory: string,
    relativeDirectory: string,
    registerEntry: () => void,
  ): Promise<WorkspaceEntry[]> {
    const directoryEntries = await readdir(absoluteDirectory, { withFileTypes: true })
    directoryEntries.sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory())
        return left.isDirectory() ? -1 : 1
      return left.name.localeCompare(right.name)
    })

    const entries: WorkspaceEntry[] = []
    for (const entry of directoryEntries) {
      if (entry.name.startsWith('.') && entry.name !== '.github')
        continue
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name))
        continue
      if (!entry.isDirectory() && !entry.isFile())
        continue

      registerEntry()
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        entries.push({
          name: entry.name,
          path: relativePath,
          kind: 'directory',
          children: await this.#scanDirectory(
            resolve(absoluteDirectory, entry.name),
            relativePath,
            registerEntry,
          ),
        })
      }
      else {
        const languageId = resolveLanguageId(entry.name)
        entries.push({
          name: entry.name,
          path: relativePath,
          kind: 'file',
          ...(languageId ? { languageId } : {}),
        })
      }
    }
    return entries
  }

  async #languageRuntime(languageId: string, relativePath: string): Promise<LanguageRuntime> {
    const projectRoot = await this.#projectRoot(languageId, relativePath)
    const runtimeKey = `${languageId}:${projectRoot}`
    const existing = this.#languages.get(runtimeKey)
    if (existing)
      return existing

    const starting = this.#languageStarts.get(runtimeKey)
    if (starting)
      return starting

    const generation = this.#runtimeGeneration
    const promise = this.#startLanguageRuntime(languageId, projectRoot)
    this.#languageStarts.set(runtimeKey, promise)
    try {
      const runtime = await promise
      if (generation !== this.#runtimeGeneration) {
        disposeLanguageRuntime(runtime)
        await runtime.session.shutdown()
        throw new Error(`Language runtime for ${projectRoot} was superseded by a workspace change`)
      }
      this.#languages.set(runtimeKey, runtime)
      return runtime
    }
    finally {
      if (this.#languageStarts.get(runtimeKey) === promise)
        this.#languageStarts.delete(runtimeKey)
    }
  }

  async #projectRoot(languageId: string, relativePath: string): Promise<string> {
    if (!this.#rootPath)
      throw new Error('Workspace root is not available')

    if (languageId === 'rust')
      return this.#rustProjectRoot(relativePath)

    const markers = projectMarkers(languageId)
    if (!markers.length)
      return this.#rootPath

    let directory = dirname(resolveWorkspacePath(this.#rootPath, relativePath))
    while (true) {
      for (const marker of markers) {
        if (await pathExists(resolve(directory, marker)))
          return directory
      }
      if (directory === this.#rootPath)
        return this.#rootPath
      const parent = dirname(directory)
      if (parent === directory || relative(this.#rootPath, parent).startsWith('..'))
        return this.#rootPath
      directory = parent
    }
  }

  async #rustProjectRoot(relativePath: string): Promise<string> {
    if (!this.#rootPath)
      throw new Error('Workspace root is not available')

    let directory = dirname(resolveWorkspacePath(this.#rootPath, relativePath))
    let nearestPackageRoot: string | undefined
    while (true) {
      const manifestPath = resolve(directory, 'Cargo.toml')
      if (await pathExists(manifestPath)) {
        if (nearestPackageRoot === undefined)
          nearestPackageRoot = directory
        if (await isCargoWorkspaceManifest(manifestPath))
          return directory
      }
      if (directory === this.#rootPath)
        return nearestPackageRoot === undefined ? this.#rootPath : nearestPackageRoot
      const parent = dirname(directory)
      if (parent === directory || relative(this.#rootPath, parent).startsWith('..'))
        return nearestPackageRoot === undefined ? this.#rootPath : nearestPackageRoot
      directory = parent
    }
  }

  async #openDocument(
    relativePath: string,
    languageId: string,
    runtime: LanguageRuntime,
  ): Promise<OpenDocumentRuntime> {
    if (!this.#rootPath)
      throw new Error('Workspace root is not available')

    const absolutePath = resolveWorkspacePath(this.#rootPath, relativePath)
    const existing = this.#documents.get(absolutePath)
    if (existing) {
      if (existing.languageId !== languageId)
        throw new Error(`Document language changed from ${existing.languageId} to ${languageId}`)
      if (existing.closing) {
        await existing.closing
        return this.#openDocument(relativePath, languageId, runtime)
      }
      existing.closeRequested = false
      return existing
    }

    const opening = this.#documentOpens.get(absolutePath)
    if (opening)
      return opening

    const generation = this.#runtimeGeneration
    const promise = this.#openNewDocument(absolutePath, languageId, runtime, generation)
    this.#documentOpens.set(absolutePath, promise)
    try {
      return await promise
    }
    finally {
      if (this.#documentOpens.get(absolutePath) === promise)
        this.#documentOpens.delete(absolutePath)
    }
  }

  async #openNewDocument(
    absolutePath: string,
    languageId: string,
    runtime: LanguageRuntime,
    generation: number,
  ): Promise<OpenDocumentRuntime> {
    const opened = {
      languageId,
      document: await runtime.documents.open({ path: absolutePath, languageId }),
      runtime,
      activeRequests: 0,
      closeRequested: false,
    }
    if (generation !== this.#runtimeGeneration)
      throw new Error(`Document open for ${absolutePath} was superseded by a workspace change`)
    this.#documents.set(absolutePath, opened)
    return opened
  }

  async #useDocument<T>(openDocument: OpenDocumentRuntime, request: () => Promise<T>): Promise<T> {
    openDocument.activeRequests += 1
    try {
      return await request()
    }
    finally {
      openDocument.activeRequests -= 1
      const absolutePath = fileURLToPath(openDocument.document.uri)
      await this.#closeDocumentWhenUnused(absolutePath, openDocument)
    }
  }

  async #closeDocumentWhenUnused(
    absolutePath: string,
    openDocument: OpenDocumentRuntime,
  ): Promise<void> {
    if (!openDocument.closeRequested || openDocument.activeRequests !== 0)
      return
    if (openDocument.closing) {
      await openDocument.closing
      return
    }

    const closing = openDocument.runtime.documents.close(openDocument.document.uri)
    openDocument.closing = closing
    try {
      await closing
      if (this.#documents.get(absolutePath) === openDocument)
        this.#documents.delete(absolutePath)
      this.#diagnostics.delete(openDocument.document.uri)
    }
    finally {
      delete openDocument.closing
    }
  }

  async #callHierarchy(
    runtime: LanguageRuntime,
    document: DocumentHandle,
    position: Position,
  ) {
    if (!capabilityAvailable(runtime.capabilities.callHierarchyProvider))
      return { incoming: [], outgoing: [] }

    const prepared = await retryContentModified(() => runtime.client.prepareCallHierarchy(document, position))
    const item = prepared === null ? undefined : prepared[0]
    if (!item)
      return { incoming: [], outgoing: [] }
    const [incoming, outgoing] = await Promise.all([
      retryContentModified(() => runtime.client.incomingCalls(item)),
      retryContentModified(() => runtime.client.outgoingCalls(item)),
    ])
    return {
      incoming: incoming === null ? [] : incoming,
      outgoing: outgoing === null ? [] : outgoing,
    }
  }

  async #typeHierarchy(
    runtime: LanguageRuntime,
    document: DocumentHandle,
    position: Position,
  ) {
    if (!capabilityAvailable(runtime.capabilities.typeHierarchyProvider))
      return { supertypes: [], subtypes: [] }

    const prepared = await retryContentModified(() => runtime.client.prepareTypeHierarchy(document, position))
    const item = prepared === null ? undefined : prepared[0]
    if (!item)
      return { supertypes: [], subtypes: [] }
    const [supertypes, subtypes] = await Promise.all([
      retryContentModified(() => runtime.client.supertypes(item)),
      retryContentModified(() => runtime.client.subtypes(item)),
    ])
    return {
      supertypes: supertypes === null ? [] : supertypes,
      subtypes: subtypes === null ? [] : subtypes,
    }
  }

  async #startLanguageRuntime(languageId: string, rootPath: string): Promise<LanguageRuntime> {
    const server = languageServerCommand(languageId)
    if (!server)
      throw new Error(`No language server adapter is configured for ${languageId}`)

    const session = this.#createLanguageSession({ languageId, rootPath, server })

    const capabilities = await session.start()
    const readiness: LanguageRuntimeReadiness = {
      rootsScanning: undefined,
    }
    const diagnosticsSubscription = session.onNotification(
      'textDocument/publishDiagnostics',
      (params: PublishDiagnosticsParams) => {
        const diagnostics = normalizeDiagnostics(params.diagnostics)
        this.#diagnostics.set(params.uri, diagnostics)
        this.#publishDiagnostics(params.uri, diagnostics)
      },
    )
    const progressSubscription = session.onNotification(
      '$/progress',
      (params: unknown) => {
        const status = updateLanguageRuntimeProgress(readiness, params)
        if (status === null || !this.#rootPath)
          return
        const update: WorkspaceLanguageStatusUpdate = {
          workspaceRoot: this.#rootPath,
          projectRoot: rootPath,
          languageId,
          status,
        }
        for (const listener of this.#languageStatusListeners)
          listener(update)
      },
    )
    return {
      session,
      capabilities,
      documents: new DocumentManager(session),
      client: new LspClient(session),
      provider: server.command,
      rootPath,
      subscriptions: [diagnosticsSubscription, progressSubscription],
      readiness,
    }
  }

  async #resetLanguageRuntimes(): Promise<void> {
    this.#runtimeGeneration += 1
    this.#documents.clear()
    this.#documentOpens.clear()
    this.#diagnostics.clear()
    const starting = [...this.#languageStarts.values()]
    const runtimes = new Set(this.#languages.values())
    this.#languages.clear()
    this.#languageStarts.clear()
    for (const runtime of runtimes)
      disposeLanguageRuntime(runtime)
    await Promise.allSettled([...runtimes].map(runtime => runtime.session.shutdown()))

    const started = await Promise.allSettled(starting)
    const superseded = started
      .filter((result): result is PromiseFulfilledResult<LanguageRuntime> => result.status === 'fulfilled')
      .map(result => result.value)
    for (const runtime of superseded)
      disposeLanguageRuntime(runtime)
    await Promise.allSettled(superseded.map(runtime => runtime.session.shutdown()))
  }

  #publishDiagnostics(uri: string, diagnostics: OutlineDiagnostic[]): void {
    if (!this.#rootPath || !uri.startsWith('file:'))
      return

    const absolutePath = fileURLToPath(uri)
    const relativePath = relative(this.#rootPath, absolutePath)
    if (isOutsideWorkspace(relativePath))
      return

    const update = { path: normalizeWorkspacePath(relativePath), diagnostics }
    for (const listener of this.#diagnosticListeners)
      listener(update)
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return false
    throw error
  }
}

async function isCargoWorkspaceManifest(path: string): Promise<boolean> {
  const manifest = await readFile(path, 'utf8')
  return /^\s*\[workspace\]\s*(?:#.*)?$/m.test(manifest)
}

function updateLanguageRuntimeProgress(
  readiness: LanguageRuntimeReadiness,
  params: unknown,
): 'loading' | 'ready' | null {
  if (!params || typeof params !== 'object' || !('token' in params) || !('value' in params))
    return null
  if (typeof params.token !== 'string' || !params.token.includes('Roots Scanned'))
    return null
  const value = params.value
  if (!value || typeof value !== 'object' || !('kind' in value))
    return null
  if (value.kind !== 'begin' && value.kind !== 'end')
    return null

  readiness.rootsScanning = value.kind === 'begin'
  return value.kind === 'begin' ? 'loading' : 'ready'
}

function disposeLanguageRuntime(runtime: LanguageRuntime): void {
  for (const subscription of runtime.subscriptions)
    subscription.dispose()
}

function projectMarkers(languageId: string): string[] {
  switch (languageId) {
    case 'rust':
      return ['Cargo.toml']
    case 'typescript':
    case 'typescriptreact':
    case 'javascript':
    case 'javascriptreact':
    case 'vue':
      return ['tsconfig.json', 'jsconfig.json', 'package.json']
    case 'go':
      return ['go.work', 'go.mod']
    case 'python':
      return ['pyproject.toml', 'pyrightconfig.json', 'setup.py']
    default:
      return []
  }
}

function resolveWorkspacePath(rootPath: string, relativePath: string): string {
  const absolutePath = resolve(rootPath, relativePath)
  const relation = relative(rootPath, absolutePath)
  if (isOutsideWorkspace(relation))
    throw new Error('Requested path is outside the workspace')
  return absolutePath
}

function isOutsideWorkspace(path: string): boolean {
  return path === '..' || path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
}

function normalizeWorkspacePath(path: string): string {
  return process.platform === 'win32' ? path.replaceAll('\\', '/') : path
}

async function requestWhenSupported<T>(
  capability: unknown,
  request: () => Promise<T>,
): Promise<T | null> {
  if (!capabilityAvailable(capability))
    return null
  return retryContentModified(request)
}

function capabilityAvailable(capability: unknown): boolean {
  return capability !== undefined && capability !== null && capability !== false
}

async function retryContentModified<T>(request: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await request()
    }
    catch (error) {
      const contentChanged = error instanceof ResponseError && error.code === -32801
      if (!contentChanged || attempt === 4)
        throw error
      await new Promise(resolveDelay => setTimeout(resolveDelay, attempt * 75))
    }
  }
  throw new Error('Content-modified retry loop ended unexpectedly')
}

function normalizeHover(hover: Hover): string | undefined {
  const contents = hover.contents
  const values = Array.isArray(contents) ? contents : [contents]
  const text = values.map((value) => {
    if (typeof value === 'string')
      return value
    if ('language' in value)
      return `\`\`\`${value.language}\n${value.value}\n\`\`\``
    return value.value
  }).filter(Boolean).join('\n\n').trim()
  return text.length === 0 ? undefined : text
}

function normalizeLocations(
  locations: Location | Location[] | LocationLink[] | null,
  rootPath: string,
): SourceReference[] {
  if (!locations)
    return []
  const items = Array.isArray(locations) ? locations : [locations]
  return items.map((location) => {
    const uri = 'targetUri' in location ? location.targetUri : location.uri
    const range = 'targetSelectionRange' in location ? location.targetSelectionRange : location.range
    let path = uri
    let external = true
    if (uri.startsWith('file:')) {
      const absolutePath = fileURLToPath(uri)
      const workspaceRelativePath = relative(rootPath, absolutePath)
      external = isOutsideWorkspace(workspaceRelativePath)
      path = external ? absolutePath : normalizeWorkspacePath(workspaceRelativePath)
    }
    return { path, range, external }
  })
}

function normalizeCallItem(item: CallHierarchyItem, rootPath: string): SourceReference {
  const [reference] = normalizeLocations({ uri: item.uri, range: item.selectionRange }, rootPath)
  if (!reference)
    throw new Error('Call hierarchy item did not contain a source location')
  return { ...reference, label: item.name }
}

function normalizeTypeItem(item: TypeHierarchyItem, rootPath: string): SourceReference {
  const [reference] = normalizeLocations({ uri: item.uri, range: item.selectionRange }, rootPath)
  if (!reference)
    throw new Error('Type hierarchy item did not contain a source location')
  return { ...reference, label: item.name }
}

function resolveLanguageId(path: string): string | undefined {
  return LANGUAGE_BY_EXTENSION[extname(path).toLowerCase()]
}

function languageServerCommand(languageId: string): { command: string, args?: string[] } | undefined {
  switch (languageId) {
    case 'rust':
      return { command: 'rust-analyzer' }
    case 'typescript':
    case 'typescriptreact':
    case 'javascript':
    case 'javascriptreact':
      return { command: 'typescript-language-server', args: ['--stdio'] }
    case 'vue':
      return { command: 'vue-language-server', args: ['--stdio'] }
    case 'python':
      return { command: 'basedpyright-langserver', args: ['--stdio'] }
    case 'go':
      return { command: 'gopls' }
    default:
      return undefined
  }
}

function createLanguageSession(input: LanguageSessionFactoryInput): LspSession {
  if (input.languageId === 'rust')
    return new RustAnalyzerAdapter().createSession(input.rootPath)
  return new LspSession({
    workspaceRoot: input.rootPath,
    server: input.server,
    clientName: 'bev',
  })
}

function normalizeSymbols(
  symbols: DocumentSymbol[] | SymbolInformation[],
): OutlineSymbol[] {
  return symbols.map((symbol, index) => {
    const isFlat = 'location' in symbol
    const range = isFlat ? symbol.location.range : symbol.range
    const selectionRange = isFlat ? symbol.location.range : symbol.selectionRange
    const children = isFlat || symbol.children === undefined
      ? []
      : normalizeSymbols(symbol.children)
    const kindLabel = SYMBOL_KIND_LABELS[symbol.kind]
    return {
      id: `${selectionRange.start.line}:${selectionRange.start.character}:${symbol.kind}:${index}:${symbol.name}`,
      name: symbol.name,
      ...(!isFlat && symbol.detail ? { detail: symbol.detail } : {}),
      kind: symbol.kind,
      kindLabel: kindLabel === undefined ? 'Symbol' : kindLabel,
      range,
      selectionRange,
      children,
    }
  })
}

function normalizeDiagnostics(diagnostics: Diagnostic[]): OutlineDiagnostic[] {
  return diagnostics.map((diagnostic, index) => {
    const message = typeof diagnostic.message === 'string'
      ? diagnostic.message
      : diagnostic.message.value
    return {
      id: `${diagnostic.range.start.line}:${diagnostic.range.start.character}:${index}:${message}`,
      message,
      range: diagnostic.range,
      ...(diagnostic.severity ? { severity: diagnostic.severity } : {}),
      ...(diagnostic.source ? { source: diagnostic.source } : {}),
      ...(diagnostic.code !== undefined ? { code: String(diagnostic.code) } : {}),
    }
  })
}

function listCapabilities(capabilities: ServerCapabilities): string[] {
  return Object.entries(capabilities)
    .filter(([, value]) => value !== undefined && value !== false && value !== null)
    .map(([name]) => name)
    .sort()
}
