/**
 * Módulo de controle de janela
 * Gerencia minimize, maximize, close e estado da janela
 */

function setupWindowHandlers(ipcMain, mainWindow) {
  // Handler para minimizar janela
  ipcMain.handle('window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  // Handler para maximizar/restaurar janela
  ipcMain.handle('window-maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  // Handler para fechar janela
  ipcMain.handle('window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  // Handler para verificar se janela está maximizada
  ipcMain.handle('window-is-maximized', () => {
    return mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
  });
}

module.exports = { setupWindowHandlers };


