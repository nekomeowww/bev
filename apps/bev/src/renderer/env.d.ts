export {}

declare global {
  interface Window {
    bev: {
      platform: string
      ipcRenderer: import('@electron-toolkit/preload').ElectronAPI['ipcRenderer']
    }
  }
}
