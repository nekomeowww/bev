import process from 'node:process'

import { cac } from 'cac'

import packageJson from '../package.json' with { type: 'json' }

const productName = 'Bev'
const archByTarget: Record<string, string> = {
  'x86_64-pc-windows-msvc': 'x64',
  'x86_64-apple-darwin': 'x64',
  'aarch64-apple-darwin': 'arm64',
  'x86_64-unknown-linux-gnu': 'x64',
  'aarch64-unknown-linux-gnu': 'arm64',
}

const extensionByTarget: Record<string, string[]> = {
  'x86_64-pc-windows-msvc': ['exe'],
  'x86_64-apple-darwin': ['dmg'],
  'aarch64-apple-darwin': ['dmg'],
  'x86_64-unknown-linux-gnu': ['deb', 'rpm', 'flatpak'],
  'aarch64-unknown-linux-gnu': ['deb', 'rpm', 'flatpak'],
}

function artifactName(target: string, extension: string, version = packageJson.version) {
  const arch = archByTarget[target]
  if (!arch)
    throw new Error(`Unsupported target: ${target}`)
  if (extension === 'exe') return `${productName}-${version}-windows-${arch}-setup.exe`
  if (extension === 'dmg') return `${productName}-${version}-darwin-${arch}.dmg`
  return `${productName}-${version}-linux-${arch}.${extension}`
}

const cli = cac('bev-artifacts-metadata')
  .option('--get-filename <extension>', 'Release artifact filename')
  .option('--get-output-filename <extension>', 'Build output filename')
  .option('--get-bundle-name', 'First artifact filename')
  .option('--get-product-name', 'Product name')
  .option('--get-version', 'Package version')

const args = cli.parse()
const target = args.args[0]
const extension = String(args.options.getFilename ?? args.options.getOutputFilename ?? '')

if (args.options.getProductName) console.info(productName)
else if (args.options.getVersion) console.info(packageJson.version)
else if (args.options.getBundleName) console.info(artifactName(target, extensionByTarget[target]?.[0] ?? 'exe'))
else if (extension) console.info(artifactName(target, extension))
else process.exitCode = 1
