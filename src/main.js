const { app, BrowserWindow, BrowserView, ipcMain, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const UserAgent = require('user-agents');
// Auto-updater removido para evitar falsos alarmes do Windows Defender

// Usar pasta de dados do usuário para persistência permanente
const userDataPath = app.getPath('userData');
const accountsFilePath = path.join(userDataPath, 'accounts.json');

// Garantir que a pasta de dados existe
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}

console.log(`📁 Dados salvos em: ${userDataPath}`);

let mainWindow;
let accounts = [];
let browserViews = new Map();
let sessionMap = new Map();
let isModalOpen = false; // Sinal de trânsito para controlar visibilidade da BrowserView
let isRenaming = false; // Controle para evitar recriação durante renomeação
let isAddingAccount = false; // Controle para evitar recriação durante adição de conta

// Contas padrão
const defaultAccounts = [
  { id: 'account1', name: 'Conta 1', profilePicture: null, active: true },
  { id: 'account2', name: 'Conta 2', profilePicture: null, active: false },
  { id: 'account3', name: 'Conta 3', profilePicture: null, active: false }
];

// User-Agents realistas para rotação
const REALISTIC_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
];

// Função para obter User-Agent aleatório
function getRandomUserAgent() {
  return REALISTIC_USER_AGENTS[Math.floor(Math.random() * REALISTIC_USER_AGENTS.length)];
}

// User-Agent padrão (fallback)
const REALISTIC_USER_AGENT = REALISTIC_USER_AGENTS[0];

// Funções estáveis para leitura/escrita de contas
function readAccounts() {
  try {
    if (fs.existsSync(accountsFilePath)) {
      const data = fs.readFileSync(accountsFilePath, 'utf-8');
      const parsedAccounts = JSON.parse(data);
      console.log('📖 Contas lidas do arquivo:', parsedAccounts.length);
      return parsedAccounts;
    } else {
      console.log('📝 Arquivo de contas não existe, criando com contas padrão');
      writeAccounts(defaultAccounts);
      return defaultAccounts;
    }
  } catch (error) {
    console.error('❌ Erro ao ler contas:', error);
    return defaultAccounts;
  }
}

function writeAccounts(accountsToSave) {
  try {
    fs.writeFileSync(accountsFilePath, JSON.stringify(accountsToSave, null, 2));
    console.log('💾 Contas salvas no arquivo:', accountsToSave.length);
    return true;
  } catch (error) {
    console.error('❌ Erro ao salvar contas:', error);
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    frame: false, // Remove a barra de título padrão
    titleBarStyle: 'hidden', // Esconde a barra de título no Windows
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
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

// Handlers para controles da janela personalizada
ipcMain.handle('window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// Inicializar sessão para uma conta com mascaramento avançado
async function initializeSessionForAccount(account) {
  const partition = `persist:discord-${account.id}`;
  const ses = session.fromPartition(partition);
  
  // INJETAR SCRIPT DE EVASÃO STEALTH
  const stealthScriptPath = path.join(__dirname, 'stealth.js');
  ses.setPreloads([stealthScriptPath]);
  console.log(`🕵️ Script de evasão stealth injetado para: ${account.name}`);
  
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
    
    // MASCARAR REQUISIÇÕES DE CAPTCHA (NÃO BLOQUEAR)
    if (details.url.includes('hcaptcha.com') || 
        details.url.includes('captcha') || 
        details.url.includes('challenge') ||
        details.url.includes('recaptcha')) {
      console.log('🎭 Mascarando requisição de captcha:', details.url);
      // Adicionar headers realistas em vez de bloquear
      details.requestHeaders['User-Agent'] = REALISTIC_USER_AGENT;
      details.requestHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8';
      details.requestHeaders['Accept-Language'] = 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7';
      details.requestHeaders['Sec-Fetch-Dest'] = 'document';
      details.requestHeaders['Sec-Fetch-Mode'] = 'navigate';
      details.requestHeaders['Sec-Fetch-Site'] = 'none';
      details.requestHeaders['Sec-Fetch-User'] = '?1';
    }
    
    // Adicionar headers realistas para requisições ao Discord
    if (details.url.includes('canary.discord.com')) {
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
      
      // Headers anti-detecção adicionais
      details.requestHeaders['sec-ch-ua-arch'] = '"x86"';
      details.requestHeaders['sec-ch-ua-bitness'] = '"64"';
      details.requestHeaders['sec-ch-ua-full-version'] = '"131.0.6778.85"';
      details.requestHeaders['sec-ch-ua-full-version-list'] = '"Chromium";v="131.0.6778.85", "Not_A Brand";v="24.0.0.0"';
      details.requestHeaders['sec-ch-ua-model'] = '""';
      details.requestHeaders['sec-ch-ua-wow64'] = '?0';
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

// Cache inteligente: Pré-carregar sessões mais usadas
async function preloadFrequentSessions() {
  try {
    console.log('⚡ Iniciando pré-carregamento de sessões frequentes...');
    
    // Carregar apenas as primeiras 3 contas ativas para performance
    const activeAccounts = accounts.filter(acc => acc.active).slice(0, 3);
    
    for (const account of activeAccounts) {
      if (!sessionMap.has(account.id)) {
        console.log(`🚀 Pré-carregando sessão para: ${account.name}`);
        await createSession(account.id);
      }
    }
    
    console.log('✅ Pré-carregamento concluído');
  } catch (error) {
    console.error('❌ Erro no pré-carregamento:', error);
  }
}

// Carregar contas do armazenamento (usando fs) - OTIMIZADO
async function loadAccounts() {
  try {
    if (fs.existsSync(accountsFilePath)) {
      const data = fs.readFileSync(accountsFilePath, 'utf8');
      accounts = JSON.parse(data);
      console.log(`📱 ${accounts.length} contas carregadas do arquivo.`);
      
      // Otimização: Pré-processar contas para melhor performance
      accounts.forEach(account => {
        if (account.id && !account.avatar) {
          account.avatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
        }
        // Garantir que todas as contas tenham propriedades essenciais
        if (!account.active) account.active = false;
        if (!account.name) account.name = `Conta ${accounts.indexOf(account) + 1}`;
      });
    } else {
      accounts = defaultAccounts;
      console.log('Usando contas padrão, arquivo não encontrado.');
    }
  } catch (error) {
    console.error('Erro ao carregar contas:', error);
    accounts = defaultAccounts;
  }
  
  // Otimização: Inicializar sessões de forma assíncrona e não-bloqueante
  setImmediate(() => {
    initializeSessions();
  });
  
  // Cache inteligente: Pré-carregar sessões mais usadas
  setTimeout(() => {
    preloadFrequentSessions();
  }, 2000);
}

// Função saveAccounts removida - usar writeAccounts(accounts) em seu lugar

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

  // Gerar User-Agent rotativo e realista
  const randomUserAgent = getRandomUserAgent();
  console.log(`🔧 User-Agent gerado para ${accountId}: ${randomUserAgent}`);
  view.webContents.setUserAgent(randomUserAgent);

  // INJETAR SCRIPTS DE EVASÃO SEGUROS NA BROWSERVIEW
  const stealthSafeScriptPath = path.join(__dirname, 'stealth-safe.js');
  const captchaHandlerScriptPath = path.join(__dirname, 'captcha-handler.js');
  
  view.webContents.executeJavaScript(`
    // Carregar script de evasão seguro
    fetch('file://${stealthSafeScriptPath.replace(/\\/g, '/')}')
      .then(response => response.text())
      .then(script => {
        const scriptElement = document.createElement('script');
        scriptElement.textContent = script;
        document.head.appendChild(scriptElement);
        console.log('🕵️ Script de evasão seguro carregado com sucesso');
      })
      .catch(error => console.error('❌ Erro ao carregar script stealth seguro:', error));
      
    // Carregar manipulador de captcha inteligente
    fetch('file://${captchaHandlerScriptPath.replace(/\\/g, '/')}')
      .then(response => response.text())
      .then(script => {
        const scriptElement = document.createElement('script');
        scriptElement.textContent = script;
        document.head.appendChild(scriptElement);
        console.log('🧠 Manipulador de captcha inteligente carregado com sucesso');
      })
      .catch(error => console.error('❌ Erro ao carregar manipulador de captcha:', error));
  `);
  console.log(`🕵️ Scripts de evasão seguros injetados na BrowserView para: ${accountId}`);
  console.log(`🕵️ Script de evasão avançado injetado na BrowserView para: ${accountId}`);

  // Injetar script de mascaramento quando o DOM estiver pronto
  view.webContents.on('dom-ready', () => {
    console.log(`Discord DOM pronto para ${accountId}`);
    
    // INJETAR SCRIPTS DE EVASÃO SEGUROS DIRETAMENTE
    const stealthSafeScriptPath = path.join(__dirname, 'stealth-safe.js');
    const captchaHandlerScriptPath = path.join(__dirname, 'captcha-handler.js');
    
    const stealthSafeScript = fs.readFileSync(stealthSafeScriptPath, 'utf8');
    const captchaHandlerScript = fs.readFileSync(captchaHandlerScriptPath, 'utf8');
    const testEvasionScript = fs.readFileSync(path.join(__dirname, 'test-evasion.js'), 'utf8');
    
    view.webContents.executeJavaScript(stealthSafeScript);
    view.webContents.executeJavaScript(captchaHandlerScript);
    
    // Executar teste de evasão após 2 segundos
    setTimeout(() => {
      view.webContents.executeJavaScript(testEvasionScript);
    }, 2000);
    
    console.log(`🕵️ Scripts de evasão seguros e manipulador de captcha executados para: ${accountId}`);
    
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
    
    // Enviar evento para remover loading
    mainWindow.webContents.send('view-loaded');
    
    // Só tornar visível se o sinal estiver verde (nenhum modal aberto)
    if (!isModalOpen) {
      console.log(`🚦 Sinal verde: Tornando BrowserView visível para ${accountId}`);
      updateBrowserViewBounds();
    } else {
      console.log(`🚦 Sinal vermelho: BrowserView permanece escondida para ${accountId}`);
    }
    
    setTimeout(() => {
      extractProfilePicture(view, accountId);
    }, 3000);
  });

  view.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  view.webContents.loadURL('https://canary.discord.com/app');
  
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
                    avatarUrl = \`https://cdn.discordapp.com/avatars/\${currentUser.id}/\${currentUser.avatar}.png?size=1024\`;
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
        writeAccounts(accounts);
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
  
  // Só tornar visível se o sinal estiver verde (nenhum modal aberto)
  if (isModalOpen) {
    console.log('🚦 Sinal vermelho: BrowserView permanece escondida');
    currentView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    return;
  }
  
  console.log('🚦 Sinal verde: Tornando BrowserView visível');
  const contentBounds = mainWindow.getContentBounds();
  const topOffset = 158; // 32px barra título + 25px header + 75px abas + 26px ajuste (8px abaixo da linha laranja)

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
  const accountsPath = path.join(app.getPath('userData'), 'accounts.json');
  try {
    if (fs.existsSync(accountsPath)) {
      const data = fs.readFileSync(accountsPath, 'utf-8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Erro ao ler o arquivo de contas:', error);
    return [];
  }
});

ipcMain.handle('set-active-account', (event, accountId) => {
  accounts.forEach(account => {
    account.active = account.id === accountId;
  });
  writeAccounts(accounts);
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
    
    writeAccounts(accounts);
  }
  return accounts;
});

ipcMain.handle('update-account', (event, accountId, accountData) => {
  const account = accounts.find(acc => acc.id === accountId);
  if (account) {
    Object.assign(account, accountData);
    writeAccounts(accounts);
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

// Gerenciar menu de contexto - esconder BrowserView
ipcMain.on('context-menu-open', () => {
  isModalOpen = true; // Sinal vermelho - modal aberto
  const activeBrowserView = getCurrentBrowserView();
  if (activeBrowserView) {
    activeBrowserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    console.log('🔧 BrowserView escondida para menu de contexto');
  }
  console.log('🚦 Sinal vermelho: Modal aberto');
});

// Gerenciar menu de contexto - restaurar BrowserView
ipcMain.on('context-menu-closed', () => {
  isModalOpen = false; // Sinal verde - modal fechado
  
  // Só recriar BrowserView se NÃO estiver renomeando ou adicionando conta
  if (!isRenaming && !isAddingAccount) {
    const activeAccount = accounts.find(acc => acc.active);
    if (activeAccount && !getCurrentBrowserView()) {
      console.log(`🔄 Recriando BrowserView para conta ativa: ${activeAccount.id}`);
      const view = createBrowserView(activeAccount.id);
      browserViews.set(activeAccount.id, view);
      mainWindow.setBrowserView(view);
      setTimeout(() => {
        updateBrowserViewBounds();
      }, 100);
    } else {
      updateBrowserViewBounds();
    }
  } else {
    console.log(`🚫 Recriação bloqueada - ainda renomeando ou adicionando conta`);
  }
  
  console.log('🔧 BrowserView restaurada após fechar menu de contexto');
  console.log('🚦 Sinal verde: Modal fechado');
});

// Fechar BrowserView para adicionar conta
ipcMain.on('close-browser-view-for-add', () => {
  console.log(`➕ Fechando BrowserView para adição de nova conta`);
  isAddingAccount = true; // BLOQUEAR recriação automática
  const activeBrowserView = getCurrentBrowserView();
  if (activeBrowserView) {
    mainWindow.removeBrowserView(activeBrowserView);
    console.log(`🗑️ BrowserView removida completamente para adição de conta`);
  }
});

// Gerenciar ações do menu de contexto
ipcMain.on('context-menu-action', async (event, { action, accountId }) => {
  console.log(`[Main] Recebida a ação: ${action} para a conta ${accountId}`);
  console.log(`🔧 Ação do menu de contexto: ${action} para conta ${accountId}`);
  
  switch (action) {
    case 'rename':
      // FECHAR COMPLETAMENTE a BrowserView para evitar sobreposição
      console.log(`📝 Fechando BrowserView para renomeação da conta ${accountId}`);
      isRenaming = true; // BLOQUEAR recriação automática
      const activeBrowserView = getCurrentBrowserView();
      if (activeBrowserView) {
        mainWindow.removeBrowserView(activeBrowserView);
        console.log(`🗑️ BrowserView removida completamente para renomeação`);
      }
      mainWindow.webContents.send('prompt-for-rename', accountId);
      break;
      
    case 'remove':
      try {
        // Esconder BrowserView antes do diálogo
        const activeBrowserView = getCurrentBrowserView();
        if (activeBrowserView) {
          activeBrowserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
        }
        
        const confirmResult = await dialog.showMessageBox(mainWindow, {
          type: 'question',
          buttons: ['Cancelar', 'Remover'],
          defaultId: 0,
          message: 'Remover Conta',
          detail: 'Tem certeza que deseja remover esta conta? Esta ação não pode ser desfeita.'
        });
        
        // Restaurar BrowserView após diálogo
        if (activeBrowserView) {
          updateBrowserViewBounds();
        }
        
        // Só remover se usuário confirmou (índice 1 = "Remover")
        if (confirmResult.response === 1) {
          const index = accounts.findIndex(acc => acc.id === accountId);
          if (index > -1) {
            // Remover da lista
            accounts.splice(index, 1);
            
            // Limpar sessão e view
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
            
            // Salvar e notificar interface
            writeAccounts(accounts);
            mainWindow.webContents.send('accounts-updated');
            console.log(`✅ Conta ${accountId} removida com sucesso`);
          } else {
            console.log(`⚠️ Conta ${accountId} não encontrada para remoção`);
          }
        } else {
          console.log(`❌ Remoção da conta ${accountId} cancelada pelo usuário`);
        }
      } catch (error) {
        console.error(`❌ Erro ao remover conta ${accountId}:`, error);
        // Restaurar BrowserView em caso de erro
        const activeBrowserView = getCurrentBrowserView();
        if (activeBrowserView) {
          updateBrowserViewBounds();
        }
      }
      break;
      
    case 'clear-session':
      // Esconder BrowserView antes do diálogo
      const activeBrowserView2 = getCurrentBrowserView();
      if (activeBrowserView2) {
        activeBrowserView2.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      }
      
      const clearResult = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Cancelar', 'Limpar'],
        defaultId: 0,
        message: 'Limpar Sessão',
        detail: 'Tem certeza que deseja limpar os dados da sessão? Você precisará fazer login novamente.'
      });
      
      // Restaurar BrowserView após diálogo
      if (activeBrowserView2) {
        updateBrowserViewBounds();
      }
      
      if (clearResult.response === 1) {
        const ses = sessionMap.get(accountId);
        if (ses) {
          await ses.clearStorageData();
          console.log(`🗑️ Sessão limpa para ${accountId}`);
          
          const view = browserViews.get(accountId);
          if (view) {
            view.webContents.reload();
          }
        }
      }
      break;
      
    case 'reload':
      const view = browserViews.get(accountId);
      if (view) {
        view.webContents.reload();
        console.log(`🔄 Conta ${accountId} recarregada`);
      }
      break;
  }
});

// Listener para adicionar nova conta
ipcMain.handle('add-account', async (event, accountData) => {
  console.log(`➕ Iniciando adição de nova conta: ${accountData.name}`);
  
  const newAccount = {
    id: `account${Date.now()}`,
    name: accountData.name || `Conta ${accounts.length + 1}`,
    profilePicture: accountData.profilePicture || null,
    active: true
  };
  
  // Desativar todas as outras contas
  accounts.forEach(acc => acc.active = false);
  
  accounts.push(newAccount);
  writeAccounts(accounts);
  
  await initializeSessionForAccount(newAccount);
  
  // Criar e trocar para a BrowserView da nova conta
  switchToBrowserView(newAccount.id);
  
  // LIBERAR recriação após adicionar conta
  isAddingAccount = false;
  console.log(`🔓 Adição de conta concluída - recriação liberada`);
  console.log(`✅ Nova conta criada: ${newAccount.name} (${newAccount.id})`);
  return accounts;
});

// Listener para executar renomeação
ipcMain.on('execute-rename', (event, { accountId, newName }) => {
  try {
    const account = accounts.find(acc => acc.id === accountId);
    if (account && newName && newName.trim()) {
      const oldName = account.name;
      account.name = newName.trim();
      
      // Salvar e notificar interface
      writeAccounts(accounts);
      mainWindow.webContents.send('accounts-updated');
      console.log(`✅ Conta ${accountId} renomeada de "${oldName}" para "${newName.trim()}"`);
      
      // LIBERAR recriação da BrowserView após renomear
      isRenaming = false;
      console.log(`🔓 Renomeação concluída - recriação liberada`);
      
      // Recriar BrowserView após renomear
      const activeAccount = accounts.find(acc => acc.active);
      if (activeAccount && !getCurrentBrowserView()) {
        console.log(`🔄 Recriando BrowserView após renomeação: ${activeAccount.id}`);
        const view = createBrowserView(activeAccount.id);
        browserViews.set(activeAccount.id, view);
        mainWindow.setBrowserView(view);
        setTimeout(() => {
          updateBrowserViewBounds();
        }, 100);
      }
    } else {
      console.log(`⚠️ Renomeação falhou: conta ${accountId} não encontrada ou nome inválido`);
      isRenaming = false; // Liberar mesmo em caso de erro
    }
  } catch (error) {
    console.error(`❌ Erro ao renomear conta ${accountId}:`, error);
    isRenaming = false; // Liberar mesmo em caso de erro
  }
});

// Listener para atualizar foto de perfil
ipcMain.on('profile-picture-updated', (event, accountId, avatarUrl) => {
  console.log(`🖼️ Foto de perfil atualizada para ${accountId}: ${avatarUrl}`);
  const account = accounts.find(acc => acc.id === accountId);
  if (account) {
    account.profilePicture = avatarUrl;
    writeAccounts(accounts);
    mainWindow.webContents.send('accounts-updated');
  }
});

// Sistema de verificação de atualizações seguro
const https = require('https');

// Verificar atualizações via GitHub API
async function checkForUpdates() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: '/repos/Goukihh/Meu-Filho-DonaGuimail/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'Meu-Filho-App',
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const latestVersion = release.tag_name.replace('v', '');
          const currentVersion = require('../package.json').version;
          
          console.log(`🔍 Versão atual: ${currentVersion}`);
          console.log(`🔍 Última versão: ${latestVersion}`);
          
          const isNewer = compareVersions(latestVersion, currentVersion) > 0;
          
          // Gerar descrição mais humana se não houver release notes
          let humanReleaseNotes = release.body;
          if (!humanReleaseNotes || humanReleaseNotes.trim() === '') {
            humanReleaseNotes = generateHumanReleaseNotes(latestVersion, currentVersion);
          }
          
          resolve({
            hasUpdate: isNewer,
            currentVersion,
            latestVersion,
            downloadUrl: release.assets[0]?.browser_download_url || release.html_url,
            releaseNotes: humanReleaseNotes
          });
        } catch (error) {
          console.error('❌ Erro ao verificar atualizações:', error);
          resolve({ hasUpdate: false, error: `Erro ao processar resposta: ${error.message}` });
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Erro na requisição:', error);
      resolve({ hasUpdate: false, error: error.message });
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ hasUpdate: false, error: 'Timeout' });
    });
    
    req.end();
  });
}

// Comparar versões (ex: "1.2.1" vs "1.2.0")
function compareVersions(version1, version2) {
  const v1parts = version1.split('.').map(Number);
  const v2parts = version2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
    const v1part = v1parts[i] || 0;
    const v2part = v2parts[i] || 0;
    
    if (v1part > v2part) return 1;
    if (v1part < v2part) return -1;
  }
  
  return 0;
}

// Gerar descrições de atualização mais humanas
function generateHumanReleaseNotes(latestVersion, currentVersion) {
  const versionParts = latestVersion.split('.');
  const major = parseInt(versionParts[0]);
  const minor = parseInt(versionParts[1]);
  const patch = parseInt(versionParts[2]);
  
  const descriptions = [
    `🎉 Nova versão ${latestVersion} disponível!`,
    `✨ Melhorias e correções na versão ${latestVersion}`,
    `🚀 Atualização ${latestVersion} com novidades incríveis`,
    `🔧 Versão ${latestVersion} com correções importantes`,
    `💫 Nova atualização ${latestVersion} pronta para você!`
  ];
  
  let description = descriptions[Math.floor(Math.random() * descriptions.length)];
  
  // Adicionar detalhes baseados no tipo de atualização
  if (major > parseInt(currentVersion.split('.')[0])) {
    description += `\n\n🆕 Esta é uma atualização MAIOR com muitas novidades!`;
    description += `\n• Novos recursos incríveis`;
    description += `\n• Melhorias significativas`;
    description += `\n• Correções importantes`;
  } else if (minor > parseInt(currentVersion.split('.')[1])) {
    description += `\n\n✨ Esta é uma atualização com melhorias!`;
    description += `\n• Novos recursos adicionados`;
    description += `\n• Melhorias de performance`;
    description += `\n• Correções de bugs`;
  } else {
    description += `\n\n🔧 Esta é uma atualização de correções!`;
    description += `\n• Bugs corrigidos`;
    description += `\n• Melhorias de estabilidade`;
    description += `\n• Otimizações gerais`;
  }
  
  description += `\n\n💡 Recomendamos atualizar para a melhor experiência!`;
  
  return description;
}

// Handler para verificar atualizações
ipcMain.handle('check-updates', async () => {
  console.log('🔍 Verificando atualizações...');
  const updateInfo = await checkForUpdates();
  
  if (updateInfo.hasUpdate) {
    console.log(`📦 Atualização disponível: ${updateInfo.latestVersion}`);
  } else {
    console.log('✅ Aplicativo atualizado');
  }
  
  return updateInfo;
});

// Handler para abrir página de download
ipcMain.handle('open-download-page', (event, downloadUrl) => {
  const { shell } = require('electron');
  shell.openExternal(downloadUrl);
  return true;
});

// ========================================
// FUNCIONALIDADES DE FUNDO PERSONALIZADO
// ========================================

// Obter configuração de fundo
ipcMain.handle('get-background-setting', () => {
  try {
    const settingsPath = path.join(userDataPath, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(data);
      return settings.backgroundImage || null;
    }
    return null;
  } catch (error) {
    console.error('Erro ao obter configuração de fundo:', error);
    return null;
  }
});

// Definir imagem de fundo
ipcMain.handle('set-background-image', async (event, imagePath) => {
  try {
    if (!imagePath || !fs.existsSync(imagePath)) {
      return { success: false, message: 'Arquivo de imagem não encontrado' };
    }

    // Copiar imagem para pasta de dados do usuário
    const customBackgroundPath = path.join(userDataPath, 'custom-background.png');
    fs.copyFileSync(imagePath, customBackgroundPath);
    
    // Salvar configuração
    const settingsPath = path.join(userDataPath, 'settings.json');
    let settings = {};
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      settings = JSON.parse(data);
    }
    
    settings.backgroundImage = customBackgroundPath;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    
    console.log('🎨 Imagem de fundo personalizada salva:', customBackgroundPath);
    return { success: true, message: 'Fundo personalizado salvo com sucesso!' };
  } catch (error) {
    console.error('Erro ao definir imagem de fundo:', error);
    return { success: false, message: `Erro ao salvar fundo: ${error.message}` };
  }
});

// Restaurar fundo padrão
ipcMain.handle('restore-default-background', async () => {
  try {
    const customBackgroundPath = path.join(userDataPath, 'custom-background.png');
    
    // Remover arquivo de fundo personalizado se existir
    if (fs.existsSync(customBackgroundPath)) {
      fs.unlinkSync(customBackgroundPath);
    }
    
    // Limpar configuração
    const settingsPath = path.join(userDataPath, 'settings.json');
    let settings = {};
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      settings = JSON.parse(data);
    }
    
    delete settings.backgroundImage;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    
    console.log('🎨 Fundo padrão restaurado');
    return { success: true, message: 'Fundo padrão restaurado com sucesso!' };
  } catch (error) {
    console.error('Erro ao restaurar fundo padrão:', error);
    return { success: false, message: `Erro ao restaurar fundo: ${error.message}` };
  }
});

// ========================================
// FUNCIONALIDADES DE PERSONALIZAÇÃO DE CORES
// ========================================

// Obter cor personalizada
ipcMain.handle('get-custom-color', () => {
  try {
    const settingsPath = path.join(userDataPath, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(data);
      return settings.customColor || null;
    }
    return null;
  } catch (error) {
    console.error('Erro ao obter cor personalizada:', error);
    return null;
  }
});

// Definir cor personalizada
ipcMain.handle('set-custom-color', async (event, color) => {
  try {
    if (!color || !color.match(/^#[0-9A-F]{6}$/i)) {
      return { success: false, message: 'Cor inválida' };
    }

    // Salvar configuração com compressão
    const settingsPath = path.join(userDataPath, 'settings.json');
    let settings = {};
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      settings = JSON.parse(data);
    }
    
    settings.customColor = color;
    settings.lastUpdated = Date.now();
    
    // Compressão: Remover espaços desnecessários
    const compressedData = JSON.stringify(settings);
    fs.writeFileSync(settingsPath, compressedData);
    
    console.log('🎨 Cor personalizada salva:', color);
    return { success: true, message: 'Cor personalizada salva com sucesso!' };
  } catch (error) {
    console.error('Erro ao salvar cor personalizada:', error);
    return { success: false, message: `Erro ao salvar cor: ${error.message}` };
  }
});

// Restaurar cor padrão
ipcMain.handle('reset-custom-color', async () => {
  try {
    // Limpar configuração
    const settingsPath = path.join(userDataPath, 'settings.json');
    let settings = {};
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      settings = JSON.parse(data);
    }
    
    delete settings.customColor;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    
    console.log('🎨 Cor padrão restaurada');
    return { success: true, message: 'Cor padrão restaurada com sucesso!' };
  } catch (error) {
    console.error('Erro ao restaurar cor padrão:', error);
    return { success: false, message: `Erro ao restaurar cor: ${error.message}` };
  }
});

// ========================================
// FUNCIONALIDADES DE IMPORTAR/EXPORTAR CONTAS
// ========================================

// Exportar contas para arquivo JSON
ipcMain.handle('export-accounts', async () => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Exportar Contas',
      defaultPath: 'contas-meu-filho.json',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePath) {
      const exportData = {
        version: '1.2.1',
        exportDate: new Date().toISOString(),
        accounts: accounts.map(account => ({
          id: account.id,
          name: account.name,
          avatar: account.avatar,
          active: account.active
        }))
      };

      fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2));
      console.log(`📤 ${accounts.length} contas exportadas para: ${result.filePath}`);
      return { success: true, message: `${accounts.length} contas exportadas com sucesso!` };
    }
    return { success: false, message: 'Exportação cancelada' };
  } catch (error) {
    console.error('❌ Erro ao exportar contas:', error);
    return { success: false, message: `Erro ao exportar: ${error.message}` };
  }
});

// Importar contas de arquivo JSON
ipcMain.handle('import-accounts', async () => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Importar Contas',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const importData = JSON.parse(fileContent);

      if (!importData.accounts || !Array.isArray(importData.accounts)) {
        return { success: false, message: 'Arquivo inválido: formato de contas não encontrado' };
      }

      // Validar e processar contas importadas
      const importedAccounts = importData.accounts.map((account, index) => ({
        id: account.id || `imported-${Date.now()}-${index}`,
        name: account.name || `Conta Importada ${index + 1}`,
        avatar: account.avatar || null,
        active: false // Contas importadas começam inativas
      }));

      // Adicionar contas importadas às existentes
      const newAccounts = [...accounts, ...importedAccounts];
      
      // Salvar contas atualizadas
      writeAccounts(newAccounts);
      accounts = newAccounts;

      console.log(`📥 ${importedAccounts.length} contas importadas de: ${filePath}`);
      return { 
        success: true, 
        message: `${importedAccounts.length} contas importadas com sucesso!`,
        importedCount: importedAccounts.length
      };
    }
    return { success: false, message: 'Importação cancelada' };
  } catch (error) {
    console.error('❌ Erro ao importar contas:', error);
    return { success: false, message: `Erro ao importar: ${error.message}` };
  }
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
    writeAccounts(accounts);
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
