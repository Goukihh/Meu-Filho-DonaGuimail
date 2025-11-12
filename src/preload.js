const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  send: (channel, data) => ipcRenderer.send(channel, data),
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
    on: (channel, func) => {
    const validChannels = [
    'automation-nicks-status',
      'accounts-updated',
      'prompt-for-rename',
      'prompt-for-clear-session',
      'prompt-for-remove',
      'profile-picture-updated',
      'automation-log',
      'close-automation-tab',
      'automation-status-update',
      'show-custom-confirm',
      'automation-leva-completed',
      'leva-incompleta',
      'progress-show',
      'progress-update',
      'stats-update',
      'progress-hide',
    ]; // Adicione outros canais se precisar
    if (validChannels.includes(channel)) {
      // Sei lá
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  // ✅ FIX: Expor ipcRenderer diretamente para compatibilidade
  ipcRenderer: {
    on: (channel, func) => {
      const validChannels = [
        'automation-nicks-status',
        'accounts-updated',
        'prompt-for-rename',
        'prompt-for-clear-session',
        'prompt-for-remove',
        'profile-picture-updated',
        'automation-log',
        'close-automation-tab',
        'automation-status-update',
        'show-custom-confirm',
        'automation-leva-completed',
        'leva-incompleta',
        'progress-show',
        'progress-update',
        'stats-update',
        'progress-hide',
      ];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },
    send: (channel, data) => ipcRenderer.send(channel, data),
  },
  // Métodos para controles da janela personalizada
  window: {
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  },
  // Métodos para automação
  automation: {
    getNicks: () => ipcRenderer.invoke('automation-get-nicks'),
    start: config => ipcRenderer.invoke('automation-start', config),
    pause: () => ipcRenderer.invoke('automation-pause'),
    stop: () => ipcRenderer.invoke('automation-stop'),
    getStatus: () => ipcRenderer.invoke('automation-status'),
    setGroup: group => ipcRenderer.invoke('automation-set-group', group),
  // Panel open/close used to pause/resume automation when the automation panel was opened.
  // The pause feature was removed; expose no-op functions so older renderer calls still resolve.
  panelOpened: () => Promise.resolve({ success: true, paused: false }),
  panelClosed: () => Promise.resolve({ success: true, resumed: false }),
    saveWebhook: url => ipcRenderer.invoke('automation-save-webhook', url),
  },
  // Métodos para limpeza de DMs e amigos
  cleanup: {
    start: accountIds => ipcRenderer.invoke('cleanup-start', accountIds),
  },
  // Método para selecionar arquivo de nicks
  selectNicksFile: () => ipcRenderer.invoke('select-nicks-file'),
});
