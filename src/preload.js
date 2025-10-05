const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  send: (channel, data) => ipcRenderer.send(channel, data),
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  on: (channel, func) => {
    const validChannels = ['accounts-updated', 'prompt-for-rename', 'profile-picture-updated']; // Adicione outros canais se precisar
    if (validChannels.includes(channel)) {
      // Deliberadamente não removemos o listener para permitir múltiplas atualizações
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  // Métodos para controles da janela personalizada
  window: {
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized')
  }
});
