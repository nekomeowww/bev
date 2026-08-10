import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

import { cac } from 'cac'
import { stringify } from 'yaml'

const hash = async (file: string) => await new Promise<string>((resolve, reject) => {
  const digest = createHash('sha512')
  createReadStream(file).on('data', chunk => digest.update(chunk)).on('end', () => resolve(digest.digest('base64'))).on('error', reject)
})

const cli = cac('bev-regenerate-windows-latest')
  .option('--input <path>', 'Installer file')
  .option('--output <path>', 'Output metadata file', { default: 'bundle/latest-x64.yml' })
  .option('--version <version>', 'Release version')
const args = cli.parse()
const input = String(args.options.input ?? '')
const output = String(args.options.output)
const version = String(args.options.version ?? '')
if (!input || !version) throw new Error('--input and --version are required')
const sha512 = await hash(input)
const size = (await stat(input)).size
await mkdir(dirname(output), { recursive: true })
await writeFile(output, stringify({ version, files: [{ url: basename(input), sha512, size }], path: basename(input), sha512, releaseDate: new Date().toISOString() }))
