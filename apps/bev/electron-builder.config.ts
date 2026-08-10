/* eslint-disable no-template-curly-in-string */
import type { Configuration } from 'electron-builder'

export default {
  appId: 'io.github.nekomeowww.bev',
  productName: 'Bev',
  directories: {
    output: 'dist',
    buildResources: 'build',
  },
  files: [
    'out/**',
    'resources/**',
    'package.json',
    '!**/node_modules/electron{,/**}',
    '!src/**/*',
    '!**/node_modules/**/{CHANGELOG.md,README.md,README,readme.md,readme}',
    '!**/node_modules/**/{.turbo,test,src,__tests__,tests,example,examples}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml,tsconfig.json}',
  ],
  asar: true,
  asarUnpack: ['**/*.node'],
  extraMetadata: {
    name: 'bev',
    main: 'out/main/index.js',
    repository: 'https://github.com/nekomeowww/bev',
    license: 'MIT',
  },
  win: {
    executableName: 'bev',
    publish: {
      provider: 'github',
      owner: 'nekomeowww',
      repo: 'bev',
      channel: 'latest-${arch}',
    },
  },
  nsis: {
    artifactName: '${productName}-${version}-windows-${arch}-setup.${ext}',
    shortcutName: '${productName}',
    uninstallDisplayName: '${productName}',
    createDesktopShortcut: 'always',
    deleteAppDataOnUninstall: true,
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    runAfterFinish: true,
  },
  mac: {
    entitlementsInherit: 'build/entitlements.mac.plist',
    publish: {
      provider: 'github',
      owner: 'nekomeowww',
      repo: 'bev',
      channel: 'latest-${arch}',
    },
    extendInfo: [
      { NSMicrophoneUsageDescription: 'Bev requires microphone access.' },
      { NSCameraUsageDescription: 'Bev requires camera access.' },
    ],
    hardenedRuntime: true,
    notarize: process.env.CI === 'true',
    executableName: 'bev',
    icon: 'icon.icns',
  },
  dmg: {
    artifactName: '${productName}-${version}-darwin-${arch}.${ext}',
  },
  linux: {
    target: ['deb', 'rpm'],
    publish: {
      provider: 'github',
      owner: 'nekomeowww',
      repo: 'bev',
      channel: 'latest-${arch}',
    },
    category: 'Utility',
    synopsis: "Bev (Birdeye's View) desktop application.",
    description: "Bev (Birdeye's View) is a cross-platform desktop application.",
    executableName: 'bev',
    artifactName: '${productName}-${version}-linux-${arch}.${ext}',
    icon: 'build/icon.png',
  },
  appImage: {
    artifactName: '${productName}-${version}-linux-${arch}.${ext}',
  },
  npmRebuild: false,
} satisfies Configuration
