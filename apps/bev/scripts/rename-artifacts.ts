import { existsSync } from 'node:fs'
import { mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'

import { cac } from 'cac'

import packageJson from '../package.json' with { type: 'json' }

const cli = cac('bev-rename-artifacts')
cli.option('--release', 'Kept for release workflow compatibility')
const args = cli.parse()
const target = args.args[0]
const specs: Record<string, { from: string, to: string }[]> = {
  'x86_64-pc-windows-msvc': [{ from: `Bev-${packageJson.version}-windows-x64-setup.exe`, to: `Bev-${packageJson.version}-windows-x64-setup.exe` }, { from: 'latest-x64.yml', to: 'latest-x64.yml' }],
  'x86_64-apple-darwin': [{ from: `Bev-${packageJson.version}-darwin-x64.dmg`, to: `Bev-${packageJson.version}-darwin-x64.dmg` }, { from: 'latest-x64-mac.yml', to: 'latest-x64-mac.yml' }],
  'aarch64-apple-darwin': [{ from: `Bev-${packageJson.version}-darwin-arm64.dmg`, to: `Bev-${packageJson.version}-darwin-arm64.dmg` }, { from: 'latest-arm64-mac.yml', to: 'latest-arm64-mac.yml' }],
  'x86_64-unknown-linux-gnu': ['deb', 'rpm'].map(extension => ({ from: `Bev-${packageJson.version}-linux-${extension === 'deb' ? 'amd64' : 'x86_64'}.${extension}`, to: `Bev-${packageJson.version}-linux-x64.${extension}` })),
  'aarch64-unknown-linux-gnu': ['deb', 'rpm'].map(extension => ({ from: `Bev-${packageJson.version}-linux-${extension === 'deb' ? 'arm64' : 'aarch64'}.${extension}`, to: `Bev-${packageJson.version}-linux-arm64.${extension}` })),
}

if (!target || !specs[target]) throw new Error(`Unsupported target: ${target ?? '(missing)'}`)
const dist = join(import.meta.dirname, '..', 'dist')
const bundle = join(import.meta.dirname, '..', 'bundle')
await mkdir(bundle, { recursive: true })
for (const spec of specs[target]) {
  const from = join(dist, spec.from)
  if (existsSync(from)) await rename(from, join(bundle, spec.to))
}
