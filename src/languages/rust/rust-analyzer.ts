import type { LspSessionOptions } from '../../lsp/session.js'
import { LspSession } from '../../lsp/session.js'

export interface RustAnalyzerAdapterOptions {
  command?: string
  args?: string[]
  checkCommand?: string
  settings?: Record<string, unknown>
  initializationOptions?: unknown
  onStderr?: LspSessionOptions['onStderr']
}

/**
 * Adapts rust-analyzer launch and configuration conventions to LspSession.
 */
export class RustAnalyzerAdapter {
  readonly #options: RustAnalyzerAdapterOptions

  constructor(options: RustAnalyzerAdapterOptions = {}) {
    this.#options = options
  }

  createSession(workspaceRoot: string): LspSession {
    const checkCommand = this.#options.checkCommand === undefined
      ? 'check'
      : this.#options.checkCommand
    const command = this.#options.command === undefined
      ? 'rust-analyzer'
      : this.#options.command
    const rustAnalyzerSettings = {
      check: {
        command: checkCommand,
      },
      ...this.#options.settings,
    }

    return new LspSession({
      workspaceRoot,
      server: {
        command,
        ...(this.#options.args ? { args: this.#options.args } : {}),
      },
      settings: {
        'rust-analyzer': rustAnalyzerSettings,
      },
      ...(this.#options.initializationOptions === undefined
        ? {}
        : { initializationOptions: this.#options.initializationOptions }),
      ...(this.#options.onStderr ? { onStderr: this.#options.onStderr } : {}),
    })
  }
}
