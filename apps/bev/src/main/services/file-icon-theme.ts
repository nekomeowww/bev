import type {
  FileIconAssociations,
  FileIconImageDefinition,
  FileIconThemeDocument,
  InstalledFileIconExtension,
  InstalledFileIconTheme,
  OpenVsxFileIconThemeItem,
} from '../../shared/file-icons.js'

import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'

import extract from 'extract-zip'
import { parse, type ParseError } from 'jsonc-parser'

const registryBaseUrl = 'https://open-vsx.org'
const maximumExtractedBytes = 100 * 1024 * 1024
const maximumArchiveEntries = 20_000
export const fileIconResourceScheme = 'bev-file-icon'

interface OpenVsxMetadata {
  namespace: string
  name: string
  version: string
  files: {
    download?: string
    sha256?: string
  }
}

interface OpenVsxSearchResult {
  extensions?: OpenVsxSearchExtension[]
}

interface OpenVsxSearchExtension {
  namespace?: string
  name?: string
  version?: string
  displayName?: string
  description?: string
  files?: {
    icon?: string
  }
}

interface ExtensionManifest {
  contributes?: {
    iconThemes?: Array<{
      id?: string
      label?: string
      path?: string
    }>
  }
}

interface RawIconDefinition {
  iconPath?: string
}

interface RawFileIconTheme extends FileIconAssociations {
  iconDefinitions?: Record<string, RawIconDefinition>
  light?: FileIconAssociations
  highContrast?: FileIconAssociations
  hidesExplorerArrows?: boolean
  usesCurrentColor?: boolean
}

interface ActiveThemeRecord {
  namespace: string
  name: string
  version: string
  themeId: string
}

export interface FileIconThemeServiceOptions {
  cacheRoot: string
  fetch?: typeof globalThis.fetch
}

export class FileIconThemeService {
  readonly #cacheRoot: string
  readonly #fetch: typeof globalThis.fetch
  readonly #resources = new Map<string, string>()
  #current: InstalledFileIconTheme | null | undefined
  #catalog: Promise<OpenVsxFileIconThemeItem[]> | undefined

  constructor(options: FileIconThemeServiceOptions) {
    this.#cacheRoot = resolve(options.cacheRoot)
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async current(): Promise<InstalledFileIconTheme | null> {
    if (this.#current !== undefined)
      return this.#current

    try {
      const record = await readJsonFile<ActiveThemeRecord>(this.#activeRecordPath())
      this.#current = await this.#loadInstalledTheme(record)
    }
    catch (cause) {
      if (!isMissingFileError(cause))
        throw cause
      this.#current = null
    }
    return this.#current
  }

  async installExtension(extensionId: string, version: string): Promise<InstalledFileIconExtension> {
    const coordinate = parseExtensionCoordinate(extensionId)
    safeSegment(version)
    const metadata = await this.#fetchJson<OpenVsxMetadata>(
      `${registryBaseUrl}/api/${encodeURIComponent(coordinate.namespace)}/${encodeURIComponent(coordinate.name)}/${encodeURIComponent(version)}`,
    )
    if (
      metadata.namespace !== coordinate.namespace
      || metadata.name !== coordinate.name
      || metadata.version !== version
    ) {
      throw new Error(`Open VSX returned metadata for a different extension than ${extensionId}@${version}`)
    }
    if (!metadata.files.download)
      throw new Error(`${extensionId} does not provide a downloadable VSIX`)

    await this.#ensureDownloaded(metadata)
    this.#updateCatalogInstallation(extensionId, version, true)
    return { extensionId, version }
  }

  async selectTheme(extensionId: string, version: string, themeId: string): Promise<InstalledFileIconTheme> {
    const coordinate = parseExtensionCoordinate(extensionId)
    const extensionRoot = this.#extensionRoot(coordinate.namespace, coordinate.name, version)
    if (!await fileExists(join(extensionRoot, 'package.json')))
      throw new Error(`Install ${extensionId}@${version} before selecting its theme`)

    const installed = await this.#loadThemeFromExtension({
      namespace: coordinate.namespace,
      name: coordinate.name,
      version,
      themeId,
      extensionRoot,
    })
    const record: ActiveThemeRecord = {
      namespace: coordinate.namespace,
      name: coordinate.name,
      version,
      themeId: installed.themeId,
    }
    await mkdir(this.#cacheRoot, { recursive: true })
    await writeFile(this.#activeRecordPath(), JSON.stringify(record, null, 2), 'utf8')
    this.#current = installed
    return installed
  }

  async uninstallExtension(extensionId: string, version: string): Promise<void> {
    const coordinate = parseExtensionCoordinate(extensionId)
    const current = await this.current()
    if (current?.extensionId === extensionId && current.version === version)
      await this.clear()
    await rm(dirname(this.#extensionRoot(coordinate.namespace, coordinate.name, version)), {
      recursive: true,
      force: true,
    })
    this.#updateCatalogInstallation(extensionId, version, false)
  }

  search(): Promise<OpenVsxFileIconThemeItem[]> {
    if (!this.#catalog)
      this.#catalog = this.#search().catch((cause) => {
        this.#catalog = undefined
        throw cause
      })
    return this.#catalog
  }

  async clear(): Promise<void> {
    this.#current = null
    this.#resources.clear()
    await rm(this.#activeRecordPath(), { force: true })
  }

  resourcePath(resourceUrl: string): string | undefined {
    try {
      const parsed = new URL(resourceUrl)
      if (parsed.protocol !== `${fileIconResourceScheme}:` || parsed.hostname !== 'asset')
        return undefined
      const resourceId = parsed.pathname.slice(1)
      return resourceId && !resourceId.includes('/')
        ? this.#resources.get(resourceId)
        : undefined
    }
    catch {
      return undefined
    }
  }

  async #search(): Promise<OpenVsxFileIconThemeItem[]> {
    const query = new URLSearchParams({
      category: 'Themes',
      sortBy: 'downloadCount',
      sortOrder: 'desc',
      size: '30',
    })
    const result = await this.#fetchJson<OpenVsxSearchResult>(
      `${registryBaseUrl}/api/-/search?${query.toString()}`,
    )
    const candidates = (result.extensions ?? []).filter(isCompleteSearchExtension)
    const manifests = await Promise.allSettled(candidates.map(async (candidate) => {
      const manifestUrl = [
        registryBaseUrl,
        'vscode/unpkg',
        encodeURIComponent(candidate.namespace),
        encodeURIComponent(candidate.name),
        encodeURIComponent(candidate.version),
        'extension/package.json',
      ].join('/')
      const manifest = await this.#fetchJson<ExtensionManifest>(manifestUrl)
      return { candidate, manifest }
    }))

    const items = manifests.flatMap((result) => {
      if (result.status === 'rejected')
        return []
      const { candidate, manifest } = result.value
      return (manifest.contributes?.iconThemes ?? []).flatMap((theme) => {
        if (!theme.id || !theme.path)
          return []
        const iconUrl = trustedRegistryAssetUrl(candidate.files?.icon)
        return [{
          extensionId: `${candidate.namespace}.${candidate.name}`,
          version: candidate.version,
          displayName: candidate.displayName || candidate.name,
          description: candidate.description || 'File icon theme for VS Code-compatible editors.',
          ...(iconUrl ? { iconUrl } : {}),
          installed: false,
          themeId: theme.id,
          themeLabel: theme.label || theme.id,
        } satisfies OpenVsxFileIconThemeItem]
      })
    })
    return await Promise.all(items.map(async item => ({
      ...item,
      installed: await this.#isExtensionInstalled(item.extensionId, item.version),
    })))
  }

  async #loadInstalledTheme(record: ActiveThemeRecord): Promise<InstalledFileIconTheme> {
    const extensionRoot = this.#extensionRoot(record.namespace, record.name, record.version)
    return this.#loadThemeFromExtension({ ...record, extensionRoot })
  }

  async #ensureDownloaded(metadata: OpenVsxMetadata): Promise<string> {
    const extensionRoot = this.#extensionRoot(metadata.namespace, metadata.name, metadata.version)
    if (await fileExists(join(extensionRoot, 'package.json')))
      return extensionRoot

    await mkdir(this.#cacheRoot, { recursive: true })
    const temporaryRoot = join(this.#cacheRoot, `.install-${randomUUID()}`)
    const archivePath = join(temporaryRoot, 'extension.vsix')
    const extractedPath = join(temporaryRoot, 'extracted')
    try {
      await mkdir(extractedPath, { recursive: true })
      await this.#downloadArchive(metadata.files.download!, archivePath)
      await this.#verifyChecksum(archivePath, metadata.files.sha256)
      let extractedBytes = 0
      let archiveEntries = 0
      await extract(archivePath, {
        dir: extractedPath,
        onEntry: (entry) => {
          archiveEntries += 1
          extractedBytes += entry.uncompressedSize
          const mode = (entry.externalFileAttributes >> 16) & 0xFFFF
          const fileType = mode & 0o170000
          if (fileType === 0o120000)
            throw new Error(`The VSIX contains a symbolic link: ${entry.fileName}`)
          if (
            entry.fileName.includes('\0')
            || archiveEntries > maximumArchiveEntries
            || extractedBytes > maximumExtractedBytes
          ) {
            throw new Error('The VSIX exceeds the supported extraction limits')
          }
        },
      })

      const extractedExtension = join(extractedPath, 'extension')
      if (!await fileExists(join(extractedExtension, 'package.json')))
        throw new Error('The downloaded VSIX does not contain extension/package.json')

      await mkdir(dirname(extensionRoot), { recursive: true })
      try {
        await rename(extractedExtension, extensionRoot)
      }
      catch (cause) {
        if (!await fileExists(join(extensionRoot, 'package.json')))
          throw cause
      }
      return extensionRoot
    }
    finally {
      await rm(temporaryRoot, { recursive: true, force: true })
    }
  }

  async #loadThemeFromExtension(input: Omit<ActiveThemeRecord, 'themeId'> & {
    extensionRoot: string
    themeId?: string
  }): Promise<InstalledFileIconTheme> {
    const manifest = await readJsonFile<ExtensionManifest>(join(input.extensionRoot, 'package.json'))
    const contributions = manifest.contributes?.iconThemes ?? []
    const contribution = input.themeId
      ? contributions.find(candidate => candidate.id === input.themeId)
      : contributions[0]
    if (!contribution?.id || !contribution.path)
      throw new Error(input.themeId
        ? `The extension does not contribute the file icon theme ${input.themeId}`
        : 'The extension does not contribute a file icon theme')

    const themePath = confinedPath(input.extensionRoot, input.extensionRoot, contribution.path)
    const rawTheme = parseJsonc<RawFileIconTheme>(await readFile(themePath, 'utf8'), themePath)
    if (!rawTheme.iconDefinitions)
      throw new Error('The file icon theme does not define iconDefinitions')

    const iconDefinitions: Record<string, FileIconImageDefinition> = {}
    const assetCache = new Map<string, string>()
    const resources = new Map<string, string>()
    for (const [definitionId, definition] of Object.entries(rawTheme.iconDefinitions)) {
      if (!definition.iconPath)
        continue
      const assetPath = confinedPath(input.extensionRoot, dirname(themePath), definition.iconPath)
      const extension = extname(assetPath).toLowerCase()
      const mimeType = extension === '.svg'
        ? 'image/svg+xml'
        : extension === '.png'
          ? 'image/png'
          : undefined
      if (!mimeType)
        continue

      let resourceUrl = assetCache.get(assetPath)
      if (!resourceUrl) {
        const resourceId = randomUUID()
        resourceUrl = `${fileIconResourceScheme}://asset/${resourceId}`
        resources.set(resourceId, assetPath)
        assetCache.set(assetPath, resourceUrl)
      }
      iconDefinitions[definitionId] = { url: resourceUrl }
    }

    const document: FileIconThemeDocument = {
      ...copyAssociations(rawTheme),
      iconDefinitions,
      ...(rawTheme.light ? { light: copyAssociations(rawTheme.light) } : {}),
      ...(rawTheme.highContrast ? { highContrast: copyAssociations(rawTheme.highContrast) } : {}),
      hidesExplorerArrows: rawTheme.hidesExplorerArrows === true,
      usesCurrentColor: rawTheme.usesCurrentColor === true,
    }
    this.#resources.clear()
    for (const [resourceId, assetPath] of resources)
      this.#resources.set(resourceId, assetPath)
    return {
      extensionId: `${input.namespace}.${input.name}`,
      version: input.version,
      themeId: contribution.id,
      themeLabel: contribution.label ?? contribution.id,
      document,
    }
  }

  async #fetchJson<T>(url: string): Promise<T> {
    const response = await this.#fetch(url, { headers: { Accept: 'application/json' } })
    if (!response.ok)
      throw new Error(`Open VSX returned ${response.status} for ${url}`)
    return await response.json() as T
  }

  async #downloadArchive(url: string, destination: string): Promise<void> {
    const response = await this.#fetch(url)
    if (!response.ok)
      throw new Error(`Open VSX returned ${response.status} while downloading the VSIX`)
    if (!response.body)
      throw new Error('Open VSX returned an empty VSIX response')

    const archive = await open(destination, 'w')
    try {
      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done)
          break
        await archive.write(value)
      }
    }
    finally {
      await archive.close()
    }
  }

  async #verifyChecksum(archivePath: string, checksumUrl?: string): Promise<void> {
    if (!checksumUrl)
      return
    const response = await this.#fetch(checksumUrl)
    if (!response.ok)
      throw new Error(`Open VSX returned ${response.status} while reading the checksum`)
    const expected = (await response.text()).trim().split(/\s+/)[0]?.toLowerCase()
    if (!expected || !/^[a-f\d]{64}$/.test(expected))
      throw new Error('Open VSX returned an invalid SHA-256 checksum')
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(archivePath))
      hash.update(chunk)
    const actual = hash.digest('hex')
    if (actual !== expected)
      throw new Error('The downloaded VSIX failed SHA-256 verification')
  }

  #extensionRoot(namespace: string, name: string, version: string): string {
    return join(this.#cacheRoot, `${safeSegment(namespace)}.${safeSegment(name)}`, safeSegment(version), 'extension')
  }

  async #isExtensionInstalled(extensionId: string, version: string): Promise<boolean> {
    const coordinate = parseExtensionCoordinate(extensionId)
    return await fileExists(join(
      this.#extensionRoot(coordinate.namespace, coordinate.name, version),
      'package.json',
    ))
  }

  #updateCatalogInstallation(extensionId: string, version: string, installed: boolean): void {
    if (!this.#catalog)
      return
    this.#catalog = this.#catalog.then(items => items.map(item => (
      item.extensionId === extensionId && item.version === version
        ? { ...item, installed }
        : item
    )))
  }

  #activeRecordPath(): string {
    return join(this.#cacheRoot, 'active.json')
  }
}

export function parseExtensionCoordinate(value: string): { namespace: string, name: string } {
  const normalized = value.trim()
  const separator = normalized.includes('/') ? '/' : '.'
  const parts = normalized.split(separator)
  if (parts.length !== 2 || parts.some(part => !/^[\w-]+$/.test(part)))
    throw new Error('Use an Open VSX extension ID such as PKief.material-icon-theme')
  return { namespace: parts[0]!, name: parts[1]! }
}

function isCompleteSearchExtension(candidate: OpenVsxSearchExtension): candidate is OpenVsxSearchExtension & {
  namespace: string
  name: string
  version: string
} {
  return Boolean(candidate.namespace && candidate.name && candidate.version)
}

function trustedRegistryAssetUrl(url: string | undefined): string | undefined {
  if (!url)
    return undefined
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && (
      parsed.hostname === 'open-vsx.org'
      || parsed.hostname.endsWith('.eclipsecontent.org')
    )
      ? parsed.toString()
      : undefined
  }
  catch {
    return undefined
  }
}

function copyAssociations(source: FileIconAssociations): FileIconAssociations {
  return {
    ...(source.file ? { file: source.file } : {}),
    ...(source.folder ? { folder: source.folder } : {}),
    ...(source.folderExpanded ? { folderExpanded: source.folderExpanded } : {}),
    ...(source.rootFolder ? { rootFolder: source.rootFolder } : {}),
    ...(source.rootFolderExpanded ? { rootFolderExpanded: source.rootFolderExpanded } : {}),
    ...(source.folderNames ? { folderNames: normalizeMap(source.folderNames) } : {}),
    ...(source.folderNamesExpanded ? { folderNamesExpanded: normalizeMap(source.folderNamesExpanded) } : {}),
    ...(source.rootFolderNames ? { rootFolderNames: normalizeMap(source.rootFolderNames) } : {}),
    ...(source.rootFolderNamesExpanded ? { rootFolderNamesExpanded: normalizeMap(source.rootFolderNamesExpanded) } : {}),
    ...(source.fileExtensions ? { fileExtensions: normalizeMap(source.fileExtensions) } : {}),
    ...(source.fileNames ? { fileNames: normalizeMap(source.fileNames) } : {}),
    ...(source.languageIds ? { languageIds: normalizeMap(source.languageIds) } : {}),
  }
}

function normalizeMap(source: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key.toLowerCase(), value]))
}

function confinedPath(root: string, base: string, candidate: string): string {
  if (isAbsolute(candidate) || candidate.includes('\0') || /^[a-z][a-z\d+.-]*:/i.test(candidate))
    throw new Error(`Theme asset path is not local: ${candidate}`)
  const resolved = resolve(base, candidate)
  const fromRoot = relative(root, resolved)
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot))
    throw new Error(`Theme asset escapes the extension: ${candidate}`)
  return resolved
}

function parseJsonc<T>(source: string, path: string): T {
  const errors: ParseError[] = []
  const result = parse(source, errors, { allowTrailingComma: true }) as T
  if (errors.length)
    throw new Error(`Could not parse ${path} as JSON/JSONC`)
  return result
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  }
  catch (cause) {
    if (isMissingFileError(cause))
      return false
    throw cause
  }
}

function isMissingFileError(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT'
}

function safeSegment(value: string): string {
  if (!/^[\w.-]+$/.test(value))
    throw new Error(`Unsafe Open VSX coordinate segment: ${value}`)
  return value
}
