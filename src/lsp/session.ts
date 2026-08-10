import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import type {
  ApplyWorkspaceEditResult,
  ClientCapabilities,
  ConfigurationParams,
  InitializeParams,
  InitializeResult,
  ServerCapabilities,
  WorkspaceFolder,
} from 'vscode-languageserver-protocol'
import type {
  Disposable,
  GenericNotificationHandler,
  MessageConnection,
  NotificationType,
  RequestParam,
  RequestType,
} from 'vscode-jsonrpc'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  createMessageConnection,
  ErrorCodes,
  ResponseError,
} from 'vscode-jsonrpc/node'

export interface LspServerCommand {
  command: string
  args?: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
}

export interface LspSessionOptions {
  workspaceRoot: string
  server: LspServerCommand
  settings?: Record<string, unknown>
  initializationOptions?: unknown
  clientName?: string
  clientVersion?: string
  onStderr?: (chunk: string) => void
}

type SessionState = 'created' | 'starting' | 'running' | 'stopping' | 'stopped'

const CLIENT_CAPABILITIES: ClientCapabilities = {
  experimental: {
    serverStatusNotification: true,
  },
  general: {
    positionEncodings: ['utf-16'],
  },
  workspace: {
    applyEdit: false,
    configuration: true,
    workspaceFolders: true,
  },
  textDocument: {
    callHierarchy: {},
    definition: {
      linkSupport: true,
    },
    declaration: {
      linkSupport: true,
    },
    documentSymbol: {
      hierarchicalDocumentSymbolSupport: true,
    },
    hover: {
      contentFormat: ['markdown', 'plaintext'],
    },
    implementation: {
      linkSupport: true,
    },
    publishDiagnostics: {
      relatedInformation: true,
      tagSupport: { valueSet: [1, 2] },
      versionSupport: true,
    },
    references: {},
    typeHierarchy: {},
    typeDefinition: {
      linkSupport: true,
    },
  },
  window: {
    workDoneProgress: true,
  },
}

/**
 * Owns one language-server process and its stateful LSP conversation.
 */
export class LspSession {
  readonly #options: LspSessionOptions
  readonly #workspaceRoot: string
  readonly #workspaceFolder: WorkspaceFolder
  #state: SessionState = 'created'
  #process?: ChildProcessWithoutNullStreams
  #connection?: MessageConnection
  #capabilities?: ServerCapabilities
  #exitPromise?: Promise<void>
  #resolveExit?: () => void

  constructor(options: LspSessionOptions) {
    this.#options = options
    this.#workspaceRoot = resolve(options.workspaceRoot)
    this.#workspaceFolder = {
      uri: pathToFileURL(this.#workspaceRoot).href,
      name: basename(this.#workspaceRoot),
    }
  }

  get state(): SessionState {
    return this.#state
  }

  get workspaceRoot(): string {
    return this.#workspaceRoot
  }

  get capabilities(): ServerCapabilities | undefined {
    return this.#capabilities
  }

  async start(): Promise<ServerCapabilities> {
    if (this.#state !== 'created')
      throw new Error(`Cannot start an LSP session in state ${this.#state}`)

    this.#state = 'starting'
    const server = this.#options.server
    const args = server.args === undefined ? [] : server.args
    const cwd = server.cwd === undefined ? this.#workspaceRoot : server.cwd
    const child = spawn(server.command, args, {
      cwd,
      env: { ...process.env, ...server.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.#process = child
    this.#exitPromise = new Promise(resolveExit => {
      this.#resolveExit = resolveExit
    })

    child.once('error', this.#handleServerError)
    child.once('exit', this.#handleServerExit)
    child.stderr.on('data', this.#handleServerStderr)

    try {
      await once(child, 'spawn')
    }
    catch (error) {
      this.#state = 'stopped'
      throw error
    }

    const connection = createMessageConnection(child.stdout, child.stdin)
    this.#connection = connection
    connection.onRequest(this.#handleServerRequest)
    connection.onError(this.#handleConnectionError)
    connection.listen()

    try {
      const params: InitializeParams = {
        processId: process.pid,
        clientInfo: {
          name: this.#options.clientName === undefined ? 'cint' : this.#options.clientName,
          version: this.#options.clientVersion === undefined ? '0.0.0' : this.#options.clientVersion,
        },
        rootUri: this.#workspaceFolder.uri,
        workspaceFolders: [this.#workspaceFolder],
        capabilities: CLIENT_CAPABILITIES,
        initializationOptions: this.#options.initializationOptions,
      }
      const result = await connection.sendRequest<InitializeResult>('initialize', params)
      this.#capabilities = result.capabilities

      await connection.sendNotification('initialized', {})
      await connection.sendNotification('workspace/didChangeConfiguration', {
        settings: this.#options.settings === undefined ? {} : this.#options.settings,
      })
      this.#state = 'running'

      return result.capabilities
    }
    catch (error) {
      child.kill()
      await this.#exitPromise
      connection.dispose()
      this.#state = 'stopped'
      throw error
    }
  }

  request<Params, Result, ErrorData>(
    type: RequestType<Params, Result, ErrorData>,
    params: RequestParam<Params>,
  ): Promise<Result> {
    return this.#runningConnection().sendRequest(type, params)
  }

  requestRaw<Result>(method: string, params?: unknown): Promise<Result> {
    return this.#runningConnection().sendRequest<Result>(method, params)
  }

  notify<Params>(type: NotificationType<Params>, params: RequestParam<Params>): Promise<void> {
    return this.#runningConnection().sendNotification(type, params)
  }

  notifyRaw(method: string, params?: unknown): Promise<void> {
    return this.#runningConnection().sendNotification(method, params)
  }

  onNotification(method: string, handler: GenericNotificationHandler): Disposable {
    if (!this.#connection)
      throw new Error('Cannot subscribe before the LSP session starts')

    return this.#connection.onNotification(method, handler)
  }

  async shutdown(): Promise<void> {
    if (this.#state === 'created' || this.#state === 'stopped') {
      this.#state = 'stopped'
      return
    }

    if (this.#state === 'stopping') {
      await this.#exitPromise
      return
    }

    this.#state = 'stopping'
    const connection = this.#connection
    const child = this.#process

    if (connection) {
      try {
        await connection.sendRequest('shutdown')
        await connection.sendNotification('exit')
      }
      catch {
        child?.kill()
      }
    }

    const timeout = setTimeout(() => child?.kill(), 2_000)
    await this.#exitPromise
    clearTimeout(timeout)
    connection?.dispose()
    this.#state = 'stopped'
  }

  #runningConnection(): MessageConnection {
    if (this.#state !== 'running' || !this.#connection)
      throw new Error(`LSP session is not running (state: ${this.#state})`)

    return this.#connection
  }

  /**
   * Answers requests initiated by the language server.
   *
   * Triggering workflow:
   *
   * {@link createMessageConnection}
   *   -> {@link MessageConnection.onRequest}
   *     -> `server-to-client request`
   *       -> {@link LspSession.#handleServerRequest}
   *
   * Upstream:
   * - {@link MessageConnection.onRequest}
   *
   * Downstream:
   * - {@link LspSession.#resolveConfiguration}
   */
  readonly #handleServerRequest = async (method: string, params: unknown): Promise<unknown> => {
    switch (method) {
      case 'workspace/configuration': {
        const configuration = params as ConfigurationParams
        return configuration.items.map(item => this.#resolveConfiguration(item.section))
      }
      case 'workspace/workspaceFolders':
        return [this.#workspaceFolder]
      case 'workspace/applyEdit': {
        const result: ApplyWorkspaceEditResult = {
          applied: false,
          failureReason: 'cint is read-only in the first prototype',
        }
        return result
      }
      case 'window/workDoneProgress/create':
      case 'client/registerCapability':
      case 'client/unregisterCapability':
      case 'workspace/codeLens/refresh':
      case 'workspace/diagnostic/refresh':
      case 'workspace/inlayHint/refresh':
      case 'workspace/semanticTokens/refresh':
        return null
      case 'window/showMessageRequest':
        return null
      default:
        throw new ResponseError(
          ErrorCodes.MethodNotFound,
          `cint does not implement server request ${method}`,
        )
    }
  }

  #resolveConfiguration(section: string | undefined): unknown {
    if (!section)
      return this.#options.settings === undefined ? {} : this.#options.settings

    const settings = this.#options.settings === undefined ? {} : this.#options.settings
    if (Object.hasOwn(settings, section))
      return settings[section]

    return section.split('.').reduce<unknown>((value, key) => {
      if (typeof value !== 'object' || value === null)
        return undefined
      return (value as Record<string, unknown>)[key]
    }, settings)
  }

  /**
   * Captures language-server process failures.
   *
   * Triggering workflow:
   *
   * {@link spawn}
   *   -> {@link ChildProcessWithoutNullStreams.once}
   *     -> `error`
   *       -> {@link LspSession.#handleServerError}
   *
   * Upstream:
   * - {@link ChildProcessWithoutNullStreams.once}
   *
   * Downstream:
   * - {@link LspSession.#resolveExit}
   */
  readonly #handleServerError = (): void => {
    this.#state = 'stopped'
    this.#resolveExit?.()
  }

  /**
   * Finalizes session state when the language-server process exits.
   *
   * Triggering workflow:
   *
   * {@link spawn}
   *   -> {@link ChildProcessWithoutNullStreams.once}
   *     -> `exit`
   *       -> {@link LspSession.#handleServerExit}
   *
   * Upstream:
   * - {@link ChildProcessWithoutNullStreams.once}
   *
   * Downstream:
   * - {@link LspSession.#resolveExit}
   */
  readonly #handleServerExit = (): void => {
    if (this.#state !== 'stopping') {
      this.#connection?.dispose()
      this.#state = 'stopped'
    }
    this.#resolveExit?.()
  }

  /**
   * Forwards language-server stderr without contaminating the protocol stream.
   *
   * Triggering workflow:
   *
   * {@link spawn}
   *   -> {@link NodeJS.ReadableStream.on}
   *     -> `data`
   *       -> {@link LspSession.#handleServerStderr}
   *
   * Upstream:
   * - {@link NodeJS.ReadableStream.on}
   *
   * Downstream:
   * - {@link LspSessionOptions.onStderr}
   */
  readonly #handleServerStderr = (chunk: Buffer): void => {
    this.#options.onStderr?.(chunk.toString('utf8'))
  }

  /**
   * Surfaces malformed or failed JSON-RPC exchanges through the stderr hook.
   *
   * Triggering workflow:
   *
   * {@link createMessageConnection}
   *   -> {@link MessageConnection.onError}
   *     -> `connection error`
   *       -> {@link LspSession.#handleConnectionError}
   *
   * Upstream:
   * - {@link MessageConnection.onError}
   *
   * Downstream:
   * - {@link LspSessionOptions.onStderr}
   */
  readonly #handleConnectionError = ([error]: [Error, unknown, number | undefined]): void => {
    this.#options.onStderr?.(`[lsp-jsonrpc] ${error.message}\n`)
  }
}
