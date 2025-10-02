const { app, BrowserWindow, BrowserView, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

const userDataPath = app.getPath('userData');
const accountsFilePath = path.join(userDataPath, 'accounts.json');

let mainWindow;
let accounts = [];
let browserViews = new Map();
let sessionMap = new Map();

// Contas padrão
const defaultAccounts = [
  { id: 'account1', name: 'Conta 1', profilePicture: null, active: true },
  { id: 'account2', name: 'Conta 2', profilePicture: null, active: false },
  { id: 'account3', name: 'Conta 3', profilePicture: null, active: false }
];

// User-Agent realista (Chrome mais recente no Windows)
const REALISTIC_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
    autoHideMenuBar: true,
    show: false
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('resize', () => {
    updateBrowserViewBounds();
  });
}

// Inicializar sessão para uma conta com mascaramento avançado
async function initializeSessionForAccount(account) {
  const partition = `persist:discord-${account.id}`;
  const ses = session.fromPartition(partition);
  
  sessionMap.set(account.id, ses);
  
  console.log(`🔐 Inicializando sessão para: ${account.name} (${partition})`);

  // Configurar permissões
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['notifications', 'media', 'microphone', 'camera', 'clipboard-read', 'clipboard-write'];
    const blockedPermissions = ['publickey-credentials-get', 'publickey-credentials-create', 'webauthn', 'fido', 'u2f'];
    
    if (allowedPermissions.includes(permission)) {
      console.log(`✅ Permissão concedida: ${permission} para ${account.name}`);
      callback(true);
    } else if (blockedPermissions.includes(permission)) {
      console.log(`❌ [WEBAUTHN-BLOCK] Bloqueado: ${permission} para ${account.name}`);
      callback(false);
    } else {
      console.log(`❌ Permissão negada: ${permission} para ${account.name}`);
      callback(false);
    }
  });

  // Mascarar headers HTTP para parecer um navegador real
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    // User-Agent realista
    details.requestHeaders['User-Agent'] = REALISTIC_USER_AGENT;
    
    // Remover headers específicos do Electron
    delete details.requestHeaders['electron'];
    delete details.requestHeaders['Electron'];
    delete details.requestHeaders['X-Electron'];
    
    // Adicionar headers realistas para requisições ao Discord
    if (details.url.includes('discord.com')) {
      details.requestHeaders['sec-ch-ua'] = '"Chromium";v="131", "Not_A Brand";v="24"';
      details.requestHeaders['sec-ch-ua-mobile'] = '?0';
      details.requestHeaders['sec-ch-ua-platform'] = '"Windows"';
      details.requestHeaders['sec-fetch-dest'] = 'document';
      details.requestHeaders['sec-fetch-mode'] = 'navigate';
      details.requestHeaders['sec-fetch-site'] = 'none';
      details.requestHeaders['sec-fetch-user'] = '?1';
      details.requestHeaders['upgrade-insecure-requests'] = '1';
      details.requestHeaders['accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
      details.requestHeaders['accept-language'] = 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7';
    }
    
    callback({ requestHeaders: details.requestHeaders });
  });

  // Remover CSP e X-Frame-Options
  ses.webRequest.onHeadersReceived((details, callback) => {
    if (details.responseHeaders['content-security-policy']) {
      delete details.responseHeaders['content-security-policy'];
    }
    if (details.responseHeaders['content-security-policy-report-only']) {
      delete details.responseHeaders['content-security-policy-report-only'];
    }
    if (details.responseHeaders['x-frame-options']) {
      delete details.responseHeaders['x-frame-options'];
    }
    callback({ responseHeaders: details.responseHeaders });
  });

  // Definir User-Agent para a sessão
  ses.setUserAgent(REALISTIC_USER_AGENT);

  // Bloquear verificações de permissão do WebAuthn
  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    if (permission === 'publickey-credentials-get' || permission === 'publickey-credentials-create') {
      console.log(`[WEBAUTHN-BLOCK] Bloqueada verificação de permissão: ${permission}`);
      return false;
    }
    return true;
  });

  ses.setCertificateVerifyProc((request, callback) => {
    callback(0);
  });

  console.log(`✅ Sessão inicializada para ${account.name}`);
}

// Inicializar todas as sessões
async function initializeSessions() {
  for (const account of accounts) {
    await initializeSessionForAccount(account);
  }
}

// Carregar contas do armazenamento (usando fs)
async function loadAccounts() {
  try {
    if (fs.existsSync(accountsFilePath)) {
      const data = fs.readFileSync(accountsFilePath, 'utf8');
      accounts = JSON.parse(data);
      console.log('Contas carregadas do arquivo.');
    } else {
      accounts = defaultAccounts;
      console.log('Usando contas padrão, arquivo não encontrado.');
    }
  } catch (error) {
    console.error('Erro ao carregar contas:', error);
    accounts = defaultAccounts;
  }
  await initializeSessions();
}

// Salvar contas no armazenamento (usando fs)
function saveAccounts() {
  try {
    fs.writeFileSync(accountsFilePath, JSON.stringify(accounts, null, 2), 'utf8');
    console.log('Contas salvas no arquivo.');
  } catch (error) {
    console.error('Erro ao salvar contas:', error);
  }
}

// Criar BrowserView para uma conta
function createBrowserView(accountId) {
  console.log(`🔧 Criando BrowserView para: ${accountId}`);
  
  let persistentSession = sessionMap.get(accountId);
  if (!persistentSession) {
    console.log(`⚠️ Sessão não encontrada para ${accountId}, criando nova`);
    persistentSession = session.fromPartition(`persist:discord-${accountId}`);
    sessionMap.set(accountId, persistentSession);
  }
  
  const view = new BrowserView({
    webPreferences: {
      session: persistentSession,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      backgroundThrottling: false,
      enableBlinkFeatures: '',
      disableBlinkFeatures: 'AutomationControlled,WebAuthentication,CredentialManager,PublicKeyCredential'
    }
  });

  view.webContents.setUserAgent(REALISTIC_USER_AGENT);

  // Injetar script de mascaramento quando o DOM estiver pronto
  view.webContents.on('dom-ready', () => {
    console.log(`Discord DOM pronto para ${accountId}`);
    mainWindow.webContents.send('account-ready', accountId);
    
    // Injetar script de mascaramento avançado
    view.webContents.executeJavaScript(`
      (function() {
        try {
          // MASCARAMENTO COMPLETO DO AMBIENTE
          
          // 1. Remover indicadores de automação
          Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
            configurable: false
          });
          
          // 2. Mascarar plugins para parecer um navegador real
          Object.defineProperty(navigator, 'plugins', {
            get: () => {
              return [
                { name: 'PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
                { name: 'Chrome PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
                { name: 'Chromium PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
                { name: 'Microsoft Edge PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
                { name: 'WebKit built-in PDF', description: 'Portable Document Format', filename: 'internal-pdf-viewer' }
              ];
            },
            configurable: false
          });
          
          // 3. Mascarar languages
          Object.defineProperty(navigator, 'languages', {
            get: () => ['pt-BR', 'pt', 'en-US', 'en'],
            configurable: false
          });
          
          // 4. Mascarar platform
          Object.defineProperty(navigator, 'platform', {
            get: () => 'Win32',
            configurable: false
          });
          
          // 5. Mascarar vendor
          Object.defineProperty(navigator, 'vendor', {
            get: () => 'Google Inc.',
            configurable: false
          });
          
          // 6. Mascarar hardwareConcurrency
          Object.defineProperty(navigator, 'hardwareConcurrency', {
            get: () => 8,
            configurable: false
          });
          
          // 7. Mascarar deviceMemory
          Object.defineProperty(navigator, 'deviceMemory', {
            get: () => 8,
            configurable: false
          });
          
          // 8. Mascarar maxTouchPoints
          Object.defineProperty(navigator, 'maxTouchPoints', {
            get: () => 0,
            configurable: false
          });
          
          // 9. DESABILITAR COMPLETAMENTE WEBAUTHN/PASSKEY
          if (navigator.credentials) {
            Object.defineProperty(navigator, 'credentials', {
              get: () => undefined,
              configurable: false
            });
            console.log('[WEBAUTHN-BLOCK] navigator.credentials desabilitado');
          }
          
          if (window.PublicKeyCredential) {
            window.PublicKeyCredential = undefined;
            console.log('[WEBAUTHN-BLOCK] PublicKeyCredential desabilitado');
          }
          
          if (window.CredentialsContainer) {
            window.CredentialsContainer = undefined;
            console.log('[WEBAUTHN-BLOCK] CredentialsContainer desabilitado');
          }
          
          // 10. Remover variáveis globais do Electron
          if (window.process) {
            delete window.process;
          }
          if (window.require) {
            delete window.require;
          }
          if (window.global) {
            delete window.global;
          }
          if (window.module) {
            delete window.module;
          }
          if (window.exports) {
            delete window.exports;
          }
          
          // 11. Mascarar chrome runtime
          if (window.chrome) {
            Object.defineProperty(window.chrome, 'runtime', {
              get: () => undefined,
              configurable: false
            });
          }
          
          // 12. Adicionar propriedades que navegadores reais possuem
          if (!window.chrome) {
            window.chrome = {};
          }
          
          window.chrome.app = undefined;
          window.chrome.csi = function() {};
          window.chrome.loadTimes = function() {};
          
          console.log('🛡️ Mascaramento avançado aplicado com sucesso');
          
        } catch (error) {
          console.warn('⚠️ Erro ao aplicar mascaramento:', error.message);
        }
      })();
    `).catch(err => {
      console.log('⚠️ Falha ao injetar código de mascaramento:', err.message);
    });
  });

  view.webContents.on('did-finish-load', () => {
    console.log(`Discord carregado para ${accountId}`);
    mainWindow.webContents.send('account-loaded', accountId);
    
    setTimeout(() => {
      extractProfilePicture(view, accountId);
    }, 3000);
  });

  view.webContents.on('did-start-loading', () => {
    console.log(`Carregando Discord para ${accountId}`);
    mainWindow.webContents.send('account-loading', accountId);
  });

  view.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`Falha ao carregar Discord para ${accountId}:`, errorCode, errorDescription);
    mainWindow.webContents.send('account-error', accountId, errorDescription);
  });

  view.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  view.webContents.loadURL('https://discord.com/app');
  
  browserViews.set(accountId, view);
  return view;
}

// Extrair foto de perfil do Discord
async function extractProfilePicture(view, accountId) {
  try {
    console.log(`🖼️ Extraindo foto de perfil para ${accountId}`);
    
    const userAvatarUrl = await view.webContents.executeJavaScript(`
      (function() {
        try {
          if (!window.webpackChunkdiscord_app) {
            console.log('Discord ainda não carregou completamente');
            return null;
          }
          
          let avatarUrl = null;
          
          try {
            const modules = window.webpackChunkdiscord_app.push([[Math.random()], {}, (req) => req.c]);
            
            for (const moduleId in modules) {
              const module = modules[moduleId];
              if (module && module.exports && module.exports.default) {
                const exp = module.exports.default;
                if (exp && exp.getCurrentUser && typeof exp.getCurrentUser === 'function') {
                  const currentUser = exp.getCurrentUser();
                  if (currentUser && currentUser.avatar) {
                    avatarUrl = \`https://cdn.discordapp.com/avatars/\${currentUser.id}/\${currentUser.avatar}.png?size=128\`;
                    console.log('Avatar encontrado via Discord API:', avatarUrl);
                    return avatarUrl;
                  }
                }
              }
            }
          } catch (e) {
            console.log('Falha ao extrair via webpack:', e.message);
          }
          
          console.log('Avatar não encontrado, usuário pode não estar logado');
          return null;
        } catch (error) {
          console.log('Erro ao extrair foto de perfil:', error.message);
          return null;
        }
      })();
    `);

    if (userAvatarUrl && userAvatarUrl !== 'null') {
      console.log(`✅ Foto de perfil encontrada para ${accountId}: ${userAvatarUrl}`);
      
      const account = accounts.find(acc => acc.id === accountId);
      if (account) {
        account.profilePicture = userAvatarUrl;
        saveAccounts();
        mainWindow.webContents.send('profile-picture-updated', accountId, userAvatarUrl);
      }
    } else {
      console.log(`⚠️ Foto de perfil não encontrada para ${accountId}`);
      setTimeout(() => {
        extractProfilePicture(view, accountId);
      }, 10000);
    }
  } catch (error) {
    console.error(`❌ Falha ao extrair foto de perfil para ${accountId}:`, error.message);
  }
}

// Atualizar bounds da BrowserView
function updateBrowserViewBounds() {
  const currentView = getCurrentBrowserView();
  if (!currentView || !mainWindow) return;
  
  const contentBounds = mainWindow.getContentBounds();
  const topOffset = 130; // Altura da barra superior (header + tabs)

  currentView.setBounds({
    x: 0,
    y: topOffset,
    width: contentBounds.width,
    height: contentBounds.height - topOffset
  });
}

// Obter BrowserView ativa
function getCurrentBrowserView() {
  return mainWindow?.getBrowserView();
}

// Trocar para BrowserView de uma conta
function switchToBrowserView(accountId) {
  if (!mainWindow) return;

  browserViews.forEach((view, id) => {
    if (id !== accountId) {
      mainWindow.removeBrowserView(view);
    }
  });

  let view = browserViews.get(accountId);
  if (!view) {
    view = createBrowserView(accountId);
  }

  mainWindow.setBrowserView(view);
  
  setTimeout(() => {
    updateBrowserViewBounds();
  }, 100);
  
  console.log(`🔄 Trocado para BrowserView: ${accountId}`);
}

// Handlers IPC
ipcMain.handle('get-accounts', () => {
  return accounts;
});

ipcMain.handle('set-active-account', (event, accountId) => {
  accounts.forEach(account => {
    account.active = account.id === accountId;
  });
  saveAccounts();
  return accounts;
});

ipcMain.handle('add-account', async (event, accountData) => {
  const newAccount = {
    id: `account${Date.now()}`,
    name: accountData.name || `Conta ${accounts.length + 1}`,
    profilePicture: accountData.profilePicture || null,
    active: true
  };
  
  // Desativar todas as outras contas
  accounts.forEach(acc => acc.active = false);
  
  accounts.push(newAccount);
  saveAccounts();
  
  await initializeSessionForAccount(newAccount);
  
  // Criar e trocar para a BrowserView da nova conta
  switchToBrowserView(newAccount.id);
  
  return accounts;
});

ipcMain.handle('remove-account', (event, accountId) => {
  const index = accounts.findIndex(acc => acc.id === accountId);
  if (index > -1) {
    accounts.splice(index, 1);
    
    const ses = sessionMap.get(accountId);
    if (ses) {
      ses.clearStorageData();
      sessionMap.delete(accountId);
    }
    
    const view = browserViews.get(accountId);
    if (view) {
      if (mainWindow) {
        mainWindow.removeBrowserView(view);
      }
      browserViews.delete(accountId);
    }
    
    saveAccounts();
  }
  return accounts;
});

ipcMain.handle('update-account', (event, accountId, accountData) => {
  const account = accounts.find(acc => acc.id === accountId);
  if (account) {
    Object.assign(account, accountData);
    saveAccounts();
  }
  return accounts;
});

ipcMain.handle('switch-account', (event, accountId) => {
  switchToBrowserView(accountId);
  return true;
});

ipcMain.handle('reload-account', (event, accountId) => {
  const view = browserViews.get(accountId);
  if (view) {
    view.webContents.reload();
  }
  return true;
});

ipcMain.on('hide-browser-view', () => {
  if (mainWindow && mainWindow.getBrowserView()) {
    mainWindow.removeBrowserView(mainWindow.getBrowserView());
  }
});

ipcMain.on('show-browser-view', () => {
  const activeAccount = accounts.find(acc => acc.active);
  if (activeAccount && mainWindow) {
    const view = browserViews.get(activeAccount.id);
    if (view) {
      mainWindow.setBrowserView(view);
      updateBrowserViewBounds();
    }
  }
});

ipcMain.handle('clear-session', async (event, accountId) => {
  const ses = sessionMap.get(accountId);
  if (ses) {
    await ses.clearStorageData();
    console.log(`🗑️ Sessão limpa para ${accountId}`);
    
    // Recarregar a view
    const view = browserViews.get(accountId);
    if (view) {
      view.webContents.reload();
    }
  }
  return true;
});

// Eventos do app
app.whenReady().then(async () => {
  await loadAccounts();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  console.log('💾 Salvando dados da sessão antes de sair...');
  
  event.preventDefault();
  
  try {
    // Forçar o salvamento das contas antes de sair
    saveAccounts();
    console.log('✅ Todos os dados da sessão foram salvos');
    
    app.exit(0);
  } catch (error) {
    console.error('❌ Erro ao salvar dados da sessão:', error);
    app.exit(0);
  }
});

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});

app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    require('electron').shell.openExternal(navigationUrl);
  });
});
