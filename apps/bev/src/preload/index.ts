import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('bev', {
  platform: process.platform,
  ipcRenderer: electronAPI.ipcRenderer,
})
