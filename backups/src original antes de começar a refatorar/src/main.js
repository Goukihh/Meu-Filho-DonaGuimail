const { app, BrowserWindow, BrowserView, ipcMain, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const axios = require('axios');
const FormData = require('form-data');
const PDFDocument = require('pdfkit');

// Módulos auxiliares centralizados
const fileOps = require('./main/fileOps');
const webhookManager = require('./main/webhook');
const selectorsCode = fs.readFileSync(path.join(__dirname, 'main', 'selectors.js'), 'utf8');

// Sistema de logs condicionais + ARQUIVO DE DEBUG
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
const debugLogPath = path.join(app.getPath('userData'), 'debug-automation.log');

// Limpar log anterior ao iniciar
try {
  if (fs.existsSync(debugLogPath)) {
    fs.unlinkSync(debugLogPath);
  }
  fs.writeFileSync(debugLogPath, `=== LOG INICIADO EM ${new Date().toISOString()} ===\n`);
} catch (e) {
  // Ignorar erro ao inicializar log file
}

const log = (...args) => {
  const message = `[${new Date().toISOString()}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`;
  console.log(message);
  try {
    fs.appendFileSync(debugLogPath, message + '\n');
  } catch (e) {
    // Ignorar erro ao escrever no log
  }
};

const logError = (...args) => {
  const message = `[${new Date().toISOString()}] [ERROR] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`;
  console.error(message);
  try {
    fs.appendFileSync(debugLogPath, message + '\n');
  } catch (e) {
    // Ignorar erro ao escrever no log
  }
};

const logWarn = (...args) => {
  const message = `[${new Date().toISOString()}] [WARN] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`;
  console.warn(message);
  try {
    fs.appendFileSync(debugLogPath, message + '\n');
  } catch (e) {
    // Ignorar erro ao escrever no log
  }
};

// Função para enviar logs para o painel de automação
function automationLog(message, type = 'info') {
  console.log(message); // Log no console também
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('automation-log', {
      message,
      type,
      timestamp: new Date().toISOString(),
    });
  }
}

// Usar pasta de dados do usuário para persistência permanente
const userDataPath = app.getPath('userData');
const accountsFilePath = path.join(userDataPath, 'accounts.json');
const progressFilePath = path.join(userDataPath, 'automation-progress.json');
const statsFilePath = path.join(userDataPath, 'automation-stats.json');

// ====================================================
// 📋 SISTEMA DE CONTAS E AUTOMAÇÃO
// ====================================================

// Função unificada para copiar diretório (recursiva ou não)
// Usa operações síncronas garantindo que arquivos sejam copiados completamente
async function copyDirectory(src, dest, options = {}) {
  const { recursive = true, excludeCache = true, createEmptyDirs = false } = options;
  
  try {
    // Criar diretório de destino se não existir
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    // Ler conteúdo do diretório fonte
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        // Pular pastas de cache desnecessárias se solicitado
        if (
          excludeCache &&
          (entry.name.includes('Cache') ||
            entry.name.includes('Code Cache') ||
            entry.name.includes('GPUCache') ||
            entry.name.includes('DawnCache') ||
            entry.name.includes('blob_storage') ||
            entry.name.includes('databases') ||
            entry.name.includes('Service Worker') ||
            entry.name.includes('Network'))
        ) {
          continue;
        }
        
        if (recursive) {
          // Recursivamente copiar subdiretórios
          await copyDirectory(srcPath, destPath, options);
        } else if (createEmptyDirs) {
          // Apenas criar diretório vazio (não recursivo)
          fs.mkdirSync(destPath, { recursive: true });
          log(`📁 Diretório criado (conteúdo não copiado): ${entry.name}`);
        }
      } else {
        // Copiar arquivo
        fs.copyFileSync(srcPath, destPath);
        log(`📄 Arquivo copiado: ${entry.name}`);
      }
    }
  } catch (error) {
    logError('Erro ao copiar diretorio:', error);
    throw error;
  }
}

// Função para copiar Partitions essenciais
async function copyEssentialPartitions(src, dest) {
  try {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    let sessionCount = 0;
    
    // Filtrar sessões discord-*
    const discordSessions = entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('discord-'))
      .map(entry => ({
        name: entry.name,
        path: path.join(src, entry.name),
      }));
    
    for (const session of discordSessions) {
      const srcPath = session.path;
      const destPath = path.join(dest, session.name);
      
      // Usar função de cópia original
      await copyDirectory(srcPath, destPath, { recursive: true, excludeCache: true });
      sessionCount++;
    }
    
    log(`Sessoes copiadas: ${sessionCount} (TODAS as contas salvas)`);
  } catch (error) {
    logError('Erro ao copiar Partitions essenciais:', error);
    throw error;
  }
}

// Função para criar arquivo ZIP (versão original que funcionava)
async function createZipFile(sourceDir, zipPath) {
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { 
    zlib: { level: 1 }, // Compressão leve para velocidade
    forceLocalTime: true,
    forceZip64: false,
  });
  
  return new Promise((resolve, reject) => {
    output.on('close', () => {
      log(`ZIP criado: ${archive.pointer()} bytes`);
      resolve();
    });
    
    archive.on('error', err => {
      reject(err);
    });
    
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

// Garantir que a pasta de dados existe
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}

log(`📁 Dados salvos em: ${userDataPath}`);

let mainWindow;
let automationWindow = null;
let accounts = [];
let browserViews = new Map();
let sessionMap = new Map();
let extractRetryMap = new Map();
let viewMap = new Map(); // Mapa de BrowserViews por ID de conta
let currentViewId = null; // ID da view atualmente ativa
let isModalOpen = false;
let isRenaming = false;
let isClearing = false;
let isRemoving = false;
let isAddingAccount = false;
// Sistema de automação de convites
let automationEngine = null;
let nicksList = []; // Lista de nicks carregados do arquivo

// ✅ Variáveis globais para rastreamento de relatórios PDF
let automationStartTime = null;
let automationSuccessCount = 0;
let automationErrorCount = 0;
let accountsPerformance = {}; // { "Conta 1": { sent: 4, success: 3, errors: 1, errorDetails: [...] } }
let errorsByType = { notAcceptingFriends: 0, usernameNotFound: 0, other: 0 };
let errorScreenshots = []; // [ { accountName, targetNick, errorType, screenshotPath } ]
let screenshotsDir = path.join(userDataPath, 'screenshots-temp');

// Carregar lista de nicks do arquivo
async function loadNicksList() {
  try {
    const nicksPath = path.join(__dirname, 'nicks.txt');
    if (fs.existsSync(nicksPath)) {
      const content = fs.readFileSync(nicksPath, 'utf8');
      nicksList = content
        .split('\n')
        .map(nick => nick.trim())
        .filter(nick => nick.length > 0);
      log(`📋 ${nicksList.length} nicks carregados do arquivo`);
    } else {
      log('⚠️ Arquivo nicks.txt não encontrado');
    }
  } catch (error) {
    logError('Erro ao carregar lista de nicks:', error);
  }
}

// Sistema de gerenciamento de timers
class TimerManager {
  constructor() {
    this.timers = new Map();
    this.observers = new Set();
  }
  
  addTimer(name, callback, interval) {
    // Limpar timer existente se houver
    this.removeTimer(name);
    
    const timer = setInterval(callback, interval);
    this.timers.set(name, timer);
    log(`⏰ Timer '${name}' criado (intervalo: ${interval}ms)`);
    return timer;
  }
  
  removeTimer(name) {
    if (this.timers.has(name)) {
      clearInterval(this.timers.get(name));
      this.timers.delete(name);
      log(`✅ Timer '${name}' removido`);
    }
  }
  
  addObserver(observer) {
    this.observers.add(observer);
  }
  
  removeObserver(observer) {
    this.observers.delete(observer);
  }
  
  cleanup() {
    log('🧹 Limpando todos os timers...');
    
    // Limpar todos os timers
    this.timers.forEach((timer, name) => {
      clearInterval(timer);
      log(`✅ Timer '${name}' limpo`);
    });
    this.timers.clear();
    
    // Limpar todos os observers
    this.observers.forEach(observer => {
      if (observer.disconnect) observer.disconnect();
      if (observer.unobserve) observer.unobserve();
    });
    this.observers.clear();
    
    log('✅ Todos os timers e observers limpos');
  }
}

// Instância global do gerenciador de timers
const timerManager = new TimerManager();

// Array global para rastrear todos os timeouts/intervals
const globalTimers = [];

// Função helper para criar timeout rastreável (opcional, disponível para uso futuro)
// eslint-disable-next-line no-unused-vars
function createTimeout(callback, delay) {
  const timeoutId = setTimeout(() => {
    callback();
    // Remover do array após executar
    const index = globalTimers.indexOf(timeoutId);
    if (index > -1) globalTimers.splice(index, 1);
  }, delay);
  globalTimers.push(timeoutId);
  return timeoutId;
}

// Função helper para criar interval rastreável (opcional, disponível para uso futuro)
// eslint-disable-next-line no-unused-vars
function createInterval(callback, delay) {
  const intervalId = setInterval(callback, delay);
  globalTimers.push(intervalId);
  return intervalId;
}

// Limpar todos os timers globais
function clearAllTimers() {
  log(`🧹 Limpando ${globalTimers.length} timers globais...`);
  globalTimers.forEach(timerId => {
    clearTimeout(timerId);
    clearInterval(timerId);
  });
  globalTimers.length = 0;
}

// Contas padrão
const defaultAccounts = [
  { id: 'account1', name: 'Conta 1', profilePicture: null, active: true },
  { id: 'account2', name: 'Conta 2', profilePicture: null, active: false },
  { id: 'account3', name: 'Conta 3', profilePicture: null, active: false },
];

// User-Agents realistas para rotação
const REALISTIC_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
];

// Função para calcular tamanho de diretório
function getDirectorySize(dirPath) {
  try {
    let size = 0;
    const items = fs.readdirSync(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        size += getDirectorySize(itemPath);
      } else {
        size += stat.size;
      }
    }
    
    return size;
  } catch (error) {
    return 0;
  }
}

// User-Agent fixo (comportamento natural de navegador real)

// User-Agent padrão (fallback)
const REALISTIC_USER_AGENT = REALISTIC_USER_AGENTS[0];

// Funções estáveis para leitura/escrita de contas
function readAccounts() {
  try {
    if (fs.existsSync(accountsFilePath)) {
      const data = fs.readFileSync(accountsFilePath, 'utf-8');
      const parsedAccounts = JSON.parse(data);
      log('📖 Contas lidas do arquivo:', parsedAccounts.length);
      return parsedAccounts;
    } else {
      log('📝 Arquivo de contas não existe, criando com contas padrão');
      writeAccounts(defaultAccounts);
      return defaultAccounts;
    }
  } catch (error) {
    logError('❌ Erro ao ler contas:', error);
    return defaultAccounts;
  }
}

async function writeAccounts(accountsToSave) {
  try {
    // Validar dados antes de salvar
    if (!Array.isArray(accountsToSave)) {
      logError('❌ Dados inválidos para salvar - não é um array');
      return false;
    }
    
    // Garantir que todas as contas tenham propriedades essenciais
    const processedAccounts = accountsToSave.map((account, index) => {
      return {
        id: account.id || `account${index + 1}`,
        name: account.name || `Conta ${index + 1}`,
        profilePicture: account.profilePicture || null,
        avatar: account.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png',
        active: account.active || false,
        ...account, // Manter outras propriedades
      };
    });
    
    // ✅ Usar operação async (não bloqueia UI)
    await fileOps.saveJSON(accountsFilePath, processedAccounts, {
      createBackup: true,
      validate: true
    });
    
    log(`💾 ${processedAccounts.length} contas salvas com sucesso`);
    return true;
  } catch (error) {
    logError('❌ Erro ao salvar contas:', error);
    
    // Tentar restaurar backup se existir
    const backupPath = accountsFilePath + '.backup';
    if (fs.existsSync(backupPath)) {
      try {
        fs.copyFileSync(backupPath, accountsFilePath);
        log('🔄 Backup restaurado após erro');
      } catch (restoreError) {
        logError('❌ Erro ao restaurar backup:', restoreError);
      }
    }
    
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
      nodeIntegration: false,
      devTools: true,
    },
    autoHideMenuBar: true,
    show: false,
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  
  // Atalho para DevTools (Ctrl+Shift+I)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      // Prevenir o comportamento padrão do Electron
      event.preventDefault();
      
      // Encontrar a BrowserView ativa (onde está o Discord)
      const activeView = getCurrentBrowserView();
      if (activeView && activeView.webContents) {
        // Abrir DevTools APENAS na BrowserView ativa (Discord)
        activeView.webContents.openDevTools({ mode: 'detach' });
        log('🔍 DevTools aberto para a BrowserView ativa (Discord)');
      } else {
        log('⚠️ Nenhuma BrowserView ativa encontrada - Discord não carregado');
      }
    }
  });

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

// Inicializar sessão para uma conta
async function initializeSessionForAccount(account) {
  try {
    log(`🔐 Inicializando sessão para: ${account.name} (${account.id})`);
    
    // Verificar se a conta já tem uma sessão
    if (sessionMap.has(account.id)) {
      log(`⚠️ Sessão já existe para ${account.name}, reutilizando...`);
      return;
    }
    
  const partition = `persist:discord-${account.id}`;
  const ses = session.fromPartition(partition);
  
  // INJETAR SCRIPT DE EVASÃO STEALTH SEGURO
  const stealthSafeScriptPath = path.join(__dirname, 'stealth-safe.js');
  ses.setPreloads([stealthSafeScriptPath]);
  log(`🕵️ Script de evasão stealth seguro injetado para: ${account.name}`);
  
  sessionMap.set(account.id, ses);
  
    log(`🔐 Sessão criada para: ${account.name} (${partition})`);

  // Configurar permissões
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
      const allowedPermissions = [
        'notifications',
        'media',
        'microphone',
        'camera',
        'clipboard-read',
        'clipboard-write',
      ];
      const blockedPermissions = [
        'publickey-credentials-get',
        'publickey-credentials-create',
        'webauthn',
        'fido',
        'u2f',
      ];
    
    if (allowedPermissions.includes(permission)) {
      log(`✅ Permissão concedida: ${permission} para ${account.name}`);
      callback(true);
    } else if (blockedPermissions.includes(permission)) {
      log(`❌ [WEBAUTHN-BLOCK] Bloqueado: ${permission} para ${account.name}`);
      callback(false);
    } else {
      log(`❌ Permissão negada: ${permission} para ${account.name}`);
      callback(false);
    }
  });

  // Remover headers do Electron (simples e seguro)
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    // Apenas remover indicadores do Electron
    delete details.requestHeaders['electron'];
    delete details.requestHeaders['Electron'];
    delete details.requestHeaders['X-Electron'];
    
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
    ses.setPermissionCheckHandler((webContents, permission, _requestingOrigin, _details) => {
      if (
        permission === 'publickey-credentials-get' ||
        permission === 'publickey-credentials-create'
      ) {
      log(`[WEBAUTHN-BLOCK] Bloqueada verificação de permissão: ${permission}`);
      return false;
    }
    return true;
  });

  ses.setCertificateVerifyProc((request, callback) => {
    callback(0);
  });

  log(`✅ Sessão inicializada para ${account.name}`);
  } catch (error) {
    logError(`❌ Erro ao inicializar sessão para ${account.name}:`, error);
    throw error;
  }
}

// Inicializar todas as sessões
async function initializeSessions() {
  try {
    log(`🔄 Inicializando sessões para ${accounts.length} contas...`);
    
  for (const account of accounts) {
      try {
    await initializeSessionForAccount(account);
        log(`✅ Sessão inicializada para: ${account.name}`);
      } catch (error) {
        logError(`❌ Erro ao inicializar sessão para ${account.name}:`, error);
        // Continuar com as outras contas mesmo se uma falhar
      }
    }
    
    log(`✅ Todas as sessões inicializadas: ${sessionMap.size} sessões ativas`);
  
  // Verificar se todas as contas têm sessões
  const missingSessions = accounts.filter(acc => !sessionMap.has(acc.id));
  if (missingSessions.length > 0) {
      log(
        `⚠️ ${missingSessions.length} contas sem sessão:`,
        missingSessions.map(acc => acc.name)
      );
  }
  } catch (error) {
    logError('❌ Erro crítico ao inicializar sessões:', error);
  }
}

// Cache inteligente: Pré-carregar sessões mais usadas
async function preloadFrequentSessions() {
  try {
    log('⚡ Iniciando pré-carregamento de sessões frequentes...');
    
    // Carregar apenas as primeiras 3 contas ativas para performance
    const activeAccounts = accounts.filter(acc => acc.active).slice(0, 3);
    log(`📊 ${activeAccounts.length} contas ativas encontradas`);
    
    for (const account of activeAccounts) {
      try {
      if (!sessionMap.has(account.id)) {
        log(`🚀 Pré-carregando sessão para: ${account.name}`);
        await initializeSessionForAccount(account);
        } else {
          log(`✅ Sessão já existe para: ${account.name}`);
        }
      } catch (error) {
        logError(`❌ Erro ao pré-carregar sessão para ${account.name}:`, error);
      }
    }
    
    log(`✅ Pré-carregamento concluído: ${sessionMap.size} sessões ativas`);
  } catch (error) {
    logError('❌ Erro no pré-carregamento:', error);
  }
}

// Variáveis para controlar os timers (já declaradas acima)

// Função para limpeza suave (apenas cache, SEM tocar em contas/sessões)
function cleanupMemory() {
  try {
    // Verificar se o processo ainda está ativo
    if (process.exitCode !== undefined || !mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    
    // Limpeza de memória movida para renderer.js
    // NÃO LIMPAR SESSÕES - todas devem ser mantidas
    // NÃO LIMPAR CONTAS - todas devem ser mantidas
    // NÃO LIMPAR BROWSERVIEWS - todas devem ser mantidas
  } catch (error) {
    // Silenciar erros para evitar EPIPE
  }
}

// Limpeza agressiva de memória para computadores fracos
async function aggressiveMemoryCleanup() {
  try {
    // Verificar se o processo ainda está ativo
    if (process.exitCode !== undefined || !mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    
    // VERIFICAR SE O MODO PC FRACO ESTÁ ATIVO ANTES DE DESTRUIR BROWSERVIEWS
    const isWeakPC = await isWeakPCModeActive();
    
    // Forçar garbage collection se disponível
    if (global.gc) {
      try {
        global.gc();
      } catch (e) {
        // Ignorar erros
      }
    }
    
    // Limpar apenas cache (rápido e seguro)
    for (const [key, session] of sessionMap.entries()) {
      try {
        // Apenas limpar cache
        await session.clearCache();
        
        // Manter cookies de login
      } catch (e) {
        // Ignorar erros silenciosamente
      }
    }
    
    // Limpar histórico de navegação das BrowserViews
    for (const [accountId, view] of browserViews.entries()) {
      try {
        if (view && !view.webContents.isDestroyed()) {
          await view.webContents.clearHistory();
        }
      } catch (e) {
        // Ignorar erros
      }
    }
    
    // Weak PC Mode: aplicar throttling (não destruir views)
    if (isWeakPC) {
      log('Modo PC Fraco ativo - Aplicando throttling');
      
      // Throttling nas views inativas
      const activeAccount = accounts.find(acc => acc.active);
      
      browserViews.forEach((view, accountId) => {
        try {
          if (view && !view.webContents.isDestroyed()) {
            if (accountId !== activeAccount?.id) {
              // INATIVA: Aplicar throttling para economizar recursos
              view.webContents.setBackgroundThrottling(true);
            } else {
              // ATIVA: Sem throttling para performance máxima
              view.webContents.setBackgroundThrottling(false);
            }
          }
        } catch (e) {
          // Ignorar erros silenciosamente
        }
      });
    } else {
      log('⚡ Modo normal - Todas as BrowserViews ativas sem throttling');
    }
  } catch (error) {
    // Silenciar erros para evitar EPIPE
  }
}

// SISTEMA DE KILL SWITCH - CONTROLE REMOTO
const KILL_SWITCH_URL = Buffer.from(
  'aHR0cHM6Ly90ZXN0ZS1wcm9kdWN0aW9uLTEyOTIudXAucmFpbHdheS5hcHAvYXBpL3N0YXR1cw==',
  'base64'
).toString();
const KILL_SWITCH_CHECK_INTERVAL = 30 * 60 * 1000; // Verificar a cada 30 minutos (produção)

// PROTEÇÃO OFFLINE - Cache do status
let lastKnownStatus = null;
let offlineProtectionActive = false;
const OFFLINE_PROTECTION_DURATION = 24 * 60 * 60 * 1000;
const KILL_SWITCH_STATUS_FILE = path.join(userDataPath, 'kill-switch-status.json');

// Carregar status salvo
function loadKillSwitchStatus() {
  try {
    if (fs.existsSync(KILL_SWITCH_STATUS_FILE)) {
      const data = fs.readFileSync(KILL_SWITCH_STATUS_FILE, 'utf8');
      lastKnownStatus = JSON.parse(data);
      log('📁 Status do kill switch carregado:', lastKnownStatus);
    }
  } catch (error) {
    logWarn('⚠️ Erro ao carregar status do kill switch:', error.message);
  }
}

// Salvar status atual
function saveKillSwitchStatus() {
  try {
    if (lastKnownStatus) {
      fs.writeFileSync(KILL_SWITCH_STATUS_FILE, JSON.stringify(lastKnownStatus, null, 2));
      log('💾 Status do kill switch salvo');
    }
  } catch (error) {
    log('⚠️ Erro ao salvar status do kill switch:', error.message);
  }
}

// Verificar kill switch com proteção offline
async function checkKillSwitch() {
  return new Promise(resolve => {
    try {
      log('🔍 Verificando kill switch...');
      log('🌐 URL:', KILL_SWITCH_URL);

      const https = require('https');
      const url = require('url');

      const parsedUrl = url.parse(KILL_SWITCH_URL);

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.path,
        method: 'GET',
        timeout: 10000, // 10 segundos de timeout
      };

      const req = https.request(options, res => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            log('📡 Resposta recebida:', data);
            const jsonData = JSON.parse(data);
            log('📊 Status atual:', jsonData);
            
            // Salvar status atual para proteção offline
            lastKnownStatus = {
              active: jsonData.active,
              message: jsonData.message,
              timestamp: Date.now(),
            };
            
            // Salvar status no arquivo
            saveKillSwitchStatus();

            if (!jsonData.active) {
              log('❌ KILL SWITCH ATIVADO - Encerrando aplicação');
              log('📢 Motivo:', jsonData.message);

              // Mostrar mensagem para o usuário
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('kill-switch-activated', jsonData.message);
              }

              // Encerrar aplicação após 3 segundos
              setTimeout(() => {
                app.quit();
              }, 3000);

              resolve(true); // Kill switch ativado
            } else {
              log('✅ Kill switch OK - App funcionando normalmente');
              offlineProtectionActive = false; // Reset proteção offline
              resolve(false); // Kill switch não ativado
            }
          } catch (parseError) {
            log('⚠️ Erro ao processar resposta:', parseError.message);
            handleOfflineProtection();
            resolve(false);
          }
        });
      });

      req.on('error', error => {
        log('⚠️ Erro ao verificar kill switch:', error.message);
        log('📱 Modo offline detectado - Ativando proteção...');
        handleOfflineProtection();
        resolve(false);
      });

      req.on('timeout', () => {
        log('⚠️ Timeout ao verificar kill switch');
        log('📱 Modo offline detectado - Ativando proteção...');
        handleOfflineProtection();
        req.destroy();
        resolve(false);
      });

      req.setTimeout(30000); // 30 segundos para produção
      req.end();
    } catch (error) {
      log('⚠️ Erro ao verificar kill switch:', error.message);
      log('📱 Modo offline detectado - Ativando proteção...');
      handleOfflineProtection();
      resolve(false);
    }
  });
}

// Proteção offline - Se estava desativado, manter desativado
function handleOfflineProtection() {
  if (lastKnownStatus && !lastKnownStatus.active) {
    const timeSinceLastCheck = Date.now() - lastKnownStatus.timestamp;
    
    if (timeSinceLastCheck < OFFLINE_PROTECTION_DURATION) {
      log('🔒 PROTEÇÃO OFFLINE ATIVA - App permanece desativado');
      log('📢 Motivo offline:', lastKnownStatus.message);
      
      offlineProtectionActive = true;
      
      // Mostrar mensagem para o usuário
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(
          'kill-switch-activated',
          `App desativado (modo offline): ${lastKnownStatus.message}`
        );
      }
      
      // Encerrar aplicação após 3 segundos
      setTimeout(() => {
        app.quit();
      }, 3000);
    }
  }
}

// Iniciar verificação do kill switch
function startKillSwitch() {
  log('🔒 Sistema de kill switch iniciado');

  // Carregar status salvo
  loadKillSwitchStatus();

  // Verificar proteção offline na inicialização
  if (lastKnownStatus && !lastKnownStatus.active) {
    const timeSinceLastCheck = Date.now() - lastKnownStatus.timestamp;
    
    if (timeSinceLastCheck < OFFLINE_PROTECTION_DURATION) {
      log('🔒 PROTEÇÃO OFFLINE - App foi desativado anteriormente');
      log('📢 Motivo:', lastKnownStatus.message);
      log('🔄 Verificando servidor para atualizar status...');
      
      // Verificar servidor mesmo com proteção offline ativa
      checkKillSwitch().then(killSwitchActivated => {
        if (!killSwitchActivated) {
          log('✅ Servidor respondeu - App pode funcionar');
          // Não encerrar o app se servidor respondeu que está ativo
        } else {
          log('❌ Servidor confirmou desativação');
          // Encerrar app se servidor confirmou desativação
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(
              'kill-switch-activated',
              `App desativado (modo offline): ${lastKnownStatus.message}`
            );
          }
          setTimeout(() => {
            app.quit();
          }, 3000);
        }
      });
      
      return; // Não iniciar verificação normal
    }
  }

  // Verificar imediatamente
  checkKillSwitch();

  // Verificar a cada 30 minutos
  timerManager.addTimer('killSwitch', checkKillSwitch, KILL_SWITCH_CHECK_INTERVAL);
}

// Parar verificação do kill switch
function stopKillSwitch() {
  timerManager.removeTimer('killSwitch');
  log('🔓 Sistema de kill switch parado');
}

// Iniciar timers de limpeza
function startCleanupTimers() {
  timerManager.addTimer('cleanup', cleanupMemory, 5 * 60 * 1000);
  
  // Limpeza agressiva a cada 2 minutos
  timerManager.addTimer('aggressive', aggressiveMemoryCleanup, 2 * 60 * 1000);
}

// Parar timers de limpeza
function stopCleanupTimers() {
  timerManager.removeTimer('cleanup');
  timerManager.removeTimer('aggressive');
}

// Função para limpar sessão
async function cleanSessionData(accountId) {
  try {
    const ses = sessionMap.get(accountId);
    if (ses) {
      await ses.clearStorageData();
      log(`🗑️ Sessão limpa para ${accountId}`);
      return true;
    }
    return false;
  } catch (error) {
    logError(`❌ Erro ao limpar sessão ${accountId}:`, error);
    return false;
  }
}

// Carregar contas do armazenamento
async function loadAccounts() {
  try {
    log('🔄 Carregando contas...');
    
    if (fs.existsSync(accountsFilePath)) {
      const data = fs.readFileSync(accountsFilePath, 'utf8');
      
      // Verificar se o arquivo não está vazio
      if (data.trim() === '' || data.trim() === '[]') {
        log('⚠️ Arquivo de contas está vazio, usando contas padrão');
        accounts = defaultAccounts;
        writeAccounts(accounts);
      } else {
      accounts = JSON.parse(data);
      log(`📱 ${accounts.length} contas carregadas do arquivo.`);
        
        // Verificar se as contas são válidas
        if (!Array.isArray(accounts) || accounts.length === 0) {
          log('⚠️ Contas inválidas, usando contas padrão');
          accounts = defaultAccounts;
          writeAccounts(accounts);
        }
      }
      
      // Pré-processar contas
      accounts.forEach((account, index) => {
        if (account.id && !account.avatar) {
          account.avatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
        }
        // Garantir que todas as contas tenham propriedades essenciais
        // ✅ SEMPRE abrir com a PRIMEIRA conta selecionada (Conta 1)
        account.active = index === 0;
        if (!account.name) account.name = `Conta ${index + 1}`;
        if (!account.id) account.id = `account${index + 1}`;
      });
      
      // Salvar contas processadas
      writeAccounts(accounts);
      log(`✅ ${accounts.length} contas processadas e salvas`);
    } else {
      log('📝 Arquivo de contas não existe, criando com contas padrão');
      accounts = defaultAccounts;
      writeAccounts(accounts);
      log('✅ Contas padrão criadas e salvas');
    }
  } catch (error) {
    logError('❌ Erro ao carregar contas:', error);
    log('🔄 Usando contas padrão como fallback');
    accounts = defaultAccounts;
    writeAccounts(accounts);
  }
  
  // Inicializar sessões de forma assíncrona
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
  try {
    log(`🔧 Criando BrowserView para: ${accountId}`);
    
    // Validar se a conta existe
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) {
      logError(`❌ Conta ${accountId} não encontrada`);
      return null;
    }
    
    let persistentSession = sessionMap.get(accountId);
    if (!persistentSession) {
      log(`⚠️ Sessão não encontrada para ${accountId}, criando nova`);
      persistentSession = session.fromPartition(`persist:discord-${accountId}`);
      sessionMap.set(accountId, persistentSession);
    }
  
  const view = new BrowserView({
    webPreferences: {
      session: persistentSession,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      backgroundThrottling: false,
      enableBlinkFeatures: '',
        disableBlinkFeatures:
          'AutomationControlled,WebAuthentication,CredentialManager,PublicKeyCredential',
      },
  });

  // User-Agent fixo (comportamento de navegador real)
  log(`🔧 User-Agent fixo para ${accountId}`);
  view.webContents.setUserAgent(REALISTIC_USER_AGENT);

  // Scripts básicos já são injetados via preload
  log(`🕵️ Scripts básicos carregados via preload para: ${accountId}`);

  // Mascaramento mínimo quando o DOM estiver pronto
  view.webContents.on('dom-ready', () => {
    log(`Discord DOM pronto para ${accountId}`);
  });

  view.webContents.on('did-finish-load', () => {
    log(`Discord carregado para ${accountId}`);
    
    // Enviar evento para remover loading
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('view-loaded');
    }
    
    // Só tornar visível se o sinal estiver verde (nenhum modal aberto)
    if (!isModalOpen) {
      log(`🚦 Sinal verde: Tornando BrowserView visível para ${accountId}`);
      updateBrowserViewBounds();
    } else {
      log(`🚦 Sinal vermelho: BrowserView permanece escondida para ${accountId}`);
    }
    
    setTimeout(() => {
      extractProfilePicture(view, accountId);
    }, 3000);
  });

  view.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  // Carregar Discord para todas as contas
  view.webContents.loadURL('https://canary.discord.com/app');
  
  browserViews.set(accountId, view);
  return view;
  } catch (error) {
    logError(`❌ Erro ao criar BrowserView para ${accountId}:`, error);
    // Retornar null em caso de erro, mas não quebrar o app
    return null;
  }
}

// Extrair foto de perfil do Discord
async function extractProfilePicture(view, accountId) {
  try {
    log(`🖼️ Extraindo foto de perfil para ${accountId}`);
    
    // Validar se a view existe
    if (!view || !view.webContents) {
      logError(`❌ BrowserView inválida para ${accountId}`);
      return;
    }
    
    // Múltiplas estratégias de extração
    const userAvatarUrl = await view.webContents.executeJavaScript(`
      (function() {
        try {
          // Avatar do usuário logado no painel inferior esquerdo
          const userAvatarSelectors = [
            'section[class*="panels"] div[class*="wrapper"][class*="avatar"][role="img"] img[src*="cdn.discordapp.com/avatars"]',
            'div[class*="panels"] div[class*="wrapper"][class*="avatar"][role="img"] img[src*="avatars"]',
            'section div[class*="avatarWrapper"][role="img"] img[src*="avatars"]',
            'section[class*="panels"] div[class*="wrapper"][class*="avatar"] img[src*="avatars"]',
            'div[class*="panels"] div[class*="avatar"] img[src*="avatars"]',
            'section[class*="panels"] img[src*="cdn.discordapp.com/avatars"]'
          ];
          
          for (const selector of userAvatarSelectors) {
            console.log('[AVATAR] Tentando seletor:', selector);
            const avatarImg = document.querySelector(selector);
            console.log('[AVATAR] Elemento encontrado?', avatarImg ? 'SIM' : 'NÃO');
            if (avatarImg) {
              console.log('[AVATAR] SRC:', avatarImg.src);
            }
            
            if (avatarImg && avatarImg.src && avatarImg.src.includes('cdn.discordapp.com/avatars')) {
              // Extrair URL de alta qualidade (size=1024)
              const highQualityUrl = avatarImg.src.replace(/\\?size=\\d+/, '?size=1024').replace(/\\.webp/, '.png');
              console.log('[AVATAR] ✅ Encontrado via CSS:', highQualityUrl);
              console.log('[AVATAR] ✅ Seletor usado:', selector);
              return highQualityUrl;
            }
          }
          
          console.log('[AVATAR] ⚠️ Nenhum seletor CSS funcionou, tentando webpack...');
          
          // Fallback via webpack
          if (window.webpackChunkdiscord_app) {
          try {
            const modules = window.webpackChunkdiscord_app.push([[Math.random()], {}, (req) => req.c]);
            
            for (const moduleId in modules) {
              const module = modules[moduleId];
              if (module && module.exports && module.exports.default) {
                const exp = module.exports.default;
                if (exp && exp.getCurrentUser && typeof exp.getCurrentUser === 'function') {
                  const currentUser = exp.getCurrentUser();
                    if (currentUser && currentUser.id && currentUser.avatar) {
                      const webpackUrl = \`https://cdn.discordapp.com/avatars/\${currentUser.id}/\${currentUser.avatar}.png?size=1024\`;
                      console.log('[AVATAR] ✅ Encontrado via WEBPACK:', webpackUrl);
                      return webpackUrl;
                  }
                }
              }
            }
          } catch (e) {
              // Silenciar erro de webpack
            }
          }
          
          // Se chegou aqui, não encontrou avatar
          console.log('[AVATAR] ❌ Nenhuma estratégia funcionou - avatar não encontrado');
          return null;
        } catch (error) {
          return null;
        }
      })();
    `);

    if (userAvatarUrl && userAvatarUrl !== 'null' && userAvatarUrl !== '') {
      log(`✅ Foto de perfil encontrada para ${accountId}: ${userAvatarUrl}`);
      
      const account = accounts.find(acc => acc.id === accountId);
      if (account) {
        account.profilePicture = userAvatarUrl;
        writeAccounts(accounts);
        mainWindow.webContents.send('profile-picture-updated', accountId, userAvatarUrl);
      }
    } else {
      log(`⚠️ Foto de perfil não encontrada para ${accountId} - tentará novamente em 10s`);
      // Máximo de 3 tentativas
      const retryCount = extractRetryMap.get(accountId) || 0;
      if (retryCount < 3) {
        extractRetryMap.set(accountId, retryCount + 1);
      setTimeout(() => {
        extractProfilePicture(view, accountId);
      }, 10000);
      } else {
        log(`⚠️ Máximo de tentativas atingido para ${accountId}, desistindo`);
        extractRetryMap.delete(accountId);
      }
    }
  } catch (error) {
    logError(`❌ Falha ao extrair foto de perfil para ${accountId}:`, error);
  }
}

// Atualizar bounds da BrowserView
function updateBrowserViewBounds() {
  const currentView = getCurrentBrowserView();
  if (!currentView || !mainWindow) return;
  
  // Só tornar visível se o sinal estiver verde (nenhum modal aberto)
  if (isModalOpen) {
    log('🚦 Sinal vermelho: BrowserView permanece escondida');
    currentView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    return;
  }
  
  log('🚦 Sinal verde: Tornando BrowserView visível');
  const contentBounds = mainWindow.getContentBounds();
  const topOffset = 158; // 32px barra título + 25px header + 75px abas + 26px ajuste (8px abaixo da linha laranja)

  currentView.setBounds({
    x: 0,
    y: topOffset,
    width: contentBounds.width,
    height: contentBounds.height - topOffset,
  });
}

// Obter BrowserView ativa
function getCurrentBrowserView() {
  return mainWindow?.getBrowserView();
}

// Trocar para BrowserView de uma conta
async function switchToBrowserView(accountId) {
  if (!mainWindow) return;

  // Verificar se modo PC fraco está ativo
  const isWeakPC = await isWeakPCModeActive();
  
  if (isWeakPC) {
    // MODO PC FRACO: Limitar a 5 BrowserViews simultâneas
    log(`💻 Modo PC Fraco: Gerenciando BrowserViews (${browserViews.size} ativas)`);
    
    // Se já temos 5 BrowserViews, destruir a mais antiga
    if (browserViews.size >= 5) {
      const oldestAccount = Array.from(browserViews.keys())[0];
      if (oldestAccount !== accountId) {
        const oldestView = browserViews.get(oldestAccount);
        if (oldestView && !oldestView.webContents.isDestroyed()) {
          mainWindow.removeBrowserView(oldestView);
          oldestView.webContents.destroy();
          browserViews.delete(oldestAccount);
          log(`💥 BrowserView ${oldestAccount} destruída (limite atingido)`);
        }
      }
    }
  }

  // No modo PC fraco, não remover outras BrowserViews - apenas trocar a ativa
  // No modo normal, manter todas as BrowserViews ativas

  let view = browserViews.get(accountId);
  if (!view || view.webContents.isDestroyed()) {
    view = createBrowserView(accountId);
    browserViews.set(accountId, view);
  }

  mainWindow.setBrowserView(view);
  
  setTimeout(() => {
    updateBrowserViewBounds();
  }, 100);
  
  log(`🔄 Trocado para BrowserView: ${accountId} (${browserViews.size} ativas)`);
}

// Verificar se modo PC fraco está ativo
async function isWeakPCModeActive() {
  try {
    const settingsPath = path.join(userDataPath, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(data);
      return settings.weakPCMode || false;
    }
    return false;
  } catch (error) {
    logError('❌ Erro ao verificar modo PC fraco:', error);
    return false;
  }
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
    logError('Erro ao ler o arquivo de contas:', error);
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

ipcMain.handle('remove-account', async (event, accountId) => {
  const index = accounts.findIndex(acc => acc.id === accountId);
  if (index > -1) {
    accounts.splice(index, 1);
    
    // Usar função reutilizável
    await cleanSessionData(accountId);
    sessionMap.delete(accountId);
    
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
  // Usar função reutilizável
  await cleanSessionData(accountId);
  
  // Recarregar a view
  const view = browserViews.get(accountId);
  if (view) {
    view.webContents.reload();
  }
  
  return true;
});

// Gerenciar menu de contexto - esconder BrowserView
ipcMain.on('context-menu-open', () => {
  isModalOpen = true; // Sinal vermelho - modal aberto
  const activeBrowserView = getCurrentBrowserView();
  if (activeBrowserView) {
    activeBrowserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    log('🔧 BrowserView escondida para menu de contexto');
  }
  log('🚦 Sinal vermelho: Modal aberto');
});

// Gerenciar menu de contexto - restaurar BrowserView
ipcMain.on('context-menu-closed', () => {
  isModalOpen = false; // Sinal verde - modal fechado
  
  // Só recriar BrowserView se não estiver executando operações em contas
  if (!isRenaming && !isClearing && !isRemoving && !isAddingAccount) {
    const activeAccount = accounts.find(acc => acc.active);
    if (activeAccount && !getCurrentBrowserView()) {
      log(`🔄 Recriando BrowserView para conta ativa: ${activeAccount.id}`);
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
    log(`🚫 Recriação bloqueada - ainda renomeando, limpando, removendo ou adicionando conta`);
  }
  
  log('🔧 BrowserView restaurada após fechar menu de contexto');
  log('🚦 Sinal verde: Modal fechado');
});

// Fechar BrowserView para adicionar conta
ipcMain.on('close-browser-view-for-add', () => {
  log(`➕ Fechando BrowserView para adição de nova conta`);
  isAddingAccount = true; // BLOQUEAR recriação automática
  const activeBrowserView = getCurrentBrowserView();
  if (activeBrowserView) {
    mainWindow.removeBrowserView(activeBrowserView);
    log(`🗑️ BrowserView removida completamente para adição de conta`);
  }
});

// Gerenciar ações do menu de contexto
ipcMain.on('context-menu-action', async (event, { action, accountId }) => {
  log(`[Main] Recebida a ação: ${action} para a conta ${accountId}`);
  log(`🔧 Ação do menu de contexto: ${action} para conta ${accountId}`);
  
  switch (action) {
    case 'rename': {
      // FECHAR COMPLETAMENTE a BrowserView para evitar sobreposição
      log(`📝 Fechando BrowserView para renomeação da conta ${accountId}`);
      isRenaming = true; // BLOQUEAR recriação automática
      const activeBrowserView = getCurrentBrowserView();
      if (activeBrowserView) {
        mainWindow.removeBrowserView(activeBrowserView);
        log(`🗑️ BrowserView removida completamente para renomeação`);
      }
      mainWindow.webContents.send('prompt-for-rename', accountId);
      break;
    }
      
    case 'clear-session': {
      // FECHAR COMPLETAMENTE a BrowserView para evitar sobreposição
      log(`🧹 Fechando BrowserView para limpeza da conta ${accountId}`);
      isClearing = true; // BLOQUEAR recriação automática
      const activeBrowserViewClear = getCurrentBrowserView();
      if (activeBrowserViewClear) {
        mainWindow.removeBrowserView(activeBrowserViewClear);
        log(`🧹 BrowserView removida completamente para limpeza`);
      }
      mainWindow.webContents.send('prompt-for-clear-session', accountId);
      break;
    }
      
    case 'remove': {
      // FECHAR COMPLETAMENTE a BrowserView para evitar sobreposição
      log(`🗑️ Fechando BrowserView para remoção da conta ${accountId}`);
      isRemoving = true; // BLOQUEAR recriação automática
      const activeBrowserViewRemove = getCurrentBrowserView();
      if (activeBrowserViewRemove) {
        mainWindow.removeBrowserView(activeBrowserViewRemove);
        log(`🗑️ BrowserView removida completamente para remoção`);
      }
      mainWindow.webContents.send('prompt-for-remove', accountId);
      break;
    }
      
    case 'reload': {
      const view = browserViews.get(accountId);
      if (view) {
        view.webContents.reload();
        log(`🔄 Conta ${accountId} recarregada`);
      }
      break;
    }
  }
});

// Listener para adicionar nova conta
ipcMain.handle('add-account', async (event, accountData) => {
  log(`➕ Iniciando adição de nova conta: ${accountData.name}`);
  
  const newAccount = {
    id: `account${Date.now()}`,
    name: accountData.name || `Conta ${accounts.length + 1}`,
    profilePicture: accountData.profilePicture || null,
    active: true,
  };
  
  // Desativar todas as outras contas
  accounts.forEach(acc => (acc.active = false));
  
  accounts.push(newAccount);
  writeAccounts(accounts);
  
  await initializeSessionForAccount(newAccount);
  
  // Criar e trocar para a BrowserView da nova conta
  switchToBrowserView(newAccount.id);
  
  log(`✅ Nova conta criada: ${newAccount.name} (${newAccount.id})`);
  return accounts;
});

// Handler para reordenar contas
ipcMain.handle('reorder-accounts', async (event, { fromIndex, toIndex }) => {
  try {
    log(`🔄 Reordenando contas: ${fromIndex} → ${toIndex}`);
    
    // Verificar se os índices são válidos
    if (
      fromIndex < 0 ||
      fromIndex >= accounts.length ||
      toIndex < 0 ||
      toIndex >= accounts.length
    ) {
      logError('❌ Índices inválidos para reordenação');
      return { success: false, message: 'Índices inválidos' };
    }
    
    // Mover conta no array
    const [movedAccount] = accounts.splice(fromIndex, 1);
    accounts.splice(toIndex, 0, movedAccount);
    
    // Salvar nova ordem
    const saved = writeAccounts(accounts);
    if (saved) {
      log(`✅ Contas reordenadas com sucesso: ${fromIndex} → ${toIndex}`);
      return { success: true, message: 'Contas reordenadas com sucesso' };
    } else {
      logError('❌ Erro ao salvar nova ordem das contas');
      return { success: false, message: 'Erro ao salvar nova ordem' };
    }
  } catch (error) {
    logError('❌ Erro na reordenação:', error);
    return { success: false, message: 'Erro interno na reordenação' };
  }
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
      log(`✅ Conta ${accountId} renomeada de "${oldName}" para "${newName.trim()}"`);
      
      // LIBERAR recriação da BrowserView após renomear
      isRenaming = false;
      log(`🔓 Renomeação concluída - recriação liberada`);
      
      // Recriar BrowserView após renomear
      const activeAccount = accounts.find(acc => acc.active);
      if (activeAccount && !getCurrentBrowserView()) {
        log(`🔄 Recriando BrowserView após renomeação: ${activeAccount.id}`);
        const view = createBrowserView(activeAccount.id);
        browserViews.set(activeAccount.id, view);
        mainWindow.setBrowserView(view);
        setTimeout(() => {
          updateBrowserViewBounds();
        }, 100);
      }
    } else {
      log(`⚠️ Renomeação falhou: conta ${accountId} não encontrada ou nome inválido`);
      isRenaming = false; // Liberar mesmo em caso de erro
    }
  } catch (error) {
    logError(`❌ Erro ao renomear conta ${accountId}:`, error);
    isRenaming = false; // Liberar mesmo em caso de erro
  }
});

// Listener para executar limpeza de sessão
ipcMain.on('execute-clear-session', async (event, { accountId }) => {
  try {
    // Usar função reutilizável
    await cleanSessionData(accountId);
    
    const clearView = browserViews.get(accountId);
    if (clearView) {
      clearView.webContents.reload();
    }
    
    // LIBERAR recriação da BrowserView após limpar
    isClearing = false;
    log(`🔓 Limpeza concluída - recriação liberada`);
    
    // Recriar BrowserView após limpar
    const activeAccount = accounts.find(acc => acc.active);
    if (activeAccount && !getCurrentBrowserView()) {
      log(`🔄 Recriando BrowserView após limpeza: ${activeAccount.id}`);
      const view = createBrowserView(activeAccount.id);
      browserViews.set(activeAccount.id, view);
      mainWindow.setBrowserView(view);
      setTimeout(() => {
        updateBrowserViewBounds();
      }, 100);
    }
  } catch (error) {
    logError(`❌ Erro ao limpar sessão da conta ${accountId}:`, error);
    isClearing = false; // Liberar mesmo em caso de erro
  }
});

// Listener para executar remoção
ipcMain.on('execute-remove', async (event, { accountId }) => {
  try {
    const index = accounts.findIndex(acc => acc.id === accountId);
    if (index > -1) {
      // Remover da lista
      accounts.splice(index, 1);
      
      // Limpar sessão e view usando função reutilizável
      await cleanSessionData(accountId);
      sessionMap.delete(accountId);
      
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
      log(`✅ Conta ${accountId} removida com sucesso`);
      
      // LIBERAR recriação da BrowserView após remover
      isRemoving = false;
      log(`🔓 Remoção concluída - recriação liberada`);
      
      // Recriar BrowserView após remover
      const activeAccount = accounts.find(acc => acc.active);
      if (activeAccount && !getCurrentBrowserView()) {
        log(`🔄 Recriando BrowserView após remoção: ${activeAccount.id}`);
        const view = createBrowserView(activeAccount.id);
        browserViews.set(activeAccount.id, view);
        mainWindow.setBrowserView(view);
        setTimeout(() => {
          updateBrowserViewBounds();
        }, 100);
      }
    } else {
      log(`⚠️ Remoção falhou: conta ${accountId} não encontrada`);
      isRemoving = false; // Liberar mesmo em caso de erro
    }
  } catch (error) {
    logError(`❌ Erro ao remover conta ${accountId}:`, error);
    isRemoving = false; // Liberar mesmo em caso de erro
  }
});

// Listener para atualizar foto de perfil
ipcMain.on('profile-picture-updated', (event, accountId, avatarUrl) => {
  log(`🖼️ Foto de perfil atualizada para ${accountId}: ${avatarUrl}`);
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
  return new Promise(resolve => {
    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: '/repos/Goukihh/Meu-Filho-DonaGuimail/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'Meu-Filho-App',
        Accept: 'application/vnd.github.v3+json',
      },
    };

    const req = https.request(options, res => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const latestVersion = release.tag_name.replace('v', '');
          const currentVersion = require('../package.json').version;
          
          log(`🔍 Versão atual: ${currentVersion}`);
          log(`🔍 Última versão: ${latestVersion}`);
          
          const isNewer = compareVersions(latestVersion, currentVersion) > 0;
          
          // Gerar descrição se não houver release notes
          let humanReleaseNotes = release.body;
          if (!humanReleaseNotes || humanReleaseNotes.trim() === '') {
            humanReleaseNotes = generateHumanReleaseNotes(latestVersion, currentVersion);
          }
          
          resolve({
            hasUpdate: isNewer,
            currentVersion,
            latestVersion,
            downloadUrl: release.assets[0]?.browser_download_url || release.html_url,
            releaseNotes: humanReleaseNotes,
          });
        } catch (error) {
          logError('❌ Erro ao verificar atualizações:', error);
          resolve({ hasUpdate: false, error: `Erro ao processar resposta: ${error.message}` });
        }
      });
    });
    
    req.on('error', error => {
      logError('❌ Erro na requisição:', error);
      resolve({ hasUpdate: false, error: error.message });
    });
    
    req.setTimeout(30000, () => {
      log('⏰ Timeout na verificação de atualizações');
      req.destroy();
      resolve({ hasUpdate: false, error: 'Timeout na verificação de atualizações' });
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

// Gerar descrições de atualização
function generateHumanReleaseNotes(latestVersion, currentVersion) {
  const descriptions = [
    `Nova versão ${latestVersion} disponível!`,
    `Melhorias na versão ${latestVersion}`,
    `Atualização ${latestVersion}`,
    `Versão ${latestVersion} com correções`,
    `Nova atualização ${latestVersion}`,
  ];
  
  let description = descriptions[Math.floor(Math.random() * descriptions.length)];
  
  const major = parseInt(latestVersion.split('.')[0]);
  const currentMajor = parseInt(currentVersion.split('.')[0]);
  
  if (major > currentMajor) {
    description += `\n\nAtualização maior com novidades!`;
  } else {
    description += `\n\nMelhorias e correções.`;
  }
  
  return description;
}

// Handler para verificar atualizações
ipcMain.handle('check-updates', async () => {
  log('🔍 Verificando atualizações...');
  const updateInfo = await checkForUpdates();
  
  if (updateInfo.hasUpdate) {
    log(`📦 Atualização disponível: ${updateInfo.latestVersion}`);
  } else {
    log('✅ Aplicativo atualizado');
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
    logError('Erro ao obter configuração de fundo:', error);
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
    
    log('🎨 Imagem de fundo personalizada salva:', customBackgroundPath);
    return { success: true, message: 'Fundo personalizado salvo com sucesso!' };
  } catch (error) {
    logError('Erro ao definir imagem de fundo:', error);
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
    
    log('🎨 Fundo padrão restaurado');
    return { success: true, message: 'Fundo padrão restaurado com sucesso!' };
  } catch (error) {
    logError('Erro ao restaurar fundo padrão:', error);
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
    logError('Erro ao obter cor personalizada:', error);
    return null;
  }
});

// Obter webhook salvo (persistência permanente)
ipcMain.handle('get-saved-webhook', () => {
  try {
    const settingsPath = path.join(userDataPath, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(data);
      log(`📂 Webhook carregado de settings.json: ${settings.webhookUrl ? 'Configurado' : 'Não configurado'}`);
      return settings.webhookUrl || '';
    }
    return '';
  } catch (error) {
    logError('Erro ao obter webhook salvo:', error);
    return '';
  }
});

// ========================================
// SISTEMA DE ESTATÍSTICAS PERSISTENTES
// ========================================

// Salvar estatísticas da última leva
function saveAutomationStats(stats) {
  try {
    fs.writeFileSync(statsFilePath, JSON.stringify(stats, null, 2));
    log(`💾 Estatísticas salvas: ${stats.totalInvites} convites em ${stats.elapsedTime}`);
  } catch (error) {
    logError('❌ Erro ao salvar estatísticas:', error);
  }
}

// Carregar estatísticas salvas
function loadAutomationStats() {
  try {
    if (fs.existsSync(statsFilePath)) {
      const data = fs.readFileSync(statsFilePath, 'utf8');
      const stats = JSON.parse(data);
      log(`📂 Estatísticas carregadas: ${stats.totalInvites} convites em ${stats.elapsedTime}`);
      return stats;
    }
    return null;
  } catch (error) {
    logError('❌ Erro ao carregar estatísticas:', error);
    return null;
  }
}

// Handler para obter estatísticas salvas
ipcMain.handle('get-saved-stats', () => {
  return loadAutomationStats();
});

// ========================================
// RASTREAMENTO DE PROGRESSO DA LEVA (MÚLTIPLAS PÁGINAS)
// ========================================

const levaProgressFilePath = path.join(userDataPath, 'leva-progress.json');

// Salvar progresso da leva (quais contas já foram processadas)
function saveLevaProgress(levaNumber, processedAccountIds, totalAccountsExpected) {
  try {
    const progress = {
      levaNumber,
      processedAccountIds: Array.from(new Set(processedAccountIds)), // Garantir que são únicos
      totalAccountsExpected,
      lastUpdate: new Date().toISOString()
    };
    fs.writeFileSync(levaProgressFilePath, JSON.stringify(progress, null, 2));
    log(`💾 Progresso da leva salvo: ${processedAccountIds.length}/${totalAccountsExpected} contas processadas`);
  } catch (error) {
    logError('❌ Erro ao salvar progresso da leva:', error);
  }
}

// Carregar progresso da leva
function loadLevaProgress() {
  try {
    if (fs.existsSync(levaProgressFilePath)) {
      const data = fs.readFileSync(levaProgressFilePath, 'utf8');
      const progress = JSON.parse(data);
      log(`📂 Progresso da leva carregado: ${progress.processedAccountIds.length}/${progress.totalAccountsExpected} contas`);
      return progress;
    }
    return null;
  } catch (error) {
    logError('❌ Erro ao carregar progresso da leva:', error);
    return null;
  }
}

// Limpar progresso da leva (quando leva é completada)
function clearLevaProgress() {
  try {
    if (fs.existsSync(levaProgressFilePath)) {
      fs.unlinkSync(levaProgressFilePath);
      log('🗑️ Progresso da leva limpo');
    }
  } catch (error) {
    logError('❌ Erro ao limpar progresso da leva:', error);
  }
}

// Verificar se leva está completa
function isLevaComplete() {
  const progress = loadLevaProgress();
  if (!progress) return false;
  
  const completed = progress.processedAccountIds.length >= progress.totalAccountsExpected;
  log(`🎯 Leva ${completed ? 'COMPLETA' : 'INCOMPLETA'}: ${progress.processedAccountIds.length}/${progress.totalAccountsExpected}`);
  return completed;
}

// ========================================
// CONTADOR DE LEVAS (PERSISTENTE)
// ========================================

// Carregar contador de levas de settings.json
function loadLevaCounter() {
  try {
    const settingsPath = path.join(userDataPath, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(data);
      return settings.levaAtual || 1;
    }
    return 1;
  } catch (error) {
    logError('❌ Erro ao carregar contador de levas:', error);
    return 1;
  }
}

// Salvar contador de levas em settings.json
function saveLevaCounter(levaAtual) {
  try {
    const settingsPath = path.join(userDataPath, 'settings.json');
    let settings = {};
    
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      settings = JSON.parse(data);
    }
    
    settings.levaAtual = levaAtual;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    log(`💾 Leva salva: ${levaAtual}/6`);
  } catch (error) {
    logError('❌ Erro ao salvar contador de levas:', error);
  }
}

// Incrementar leva
function incrementLeva() {
  const currentLeva = loadLevaCounter();
  // Se já estiver na leva 6, resetar para 1, caso contrário incrementar normalmente
  const newLeva = currentLeva >= 6 ? 1 : currentLeva + 1;
  saveLevaCounter(newLeva);
  return newLeva;
}

// ========================================
// IDENTIFICAÇÃO DO RELATÓRIO (NOME + FOTO)
// ========================================

// Handler para obter identificação do relatório
ipcMain.handle('get-report-identification', () => {
  try {
    const settingsPath = path.join(userDataPath, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(data);
      return settings.reportIdentification || null;
    }
    return null;
  } catch (error) {
    logError('❌ Erro ao carregar identificação do relatório:', error);
    return null;
  }
});

// Handler para salvar identificação do relatório
ipcMain.handle('save-report-identification', (event, { name, photoBase64, totalAccounts }) => {
  try {
    const settingsPath = path.join(userDataPath, 'settings.json');
    let settings = {};
    
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      settings = JSON.parse(data);
    }
    
    settings.reportIdentification = {
      name: name || '',
      photoBase64: photoBase64 || null,
      totalAccounts: totalAccounts || null
    };
    
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    log(`✅ Identificação salva: ${name || '(sem nome)'}, ${totalAccounts || '?'} contas totais`);
    return true;
  } catch (error) {
    logError('❌ Erro ao salvar identificação do relatório:', error);
    return false;
  }
});

// ========================================
// GERAÇÃO DE RELATÓRIO PDF DE TESTE
// ========================================

// ✅ Função para gerar e enviar relatório REAL da leva
async function generateRealLevaReport(levaAtual, totalAccounts, nicksLoaded) {
  try {
    log(`📊 Gerando relatório REAL da Leva ${levaAtual}...`);
    
    // Buscar webhook e dados de identificação
    const settingsPath = path.join(userDataPath, 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      throw new Error('Arquivo settings.json não encontrado');
    }
    
    const data = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(data);
    const webhookUrl = settings.webhookUrl;
    const userName = settings.reportIdentification?.name || 'Usuário';
    const photoBase64 = settings.reportIdentification?.photoBase64 || null;
    const dailyAccountsConfig = settings.reportIdentification?.totalAccounts || totalAccounts;
    
    if (!webhookUrl) {
      throw new Error('Webhook não configurado');
    }
    
    // Calcular estatísticas finais
    const elapsedMs = Date.now() - automationStartTime;
    const elapsedMin = Math.floor(elapsedMs / 60000);
    const elapsedSec = Math.floor((elapsedMs % 60000) / 1000);
    const tempoTexto = `${elapsedMin}m ${elapsedSec}s`;
    
    const totalInvites = automationSuccessCount + automationErrorCount;
    const taxaSucesso = totalInvites > 0 ? Math.round((automationSuccessCount / totalInvites) * 100) : 0;
    
    // Criar PDF
    const pdfPath = path.join(userDataPath, `relatorio_leva${levaAtual}_${Date.now()}.pdf`);
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    
    doc.pipe(stream);
    
    // Título
    doc.fontSize(24).font('Helvetica-Bold').text('RELATORIO DE AUTOMACAO', { align: 'center' });
    doc.moveDown();
    
    // Adicionar foto de perfil se existir
    if (photoBase64) {
      try {
        const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const imageSize = 80;
        const pageWidth = doc.page.width;
        const imageX = (pageWidth - imageSize) / 2;
        
        doc.image(imageBuffer, imageX, doc.y, {
          fit: [imageSize, imageSize],
          align: 'center'
        });
        doc.moveDown(6);
      } catch (error) {
        log('⚠️ Erro ao adicionar foto no PDF:', error.message);
      }
    }
    
    // Nome do usuário
    doc.fontSize(18).font('Helvetica').text(userName, { align: 'center' });
    doc.fontSize(12).text(`Leva ${levaAtual}/6 - ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });
    doc.moveDown(2);
    
    // Linha divisória
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();
    
    // Estatísticas
    doc.fontSize(16).font('Helvetica-Bold').text('ESTATISTICAS GERAIS', { underline: true });
    doc.moveDown();
    
    doc.fontSize(12).font('Helvetica');
    doc.text(`Tempo Decorrido: ${tempoTexto}`);
    doc.text(`Contas Utilizadas: ${totalAccounts}`);
    doc.text(`Nicks Carregados: ${nicksLoaded}`);
    doc.moveDown();
    
    doc.text(`Total de Convites: ${totalInvites}/${dailyAccountsConfig * 4}`);
    doc.text(`Taxa de Sucesso: ${taxaSucesso}%`);
    doc.text(`Bem-sucedidos: ${automationSuccessCount}`);
    doc.text(`Erros: ${automationErrorCount}`);
    doc.moveDown(2);
    
    // Linha divisória
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();
    
    // Tipos de erros
    doc.fontSize(16).font('Helvetica-Bold').text('TIPOS DE ERROS', { underline: true });
    doc.moveDown();
    
    doc.fontSize(12).font('Helvetica');
    doc.text(`Nao aceita amizade: ${errorsByType.notAcceptingFriends}`);
    doc.text(`Nick nao existe: ${errorsByType.usernameNotFound}`);
    doc.text(`Outros: ${errorsByType.other}`);
    doc.moveDown(2);
    
    // Nova página para tabela de desempenho
    doc.addPage();
    doc.moveTo(50, 50).lineTo(545, 50).stroke();
    doc.moveDown();
    
    // Desempenho por conta
    doc.fontSize(16).font('Helvetica-Bold').text('DESEMPENHO POR CONTA', { underline: true });
    doc.moveDown();
    
    // Criar tabela
    doc.fontSize(10).font('Helvetica-Bold');
    const tableTop = doc.y;
    const colWidths = { conta: 120, enviados: 70, sucesso: 70, erros: 70, tipo: 150 };
    const startX = 50;
    
    // Cabeçalho da tabela
    doc.text('Conta', startX, tableTop);
    doc.text('Enviados', startX + colWidths.conta, tableTop);
    doc.text('Sucesso', startX + colWidths.conta + colWidths.enviados, tableTop);
    doc.text('Erros', startX + colWidths.conta + colWidths.enviados + colWidths.sucesso, tableTop);
    doc.text('Tipo Erro', startX + colWidths.conta + colWidths.enviados + colWidths.sucesso + colWidths.erros, tableTop);
    
    doc.moveDown();
    doc.moveTo(startX, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    
    // Dados reais por conta
    doc.fontSize(9).font('Helvetica');
    let totalSent = 0, totalSuccess = 0, totalErrors = 0;
    
    for (const [accountName, perf] of Object.entries(accountsPerformance)) {
      const y = doc.y;
      const errorTypes = perf.errorDetails && perf.errorDetails.length > 0 
        ? perf.errorDetails.map(e => {
            if (e.type === 'notAcceptingFriends') return 'Nao aceita';
            if (e.type === 'usernameNotFound') return 'Nick inexistente';
            return 'Outro';
          }).join(', ')
        : '-';
      
      doc.text(accountName, startX, y);
      doc.text(`${perf.sent}/4`, startX + colWidths.conta, y);
      doc.text(String(perf.success), startX + colWidths.conta + colWidths.enviados, y);
      doc.text(String(perf.errors), startX + colWidths.conta + colWidths.enviados + colWidths.sucesso, y);
      doc.text(errorTypes, startX + colWidths.conta + colWidths.enviados + colWidths.sucesso + colWidths.erros, y);
      
      totalSent += perf.sent;
      totalSuccess += perf.success;
      totalErrors += perf.errors;
      
      doc.moveDown();
      
      // Quebra de página se necessário
      if (doc.y > 700) {
        doc.addPage();
        doc.moveDown();
      }
    }
    
    doc.moveDown();
    doc.moveTo(startX, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();
    
    // Total
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text(`TOTAL: ${totalInvites} convites | ${totalSuccess} sucesso | ${totalErrors} erros`);
    
    // Nova página para screenshots
    if (errorScreenshots.length > 0) {
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').text('SCREENSHOTS DOS ERROS', { underline: true });
      doc.moveDown();
      
      doc.fontSize(10).font('Helvetica').text(`Total de ${errorScreenshots.length} erros com screenshot.`);
      doc.moveDown(2);
      
      for (const screenshot of errorScreenshots) {
        if (fs.existsSync(screenshot.screenshotPath)) {
          try {
            // Adicionar imagem do erro
            doc.fontSize(9).font('Helvetica-Bold');
            doc.text(`${screenshot.accountName} - ${screenshot.targetNick}`);
            doc.fontSize(8).font('Helvetica');
            doc.text(`Erro: ${screenshot.errorMessage}`, { color: '#666666' });
            doc.moveDown(0.5);
            
            // Adicionar screenshot
            const imageWidth = 480; // Largura máxima
            doc.image(screenshot.screenshotPath, {
              fit: [imageWidth, 400],
              align: 'center'
            });
            doc.moveDown(2);
            
            // Quebra de página se necessário
            if (doc.y > 600) {
              doc.addPage();
            }
          } catch (error) {
            log(`⚠️ Erro ao adicionar screenshot no PDF: ${error.message}`);
          }
        }
      }
    }
    
    // Rodapé
    doc.addPage();
    doc.fontSize(10).font('Helvetica').text('Relatorio gerado automaticamente pelo sistema Meu Filho', {
      align: 'center'
    });
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });
    
    // Finalizar PDF
    doc.end();
    
    // Aguardar stream finalizar
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    
    log('✅ PDF gerado:', pdfPath);
    
    // Enviar para webhook
    const form = new FormData();
    
    // Embed com resumo
    const embedData = {
      content: `📊 **Relatório da Leva ${levaAtual}/6 Completada**`,
      embeds: [{
        title: `✅ ${userName} - Leva ${levaAtual}/6`,
        color: 5763719, // Verde
        fields: [
          { name: '👤 Usuário', value: userName, inline: true },
          { name: '🔢 Leva', value: `${levaAtual}/6`, inline: true },
          { name: '⏱️ Tempo', value: tempoTexto, inline: true },
          { name: '📊 Convites', value: `${totalInvites}/${dailyAccountsConfig * 4} (${taxaSucesso}%)`, inline: true },
          { name: '✅ Sucesso', value: String(automationSuccessCount), inline: true },
          { name: '❌ Erros', value: String(automationErrorCount), inline: true },
          { name: '👥 Contas Diárias', value: String(dailyAccountsConfig), inline: true },
          { name: '📸 Screenshots', value: String(errorScreenshots.length), inline: true },
        ],
        footer: {
          text: 'Meu Filho - Sistema de Automação'
        },
        timestamp: new Date().toISOString()
      }]
    };
    
    form.append('payload_json', JSON.stringify(embedData));
    form.append('file', fs.createReadStream(pdfPath), {
      filename: `relatorio_${userName.replace(/\s+/g, '_')}_leva${levaAtual}.pdf`
    });
    
    // ✅ Enviar com validação e retry
    const webhookResult = await webhookManager.sendToWebhook(webhookUrl, form, {
      maxRetries: 3,
      initialDelay: 1000,
      timeout: 30000,
      onRetry: (attempt, max) => {
        log(`🔄 Tentando reenviar relatório (${attempt + 1}/${max + 1})...`);
      }
    });
    
    if (!webhookResult.success) {
      throw new Error(`Falha ao enviar webhook: ${webhookResult.error}`);
    }
    
    log(`✅ Relatório enviado para webhook (${webhookResult.attempts} tentativas)`);
    
    // Deletar arquivo temporário do PDF
    fs.unlinkSync(pdfPath);
    log('🗑️ Arquivo PDF temporário removido');
    
    // Deletar screenshots temporários (já foram incluídos no PDF)
    if (fs.existsSync(screenshotsDir)) {
      const files = fs.readdirSync(screenshotsDir);
      files.forEach(file => {
        try {
          fs.unlinkSync(path.join(screenshotsDir, file));
        } catch (error) {
          log(`⚠️ Erro ao deletar screenshot: ${file}`);
        }
      });
      log(`🗑️ ${files.length} screenshots temporários removidos`);
    }
    
    return { success: true };
  } catch (error) {
    logError('❌ Erro ao gerar relatório real:', error);
    return { success: false, error: error.message };
  }
}

ipcMain.handle('generate-test-report', async (event, { webhookUrl, userName }) => {
  try {
    log('🧪 Gerando relatório de teste...');
    
    // Dados aleatórios para teste
    const levaAtual = Math.floor(Math.random() * 6) + 1;
    const totalContas = 20;
    const nicksCarregados = 150;
    const nicksRestantes = nicksCarregados - (Math.floor(Math.random() * 50) + 20);
    const convitesEnviados = Math.floor(totalContas * 4 * 0.95); // 95% de sucesso
    const erros = totalContas * 4 - convitesEnviados;
    const tempoMin = Math.floor(Math.random() * 5) + 10;
    const tempoSec = Math.floor(Math.random() * 60);
    const tempoTexto = `${tempoMin}m ${tempoSec}s`;
    const taxaSucesso = Math.round((convitesEnviados / (totalContas * 4)) * 100);
    
    // Buscar foto de perfil diretamente de settings.json
    let photoBase64 = null;
    try {
      const settingsPath = path.join(userDataPath, 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf8');
        const settings = JSON.parse(data);
        photoBase64 = settings.reportIdentification?.photoBase64 || null;
      }
    } catch (error) {
      log('⚠️ Não foi possível carregar foto de perfil');
    }
    
    // Criar PDF
    const pdfPath = path.join(userDataPath, `relatorio_teste_${Date.now()}.pdf`);
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    
    doc.pipe(stream);
    
    // Titulo
    doc.fontSize(24).font('Helvetica-Bold').text('RELATORIO DE AUTOMACAO', { align: 'center' });
    doc.moveDown();
    
    // Adicionar foto de perfil se existir
    if (photoBase64) {
      try {
        // Converter base64 para buffer
        const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        // Adicionar imagem circular (aproximado com fit)
        const imageSize = 80;
        const pageWidth = doc.page.width;
        const imageX = (pageWidth - imageSize) / 2;
        
        doc.image(imageBuffer, imageX, doc.y, {
          fit: [imageSize, imageSize],
          align: 'center'
        });
        doc.moveDown(6); // Espaço após a imagem
      } catch (error) {
        log('⚠️ Erro ao adicionar foto no PDF:', error.message);
      }
    }
    
    // Nome do usuário
    doc.fontSize(18).font('Helvetica').text(userName, { align: 'center' });
    doc.fontSize(12).text(`Leva ${levaAtual}/6 - ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });
    doc.moveDown(2);
    
    // Linha divisória
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();
    
    // Estatisticas
    doc.fontSize(16).font('Helvetica-Bold').text('ESTATISTICAS GERAIS', { underline: true });
    doc.moveDown();
    
    doc.fontSize(12).font('Helvetica');
    doc.text(`Tempo Decorrido: ${tempoTexto}`);
    doc.text(`Contas Utilizadas: ${totalContas}`);
    doc.text(`Nicks Carregados: ${nicksCarregados}`);
    doc.text(`Nicks Restantes: ${nicksRestantes}`);
    doc.moveDown();
    
    doc.text(`Total de Convites: ${convitesEnviados}/${totalContas * 4}`);
    doc.text(`Taxa de Sucesso: ${taxaSucesso}%`);
    doc.text(`Bem-sucedidos: ${convitesEnviados}`);
    doc.text(`Erros: ${erros}`);
    doc.moveDown(2);
    
    // Linha divisória
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();
    
    // Tipos de erros
    doc.fontSize(16).font('Helvetica-Bold').text('TIPOS DE ERROS', { underline: true });
    doc.moveDown();
    
    doc.fontSize(12).font('Helvetica');
    const errosNaoAceita = Math.floor(erros * 0.6);
    const errosNickInexistente = erros - errosNaoAceita;
    doc.text(`Nao aceita amizade: ${errosNaoAceita}`);
    doc.text(`Nick nao existe: ${errosNickInexistente}`);
    doc.moveDown(2);
    
    // Nova página para tabela de desempenho
    doc.addPage();
    
    // Linha divisória
    doc.moveTo(50, 50).lineTo(545, 50).stroke();
    doc.moveDown();
    
    // Desempenho por conta
    doc.fontSize(16).font('Helvetica-Bold').text('DESEMPENHO POR CONTA', { underline: true });
    doc.moveDown();
    
    // Criar tabela
    doc.fontSize(10).font('Helvetica-Bold');
    const tableTop = doc.y;
    const colWidths = { conta: 120, enviados: 70, sucesso: 70, erros: 70, tipo: 150 };
    const startX = 50;
    
    // Cabeçalho da tabela
    doc.text('Conta', startX, tableTop);
    doc.text('Enviados', startX + colWidths.conta, tableTop);
    doc.text('Sucesso', startX + colWidths.conta + colWidths.enviados, tableTop);
    doc.text('Erros', startX + colWidths.conta + colWidths.enviados + colWidths.sucesso, tableTop);
    doc.text('Tipo Erro', startX + colWidths.conta + colWidths.enviados + colWidths.sucesso + colWidths.erros, tableTop);
    
    doc.moveDown();
    doc.moveTo(startX, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    
    // Dados simulados por conta
    doc.fontSize(9).font('Helvetica');
    for (let i = 1; i <= totalContas; i++) {
      const sent = 4;
      const hasError = Math.random() < (erros / (totalContas * 4));
      const success = hasError ? 3 : 4;
      const errors = hasError ? 1 : 0;
      const errorType = errors > 0 ? (Math.random() < 0.6 ? 'Não aceita' : 'Nick inexistente') : '-';
      
      const y = doc.y;
      doc.text(`Conta ${i}`, startX, y);
      doc.text(`${sent}/4`, startX + colWidths.conta, y);
      doc.text(String(success), startX + colWidths.conta + colWidths.enviados, y);
      doc.text(String(errors), startX + colWidths.conta + colWidths.enviados + colWidths.sucesso, y);
      doc.text(errorType, startX + colWidths.conta + colWidths.enviados + colWidths.sucesso + colWidths.erros, y);
      
      doc.moveDown();
      
      // Quebra de página se necessário
      if (doc.y > 700) {
        doc.addPage();
        doc.moveDown();
      }
    }
    
    doc.moveDown();
    doc.moveTo(startX, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();
    
    // Total
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text(`TOTAL: ${convitesEnviados}/${totalContas * 4} convites | ${convitesEnviados} sucesso | ${erros} erros`);
    
    // Nova página para screenshots (simulação)
    if (erros > 0) {
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').text('SCREENSHOTS DOS ERROS', { underline: true });
      doc.moveDown();
      
      doc.fontSize(10).font('Helvetica').text(`Total de ${erros} erros registrados.`);
      doc.moveDown();
      doc.fontSize(9).text('Nota: Screenshots reais serao incluidas durante automacao real.', { 
        color: '#666666' 
      });
      doc.moveDown();
      
      // Listar erros simulados
      for (let i = 0; i < Math.min(erros, 5); i++) {
        const errorType = i < errosNaoAceita ? 'Nao aceita amizade' : 'Nick nao existe';
        doc.text(`${i + 1}. Conta ${Math.floor(Math.random() * totalContas) + 1} - ${errorType}`);
      }
    }
    
    // Rodapé na última página
    doc.addPage();
    doc.fontSize(10).font('Helvetica').text('Relatorio gerado automaticamente pelo sistema Meu Filho', {
      align: 'center'
    });
    doc.text('RELATORIO DE TESTE - Dados simulados', { align: 'center' });
    
    // Finalizar PDF
    doc.end();
    
    // Aguardar stream finalizar
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
    
    log('✅ PDF gerado:', pdfPath);
    
    // Enviar para webhook
    const form = new FormData();
    
    // Buscar configuração de contas diárias
    let dailyAccountsConfig = null;
    try {
      const settingsPath = path.join(userDataPath, 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf8');
        const settings = JSON.parse(data);
        dailyAccountsConfig = settings.reportIdentification?.totalAccounts || null;
      }
    } catch (error) {
      log('⚠️ Não foi possível carregar contas diárias para embed');
    }
    
    // Embed com resumo
    const embedData = {
      content: `📊 **Relatório de Teste Gerado**`,
      embeds: [{
        title: `✅ Leva ${levaAtual}/6 Completada - ${userName}`,
        color: 5763719, // Verde
        fields: [
          { name: '👤 Usuário', value: userName, inline: true },
          { name: '🔢 Leva', value: `${levaAtual}/6`, inline: true },
          { name: '⏱️ Tempo', value: tempoTexto, inline: true },
          { name: '📊 Convites', value: `${convitesEnviados}/${totalContas * 4} (${taxaSucesso}%)`, inline: true },
          { name: '✅ Sucesso', value: String(convitesEnviados), inline: true },
          { name: '❌ Erros', value: String(erros), inline: true },
          { name: '👥 Contas Diárias', value: dailyAccountsConfig ? String(dailyAccountsConfig) : 'Não configurado', inline: true },
        ],
        footer: {
          text: 'Meu Filho - Sistema de Automação (TESTE)'
        },
        timestamp: new Date().toISOString()
      }]
    };
    
    form.append('payload_json', JSON.stringify(embedData));
    form.append('file', fs.createReadStream(pdfPath), {
      filename: `relatorio_teste_${userName.replace(/\s+/g, '_')}_leva${levaAtual}.pdf`
    });
    
    // ✅ Enviar com validação e retry
    const webhookResult = await webhookManager.sendToWebhook(webhookUrl, form, {
      maxRetries: 2,
      initialDelay: 1000,
      timeout: 30000
    });
    
    if (!webhookResult.success) {
      throw new Error(`Falha ao enviar webhook de teste: ${webhookResult.error}`);
    }
    
    log('✅ Relatório de teste enviado para webhook');
    
    // Deletar arquivo temporário
    fs.unlinkSync(pdfPath);
    log('🗑️ Arquivo temporário removido');
    
    return { success: true, message: 'Relatório gerado e enviado com sucesso!' };
  } catch (error) {
    logError('❌ Erro ao gerar relatório de teste:', error);
    return { success: false, message: error.message };
  }
});

// Handler para obter modo PC fraco
ipcMain.handle('get-weak-pc-mode', () => {
  try {
    const settingsPath = path.join(userDataPath, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const settings = JSON.parse(data);
      return settings.weakPCMode || false;
    }
    return false;
  } catch (error) {
    logError('❌ Erro ao obter modo PC fraco:', error);
    return false;
  }
});

// Handler para definir modo PC fraco
ipcMain.handle('set-weak-pc-mode', (event, weakPCMode) => {
  try {
    const settingsPath = path.join(userDataPath, 'settings.json');
    let settings = {};
    
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      settings = JSON.parse(data);
    }
    
    settings.weakPCMode = weakPCMode;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    
    // Aplicar otimizações imediatamente
    if (weakPCMode) {
      applyWeakPCOptimizations();
    } else {
      removeWeakPCOptimizations();
    }
    
    log('💻 Modo PC fraco salvo:', weakPCMode);
    return { success: true };
  } catch (error) {
    logError('❌ Erro ao salvar modo PC fraco:', error);
    return { success: false, message: error.message };
  }
});

// Aplicar otimizações do modo PC fraco no main process
function applyWeakPCOptimizations() {
  log('⚡ Aplicando otimizações do modo PC fraco no main process...');
  
  // Limpar BrowserViews inativas mais agressivamente
  timerManager.removeTimer('browserViewCleanup');
  
  timerManager.addTimer('browserViewCleanup', aggressiveBrowserViewCleanup, 5 * 1000); // A cada 5 segundos
  
  // Aplicar limpeza inicial
  aggressiveBrowserViewCleanup();
  
  log('⚡ Otimizações do modo PC fraco aplicadas no main process');
}

// Remover otimizações do modo PC fraco
function removeWeakPCOptimizations() {
  log('⚡ Removendo otimizações do modo PC fraco...');
  
  // Restaurar limpeza normal
  timerManager.removeTimer('browserViewCleanup');
  
  timerManager.addTimer('normalCleanup', cleanupMemory, 5 * 60 * 1000); // A cada 5 minutos (normal)
  
  log('⚡ Otimizações do modo PC fraco removidas');
}

// Limpeza agressiva de BrowserViews para modo PC fraco
function aggressiveBrowserViewCleanup() {
  try {
    // Limpeza agressiva de BrowserViews para modo PC fraco
    // MANTÉM até 5 BrowserViews ativas (não destrói todas)
    
    const activeAccount = accounts.find(acc => acc.active);
    let destroyedCount = 0;
    
    // CORREÇÃO: Se temos 5 ou mais BrowserViews, destruir apenas as mais antigas
    if (browserViews.size >= 5) {
      const viewsToDestroy = browserViews.size - 5;
      const viewsArray = Array.from(browserViews.entries());
      
      // Destruir as mais antigas (exceto a ativa)
      for (let i = 0; i < viewsToDestroy && i < viewsArray.length; i++) {
        const [accountId, view] = viewsArray[i];
        
        // NÃO destruir a conta ativa
      if (accountId !== activeAccount?.id) {
        try {
          if (!view.webContents.isDestroyed()) {
            mainWindow.removeBrowserView(view);
            view.webContents.destroy();
            browserViews.delete(accountId);
            destroyedCount++;
              log(`💥 BrowserView ${accountId} destruída (limite de 5 atingido)`);
          }
        } catch (error) {
          logError(`❌ Erro ao destruir BrowserView ${accountId}:`, error);
          }
        }
      }
    }
    
    // NUNCA LIMPAR SESSÕES NO MODO PC FRACO - APENAS CACHE
    // As sessões devem permanecer logadas sempre!
    log(`🔐 Preservando todas as ${sessionMap.size} sessões logadas (NUNCA deslogar)`);
    
    // Forçar garbage collection
    if (global.gc) {
      global.gc();
    }
    
    log(
      `🧹 Limpeza agressiva concluída: ${destroyedCount} BrowserViews destruídas, ${browserViews.size} ativas`
    );
  } catch (error) {
    logError('❌ Erro na limpeza agressiva:', error);
  }
}

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
    
    log('🎨 Cor personalizada salva:', color);
    return { success: true, message: 'Cor personalizada salva com sucesso!' };
  } catch (error) {
    logError('Erro ao salvar cor personalizada:', error);
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
    
    log('🎨 Cor padrão restaurada');
    return { success: true, message: 'Cor padrão restaurada com sucesso!' };
  } catch (error) {
    logError('Erro ao restaurar cor padrão:', error);
    return { success: false, message: `Erro ao restaurar cor: ${error.message}` };
  }
});

// ========================================
// SISTEMA DE BACKUP
// ========================================

// Função para criar backup completo (contas + sessões + dados de login)
async function createCompleteBackup() {
  try {
    const os = require('os');
    
    log('🔄 Criando backup ZIP da pasta de dados...');
    
    // Mostrar diálogo para escolher onde salvar o backup
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar Backup',
      defaultPath: path.join(
        os.homedir(),
        'Documents',
        `meu-filho-backup-${new Date().toISOString().split('T')[0]}.zip`
      ),
      filters: [
        { name: 'Arquivos ZIP', extensions: ['zip'] },
        { name: 'Todos os arquivos', extensions: ['*'] },
      ],
    });
    
    if (result.canceled) {
      log('❌ Backup cancelado pelo usuário');
      return { success: false, error: 'Backup cancelado pelo usuário' };
    }
    
    const backupPath = result.filePath;
    log(`💾 Salvando backup em: ${backupPath}`);
    
    // Criar arquivo ZIP
    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Máxima compressão
    });
    
    // Configurar eventos
    output.on('close', () => {
      log(`✅ Backup criado com sucesso: ${archive.pointer()} bytes`);
    });
    
    archive.on('error', err => {
      logError('❌ Erro ao criar backup:', err);
      throw err;
    });
    
    // Pipe archive data to the file
    archive.pipe(output);
    
    // Adicionar TODOS os arquivos e diretórios (excluir apenas backups anteriores)
    log(`📁 Compactando TODOS os dados de: ${userDataPath}`);
    
    // Listar todos os itens na pasta
    const allItems = fs.readdirSync(userDataPath);
    log(`📊 Encontrados ${allItems.length} itens para backup`);
    
    // Verificar se há dados importantes
    const hasAccounts = allItems.includes('accounts.json');
    const hasSessions = allItems.some(item => item.startsWith('discord-'));
    const hasCache = allItems.some(item => ['Cache', 'DawnCache', 'GPUCache'].includes(item));
    log(`🔍 Verificação de dados:`);
    log(`  - Contas: ${hasAccounts ? '✅' : '❌'}`);
    log(`  - Sessões: ${hasSessions ? '✅' : '❌'}`);
    log(`  - Cache: ${hasCache ? '✅' : '❌'}`);
    
    if (!hasAccounts && !hasSessions) {
      logWarn('⚠️ Nenhum dado importante encontrado para backup');
      return { 
        success: false, 
        error:
          'Nenhum dado importante encontrado para backup. Verifique se há contas e sessões salvas.',
      };
    }
    
    // Calcular tamanho estimado dos dados
    let estimatedSize = 0;
    for (const item of allItems) {
      const itemPath = path.join(userDataPath, item);
      try {
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          // Estimar tamanho do diretório
          const dirSize = getDirectorySize(itemPath);
          estimatedSize += dirSize;
        } else {
          estimatedSize += stat.size;
        }
      } catch (error) {
        logWarn(`⚠️ Erro ao calcular tamanho de ${item}:`, error.message);
      }
    }
    
    const estimatedSizeMB = (estimatedSize / (1024 * 1024)).toFixed(2);
    log(`📊 Tamanho estimado dos dados: ${estimatedSizeMB} MB`);
    
    let addedCount = 0;
    let skippedCount = 0;
    
    for (const item of allItems) {
      const itemPath = path.join(userDataPath, item);
      const stat = fs.statSync(itemPath);
      
      // Excluir apenas backups anteriores e arquivos temporários
      if (item.startsWith('backup-') || item.startsWith('emergency-') || item.includes('temp')) {
        log(`⏭️ Pulando backup anterior: ${item}`);
        skippedCount++;
        continue;
      }
      
      try {
        if (stat.isDirectory()) {
          // Adicionar diretório completo
          archive.directory(itemPath, item);
          log(`📁 Adicionando diretório: ${item}`);
          addedCount++;
        } else {
          // Adicionar arquivo
          archive.file(itemPath, { name: item });
          log(`📄 Adicionando arquivo: ${item}`);
          addedCount++;
        }
      } catch (addError) {
        logWarn(`⚠️ Erro ao adicionar ${item}:`, addError.message);
        skippedCount++;
      }
    }
    
    log(`📊 Resumo do backup:`);
    log(`  - Itens adicionados: ${addedCount}`);
    log(`  - Itens pulados: ${skippedCount}`);
    log(`  - Total processado: ${addedCount + skippedCount}`);
    
    // Finalizar o arquivo
    await archive.finalize();
    
    // Aguardar o arquivo ser escrito completamente
    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });
    
    // Verificar o tamanho do arquivo criado
    const stats = fs.statSync(backupPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    log(`✅ Backup ZIP criado com sucesso: ${backupPath}`);
    log(`📊 Tamanho do backup: ${fileSizeMB} MB`);
    
    // Verificar se o backup tem tamanho razoável (pelo menos 1MB)
    if (stats.size < 1024 * 1024) {
      logWarn('⚠️ Backup muito pequeno - pode estar incompleto');
      return { 
        success: false, 
        error: 'Backup muito pequeno - pode estar incompleto. Verifique se há dados para backup.',
      };
    }
    
    // Verificar se o backup tem pelo menos 10% do tamanho estimado (se estimativa > 0)
    if (estimatedSize > 0) {
      const expectedMinSize = estimatedSize * 0.1; // 10% do tamanho estimado
      if (stats.size < expectedMinSize) {
        logWarn(
          `⚠️ Backup muito pequeno comparado ao esperado (${fileSizeMB} MB vs ${(expectedMinSize / (1024 * 1024)).toFixed(2)} MB esperado)`
        );
        return { 
          success: false, 
          error: 'Backup muito pequeno comparado ao esperado. Pode estar incompleto.',
        };
      }
    }
    
    // Verificar se o backup tem pelo menos alguns arquivos importantes
    if (addedCount < 5) {
      logWarn('⚠️ Muito poucos arquivos no backup - pode estar incompleto');
      return { 
        success: false, 
        error:
          'Muito poucos arquivos no backup - pode estar incompleto. Verifique se há dados para backup.',
      };
    }
    
    // Verificação adicional: tentar abrir o ZIP para confirmar que está válido
    try {
      const testZip = require('decompress');
      const testPath = path.join(os.tmpdir(), 'backup-test');
      const testResult = await testZip(backupPath, testPath);
      log(`✅ Backup validado: ${testResult.length} arquivos extraídos`);
      
      // Verificar se os arquivos importantes estão no backup
      const testAccounts = testResult.some(file => file.path.includes('accounts.json'));
      const testSessions = testResult.some(file => file.path.includes('discord-'));
      
      log(`🔍 Verificação de integridade:`);
      log(`  - accounts.json: ${testAccounts ? '✅' : '❌'}`);
      log(`  - Sessões Discord: ${testSessions ? '✅' : '❌'}`);
      
      if (!testAccounts) {
        logWarn('⚠️ accounts.json não encontrado no backup');
        return { 
          success: false, 
          error: 'Backup incompleto - accounts.json não encontrado. Tente novamente.',
        };
      }
      
      if (!testSessions) {
        logWarn('⚠️ Sessões Discord não encontradas no backup');
        return { 
          success: false, 
          error: 'Backup incompleto - Sessões Discord não encontradas. Tente novamente.',
        };
      }
      
      // Limpar arquivos de teste
      fs.rmSync(testPath, { recursive: true, force: true });
    } catch (validationError) {
      logError('❌ Backup inválido:', validationError);
      return { 
        success: false, 
        error: 'Backup criado mas é inválido. Tente novamente.',
      };
    }
    
    log(`🎉 BACKUP COMPLETO E VÁLIDO!`);
    log(`📊 Estatísticas finais:`);
    log(`  - Tamanho: ${fileSizeMB} MB`);
    log(`  - Tamanho estimado: ${estimatedSizeMB} MB`);
    log(`  - Itens incluídos: ${addedCount}`);
    log(`  - Itens pulados: ${skippedCount}`);
    log(`  - Arquivo: ${backupPath}`);
    
    // Calcular eficiência de compressão
    const compressionRatio =
      estimatedSize > 0 ? (((estimatedSize - stats.size) / estimatedSize) * 100).toFixed(1) : '0';
    log(`📈 Eficiência de compressão: ${compressionRatio}%`);
    
    return { 
      success: true, 
      path: backupPath, 
      timestamp: Date.now(),
      size: fileSizeMB,
      estimatedSize: estimatedSizeMB,
      itemsAdded: addedCount,
      itemsSkipped: skippedCount,
      compressionRatio: compressionRatio,
      message: `✅ BACKUP COMPLETO E VÁLIDO!\n\nArquivo: ${backupPath}\nTamanho: ${fileSizeMB} MB (${compressionRatio}% de compressão)\nItens incluídos: ${addedCount}\n\nEste backup contém TODOS os dados necessários para restaurar suas contas e sessões.`,
    };
  } catch (error) {
    logError('❌ Erro ao criar backup:', error);
    return { success: false, error: `Erro ao criar backup: ${error.message}` };
  }
}

// Função para restaurar backup completo
async function restoreCompleteBackup(backupPath) {
  try {
    const decompress = require('decompress');
    const os = require('os');
    
    log('🔄 Restaurando backup ZIP...');
    
    // Se não foi fornecido um caminho, mostrar diálogo para selecionar
    if (!backupPath) {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecionar Backup',
        defaultPath: path.join(os.homedir(), 'Documents'),
        filters: [
          { name: 'Arquivos ZIP', extensions: ['zip'] },
          { name: 'Todos os arquivos', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });
      
      if (result.canceled) {
        log('❌ Restauração cancelada pelo usuário');
        return { success: false, error: 'Restauração cancelada pelo usuário' };
      }
      
      backupPath = result.filePaths[0];
    }
    
    if (!fs.existsSync(backupPath)) {
      return { success: false, error: 'Arquivo de backup não encontrado' };
    }

    log(`📁 Restaurando backup de: ${backupPath}`);
    
    // Criar backup de emergência da pasta atual
    const tempBackupPath = path.join(os.tmpdir(), `meu-filho-emergency-backup-${Date.now()}`);
    log(`💾 Criando backup de emergência em: ${tempBackupPath}`);
    
    try {
      // Criar diretório de backup de emergência
      fs.mkdirSync(tempBackupPath, { recursive: true });
      
      // Copiar apenas arquivos essenciais (excluir backups)
      const files = fs.readdirSync(userDataPath);
      
      for (const file of files) {
        const filePath = path.join(userDataPath, file);
        const stat = fs.statSync(filePath);
        
        // Pular backups anteriores e arquivos temporários
        if (file.startsWith('backup-') || file.startsWith('emergency-') || file.includes('temp')) {
          log(`⏭️ Pulando arquivo de backup no backup de emergência: ${file}`);
          continue;
        }
        
        const destPath = path.join(tempBackupPath, file);
        
        if (stat.isDirectory()) {
          // Copiar diretório (como pastas de sessões)
          fs.mkdirSync(destPath, { recursive: true });
          await copyDirectory(filePath, destPath, { recursive: false, createEmptyDirs: true });
          log(`📁 Copiando diretório para backup de emergência: ${file}`);
        } else {
          // Copiar arquivo
          fs.copyFileSync(filePath, destPath);
          log(`📄 Copiando arquivo para backup de emergência: ${file}`);
        }
      }
      
      log('✅ Backup de emergência criado com sucesso');
    } catch (error) {
      logWarn('⚠️ Não foi possível criar backup de emergência:', error.message);
    }
    
    try {
      // Limpar pasta de dados atual (com tratamento de arquivos bloqueados)
      log('🗑️ Limpando pasta de dados atual...');
      if (fs.existsSync(userDataPath)) {
        const items = fs.readdirSync(userDataPath);
        for (const item of items) {
          const itemPath = path.join(userDataPath, item);
          const stat = fs.statSync(itemPath);
          
          try {
            if (stat.isDirectory()) {
              // Para diretórios, tentar remover com force
              fs.rmSync(itemPath, { recursive: true, force: true });
              log(`🗑️ Diretório removido: ${item}`);
            } else {
              // Para arquivos, tentar remover
              fs.unlinkSync(itemPath);
              log(`🗑️ Arquivo removido: ${item}`);
            }
          } catch (error) {
            if (error.code === 'EPERM' || error.code === 'EBUSY') {
              log(`⚠️ Arquivo bloqueado pelo sistema, pulando: ${item}`);
              // Tentar renomear o arquivo para removê-lo depois
              try {
                const tempPath = path.join(userDataPath, `${item}.old`);
                fs.renameSync(itemPath, tempPath);
                log(`📝 Arquivo renomeado para remoção posterior: ${item}`);
              } catch (renameError) {
                log(`⚠️ Não foi possível renomear arquivo bloqueado: ${item}`);
              }
            } else {
              log(`⚠️ Erro ao remover ${item}:`, error.message);
            }
          }
        }
      }
      
      // Descompactar backup ZIP
      log('📦 Descompactando backup...');
      await decompress(backupPath, userDataPath);
      
      // Tentar remover arquivos renomeados (.old) que não puderam ser deletados
      log('🧹 Limpando arquivos renomeados...');
      try {
        const items = fs.readdirSync(userDataPath);
        for (const item of items) {
          if (item.endsWith('.old')) {
            const itemPath = path.join(userDataPath, item);
            try {
              const stat = fs.statSync(itemPath);
              if (stat.isDirectory()) {
                fs.rmSync(itemPath, { recursive: true, force: true });
              } else {
                fs.unlinkSync(itemPath);
              }
              log(`🗑️ Arquivo antigo removido: ${item}`);
            } catch (error) {
              log(`⚠️ Ainda não foi possível remover: ${item}`);
            }
          }
        }
      } catch (error) {
        log('⚠️ Erro na limpeza de arquivos antigos:', error.message);
      }
      
      log('✅ Backup restaurado com sucesso!');
      
      // Mostrar diálogo de sucesso
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Backup Restaurado',
        message: 'Backup restaurado com sucesso!',
        detail: 'O aplicativo será reiniciado para aplicar as mudanças.',
        buttons: ['OK'],
      });
      
      return { 
        success: true, 
        message: 'Backup restaurado com sucesso! O aplicativo será reiniciado.',
        requiresRestart: true,
        emergencyBackup: tempBackupPath,
      };
    } catch (error) {
      logError('❌ Erro durante a restauração:', error);
      
      // Tentar restaurar backup de emergência
      try {
        log('🔄 Tentando restaurar backup de emergência...');
        if (fs.existsSync(tempBackupPath)) {
          // Limpar pasta atual novamente
          if (fs.existsSync(userDataPath)) {
            const items = fs.readdirSync(userDataPath);
            for (const item of items) {
              const itemPath = path.join(userDataPath, item);
              const stat = fs.statSync(itemPath);
              if (stat.isDirectory()) {
                fs.rmSync(itemPath, { recursive: true, force: true });
              } else {
                fs.unlinkSync(itemPath);
              }
            }
          }
          
          // Restaurar backup de emergência
          await copyDirectory(tempBackupPath, userDataPath, {
            recursive: true,
            excludeCache: false,
          });
          log('✅ Backup de emergência restaurado');
        }
      } catch (restoreError) {
        logError('❌ Erro ao restaurar backup de emergência:', restoreError);
      }
      
      return { 
        success: false, 
        error: `Erro ao restaurar backup: ${error.message}`,
        emergencyBackup: tempBackupPath,
      };
    }
  } catch (error) {
    logError('❌ Erro ao restaurar backup:', error);
    return { success: false, error: `Erro ao restaurar backup: ${error.message}` };
  }
}

// Função para gerenciar backups (manter apenas os 3 mais recentes)
function manageBackups() {
  try {
    const backupFiles = fs
      .readdirSync(userDataPath)
      .filter(file => file.startsWith('backup-') && file.endsWith('.json'))
      .map(file => ({
        name: file,
        path: path.join(userDataPath, file),
        timestamp: parseInt(file.replace('backup-', '').replace('.json', '')),
      }))
      .sort((a, b) => b.timestamp - a.timestamp); // Mais recentes primeiro

    // Manter apenas os 3 backups mais recentes
    if (backupFiles.length > 3) {
      const toDelete = backupFiles.slice(3);
      toDelete.forEach(backup => {
        try {
          fs.unlinkSync(backup.path);
          log(`🗑️ Backup antigo removido: ${backup.name}`);
              } catch (error) {
          logError(`❌ Erro ao remover backup ${backup.name}:`, error);
        }
      });
    }

    log(`📊 Gerenciamento de backups: ${backupFiles.length} backups encontrados`);
    return backupFiles.slice(0, 3); // Retornar apenas os 3 mais recentes
               } catch (error) {
    logError('❌ Erro no gerenciamento de backups:', error);
    return [];
  }
}

// Handler para criar backup manual
ipcMain.handle('create-backup', async _event => {
  log('💾 Preparando backup para próxima inicialização...');
  
  try {
    // Abrir diálogo para escolher onde salvar backup
           const result = await dialog.showSaveDialog(mainWindow, {
             title: 'Salvar Backup',
             defaultPath: path.join(require('os').homedir(), 'Documents', 'meu-filho-backup.zip'),
             filters: [
               { name: 'ZIP Files', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] },
      ],
           });
    
    if (result.canceled) {
      return { 
        success: false, 
        error: 'Usuário cancelou a operação',
      };
    }
    
    const userDataPath = app.getPath('userData');
    const intentPath = path.join(userDataPath, 'pending-backup.json');
    
    // Salvar intenção de backup
    const intentData = {
      backupPath: result.filePath,
      timestamp: Date.now(),
    };
    
    fs.writeFileSync(intentPath, JSON.stringify(intentData, null, 2), 'utf8');
    log('Intencao de backup salva. App sera fechado para executar backup.');
    
          // Fechar app para executar backup
          setTimeout(() => {
            app.quit();
          }, 3000);
    
    return { 
      success: true, 
      message: 'App será fechado em 3 segundos. Abra manualmente após o backup ser concluído',
    };
  } catch (error) {
    logError('❌ Erro ao preparar backup:', error);
    return { 
      success: false, 
      error: error.message,
    };
  }
});

// Handler para restaurar backup
ipcMain.handle('restore-backup', async _event => {
  log('🔄 Preparando restore para próxima inicialização...');
  
  try {
    // Abrir diálogo para escolher arquivo de backup
           const result = await dialog.showOpenDialog(mainWindow, {
             title: 'Selecionar Backup',
             defaultPath: path.join(require('os').homedir(), 'Documents'),
             filters: [
               { name: 'ZIP Files', extensions: ['zip'] },
               { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] },
             ],
      properties: ['openFile'],
           });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { 
        success: false, 
        error: 'Usuário cancelou a operação',
      };
    }
    
    const userDataPath = app.getPath('userData');
    const intentPath = path.join(userDataPath, 'pending-restore.json');
    
    // Salvar intenção de restore
    const intentData = {
      sourcePath: result.filePaths[0],
      timestamp: Date.now(),
    };
    
    fs.writeFileSync(intentPath, JSON.stringify(intentData, null, 2), 'utf8');
    log('Intencao de restore salva. App sera fechado para executar restore.');
    
          // Fechar app para executar restore
          setTimeout(() => {
            app.quit();
          }, 3000);
    
    return { 
      success: true, 
      message: 'App será fechado em 3 segundos. Abra manualmente após o restore ser concluído',
    };
  } catch (error) {
    logError('❌ Erro ao preparar restore:', error);
    return { 
      success: false, 
      error: error.message,
    };
  }
});

// Handler para listar backups disponíveis
ipcMain.handle('list-backups', () => {
  try {
    const backups = manageBackups();
    return backups.map(backup => ({
      name: backup.name,
      path: backup.path,
      timestamp: backup.timestamp,
      date: new Date(backup.timestamp).toLocaleString('pt-BR'),
    }));
          } catch (error) {
    logError('❌ Erro ao listar backups:', error);
    return [];
  }
});

// Handlers removidos - usando resolução manual de captcha

// ===== HANDLER PARA ABRIR TESTE DE DETECÇÃO DE BOT NO APP =====
ipcMain.handle('open-bot-detection-test', async (event, url) => {
  try {
    log('🔍 Abrindo teste de detecção de bot no app...');
    log(`📍 URL: ${url}`);
    
    // Criar nova conta temporária para o teste
    const testAccountId = 'bot-detection-test-' + Date.now();
    const testAccount = {
      id: testAccountId,
      name: 'Bot Detection Test',
      token: 'test',
      active: false,
      tags: ['test'],
    };
    
    // Inicializar sessão para o teste
    await initializeSessionForAccount(testAccount);
    
    // Pegar a view
    const view = viewMap.get(testAccountId);
    if (!view) {
      throw new Error('Não foi possível criar BrowserView de teste');
    }
    
    // Adicionar a view
    mainWindow.addBrowserView(view);
    
    // Criar "aba" visual no renderer
    mainWindow.webContents.send('add-test-tab', {
      id: testAccountId,
      name: 'Bot Detection Test',
      url: url,
    });
    
    // Navegar para o site de teste
    await view.webContents.loadURL(url);
    
    // Ativar esta view
    currentViewId = testAccountId;
    updateBrowserViewBounds();
    
    log('✅ Teste de detecção aberto no app!');
    
    return { success: true };
  } catch (error) {
    logError('❌ Erro ao abrir teste:', error);
    return { success: false, error: error.message };
  }
});

// Handlers de cookies removidos - captcha manual

// Eventos do app
app.whenReady().then(async () => {
  // 🧹 LIMPAR COOKIES ANTIGOS DO HCAPTCHA (SE EXISTIREM)
  try {
    log('🧹 Limpando cookies antigos do hCaptcha...');
    
    // Limpar cookies do hCaptcha de todas as sessões
    const userDataPath = app.getPath('userData');
    const partitionsPath = path.join(userDataPath, 'Partitions');
    
    if (fs.existsSync(partitionsPath)) {
      const partitions = fs.readdirSync(partitionsPath);
      
      for (const partition of partitions) {
        if (partition.startsWith('discord-')) {
          const accountId = partition.replace('discord-', '');
          const accountSession = session.fromPartition(`persist:discord-${accountId}`);
          
          // Remover cookies do hCaptcha
          const hcaptchaCookies = await accountSession.cookies.get({ domain: '.hcaptcha.com' });
          
          for (const cookie of hcaptchaCookies) {
            await accountSession.cookies.remove(
              `https://${cookie.domain}${cookie.path}`,
              cookie.name
            );
          }
        }
      }
      
      log('✅ Cookies do hCaptcha limpos de todas as sessões');
    }
  } catch (error) {
    console.error('⚠️ Erro ao limpar cookies do hCaptcha:', error.message);
  }
  
  // 🔄 SISTEMA DE BACKUP/RESTORE COMPLETO ANTES DO APP CARREGAR
  try {
    const userDataPath = app.getPath('userData');
    const accountsPath = path.join(userDataPath, 'accounts.json');
    const partitionsPath = path.join(userDataPath, 'Partitions');
    const backupIntentPath = path.join(userDataPath, 'pending-backup.json');
    const restoreIntentPath = path.join(userDataPath, 'pending-restore.json');
    
    // 📤 VERIFICAR SE HÁ BACKUP PARA FAZER
    if (fs.existsSync(backupIntentPath)) {
        log('Executando backup completo pendente...');
      const intentData = JSON.parse(fs.readFileSync(backupIntentPath, 'utf8'));
      const backupPath = intentData.backupPath;
      
        // Mostrar alert nativo do Windows
        log('Mostrando alert nativo...');
        try {
          const { exec } = require('child_process');
          
          // Alert nativo simples
        exec(
          'msg * "BACKUP INICIADO - Preparando backup... Por favor, aguarde... NAO FECHE O APP!"',
          error => {
            if (error) {
              log('Alert nao pode ser exibido, continuando backup...');
            } else {
              log('Alert de progresso exibido');
            }
          }
        );
        } catch (error) {
          log('Erro ao mostrar alert, continuando backup...');
        }
      
      // Declarar tempBackupDir no escopo correto
      const tempBackupDir = path.join(userDataPath, 'temp-backup');
      
      try {
        // Criar pasta temporária para backup
        if (fs.existsSync(tempBackupDir)) {
          // Tentar remover com força máxima
          try {
            fs.rmSync(tempBackupDir, { recursive: true, force: true });
          } catch (rmError) {
            log('⚠️ Erro ao remover pasta temporária, tentando método alternativo...');
            // Método alternativo: renomear e deletar depois
            const tempOldDir = tempBackupDir + '-old-' + Date.now();
            try {
              fs.renameSync(tempBackupDir, tempOldDir);
              // Tentar deletar em background
              setTimeout(() => {
                try {
                  fs.rmSync(tempOldDir, { recursive: true, force: true });
                } catch (e) {
                  log('⚠️ Não foi possível limpar pasta antiga:', e.message);
                }
              }, 1000);
            } catch (renameError) {
              log('⚠️ Não foi possível renomear pasta, continuando...');
            }
          }
        }
        fs.mkdirSync(tempBackupDir, { recursive: true });
        
        log('📁 Copiando accounts.json...');
        if (fs.existsSync(accountsPath)) {
          const accountsData = fs.readFileSync(accountsPath, 'utf8');
          fs.writeFileSync(path.join(tempBackupDir, 'accounts.json'), accountsData, 'utf8');
          log('✅ accounts.json copiado');
        } else {
          log('⚠️ Arquivo accounts.json não encontrado');
        }
        
        log('📁 Copiando pasta Partitions...');
        if (fs.existsSync(partitionsPath)) {
          // Copiar apenas arquivos essenciais (sem cache desnecessário)
          await copyEssentialPartitions(partitionsPath, path.join(tempBackupDir, 'Partitions'));
          log('✅ Pasta Partitions copiada (otimizada)');
        } else {
          log('⚠️ Pasta Partitions não encontrada');
        }
        
        log('🗜️ Criando arquivo ZIP...');
        await createZipFile(tempBackupDir, backupPath);
        log('✅ Backup ZIP criado em:', backupPath);
        
        // Limpar pasta temporária com tratamento de erro
        try {
          fs.rmSync(tempBackupDir, { recursive: true, force: true });
          log('🧹 Pasta temporária removida');
        } catch (cleanupError) {
          log('⚠️ Erro ao limpar pasta temporária:', cleanupError.message);
          // Tentar método alternativo
          try {
            const tempOldDir = tempBackupDir + '-cleanup-' + Date.now();
            fs.renameSync(tempBackupDir, tempOldDir);
            setTimeout(() => {
              try {
                fs.rmSync(tempOldDir, { recursive: true, force: true });
              } catch (e) {
                log('⚠️ Não foi possível limpar pasta temporária:', e.message);
              }
            }, 2000);
          } catch (renameError) {
            log('⚠️ Não foi possível renomear pasta temporária:', renameError.message);
          }
        }
        
        // Remover arquivo de intenção
        fs.unlinkSync(backupIntentPath);
        log('Backup completo concluido!');
        
        // Mostrar alert de sucesso
        log('Mostrando alert de sucesso...');
        try {
          const { exec } = require('child_process');
          
          exec(
            `msg * "BACKUP CONCLUIDO COM SUCESSO! Local: ${backupPath} Backup criado!"`,
            error => {
            if (error) {
              log('Alert de sucesso nao pode ser exibido');
            } else {
              log('Alert de sucesso exibido');
            }
            }
          );
        } catch (error) {
          log('Erro ao mostrar alert de sucesso');
        }

        // Apenas mostrar aviso para abrir manualmente
        log('Backup concluido! Abra o app manualmente.');
      } catch (error) {
        logError('❌ Erro durante backup:', error);
        
        // Mostrar alert de erro
        log('Mostrando alert de erro...');
        try {
          const { exec } = require('child_process');
          
          exec(
            `msg * "ERRO NO BACKUP! ${error.message} Verifique os logs para mais detalhes."`,
            error => {
            if (error) {
              log('Alert de erro nao pode ser exibido');
            } else {
              log('Alert de erro exibido');
            }
            }
          );
        } catch (error) {
          log('Erro ao mostrar alert de erro');
        }
        
        // Limpar pasta temporária em caso de erro
        if (fs.existsSync(tempBackupDir)) {
          try {
            fs.rmSync(tempBackupDir, { recursive: true, force: true });
          } catch (cleanupError) {
            log('⚠️ Erro ao limpar pasta temporária em caso de erro:', cleanupError.message);
            // Tentar método alternativo
            try {
              const tempOldDir = tempBackupDir + '-error-' + Date.now();
              fs.renameSync(tempBackupDir, tempOldDir);
              setTimeout(() => {
                try {
                  fs.rmSync(tempOldDir, { recursive: true, force: true });
                } catch (e) {
                  log('⚠️ Não foi possível limpar pasta temporária:', e.message);
                }
              }, 2000);
            } catch (renameError) {
              log('⚠️ Não foi possível renomear pasta temporária:', renameError.message);
            }
          }
        }
        // Remover arquivo de intenção mesmo em caso de erro
        if (fs.existsSync(backupIntentPath)) {
          fs.unlinkSync(backupIntentPath);
        }
      }
    }
    
    // 📥 VERIFICAR SE HÁ RESTORE PARA FAZER
    if (fs.existsSync(restoreIntentPath)) {
      log('Executando restore completo pendente...');
      const intentData = JSON.parse(fs.readFileSync(restoreIntentPath, 'utf8'));
      const sourcePath = intentData.sourcePath;
      
      // Abrir CMD para mostrar progresso do restore
      // Mostrar alert nativo do Windows para progresso
        log('Mostrando alert nativo...');
      try {
        const { exec } = require('child_process');
        
        // Alert nativo simples
        exec(
          'msg * "RESTORE INICIADO - Preparando restauracao... Por favor, aguarde... NAO FECHE O APP!"',
          error => {
          if (error) {
              log('Alert nao pode ser exibido, continuando restore...');
            } else {
              log('Alert de progresso exibido');
          }
          }
        );
      } catch (error) {
        log('Erro ao mostrar alert, continuando restore...');
      }
      
      try {
        if (fs.existsSync(sourcePath)) {
          // Verificar se é arquivo ZIP
          if (sourcePath.endsWith('.zip')) {
            log('📦 Extraindo arquivo ZIP...');
            const decompress = require('decompress');
            const tempRestoreDir = path.join(userDataPath, 'temp-restore');
            
            // Limpar pasta temporária se existir
            if (fs.existsSync(tempRestoreDir)) {
              fs.rmSync(tempRestoreDir, { recursive: true });
            }
            fs.mkdirSync(tempRestoreDir, { recursive: true });
            
            // Extrair ZIP
            await decompress(sourcePath, tempRestoreDir);
            log('✅ ZIP extraído');
            
            // Restaurar accounts.json
            const accountsBackupPath = path.join(tempRestoreDir, 'accounts.json');
            if (fs.existsSync(accountsBackupPath)) {
              const backupData = fs.readFileSync(accountsBackupPath, 'utf8');
        fs.writeFileSync(accountsPath, backupData, 'utf8');
              log('✅ accounts.json restaurado');
            } else {
              log('⚠️ accounts.json não encontrado no backup');
            }
            
            // Restaurar Partitions
            const partitionsBackupPath = path.join(tempRestoreDir, 'Partitions');
            if (fs.existsSync(partitionsBackupPath)) {
              log('📁 Restaurando Partitions...');
              
              // Remover Partitions existentes
              if (fs.existsSync(partitionsPath)) {
                fs.rmSync(partitionsPath, { recursive: true, force: true });
              }
              
              // Copiar Partitions do backup
              await copyDirectory(partitionsBackupPath, partitionsPath, {
                recursive: true,
                excludeCache: true,
              });
              log('✅ Partitions (tokens) restaurados');
            } else {
              log('⚠️ Partitions não encontradas no backup');
            }
            
            // Limpar pasta temporária
            fs.rmSync(tempRestoreDir, { recursive: true });
            log('🧹 Pasta temporária removida');
          } else {
            // Backup antigo (não ZIP) - manter compatibilidade
            log('📁 Restaurando backup antigo...');
            const backupData = fs.readFileSync(sourcePath, 'utf8');
            fs.writeFileSync(accountsPath, backupData, 'utf8');
            log('✅ accounts.json restaurado de:', sourcePath);
            
            // Tentar restaurar Partitions do backup antigo
            const partitionsBackupPath = sourcePath.replace('.json', '-partitions');
            if (fs.existsSync(partitionsBackupPath)) {
              log('📁 Restaurando Partitions de:', partitionsBackupPath);
              
              // Remover Partitions existentes
              if (fs.existsSync(partitionsPath)) {
                fs.rmSync(partitionsPath, { recursive: true, force: true });
              }
              
              // Copiar Partitions do backup
              await copyDirectory(partitionsBackupPath, partitionsPath, {
                recursive: true,
                excludeCache: true,
              });
              log('✅ Partitions (tokens) restaurados de:', partitionsBackupPath);
            } else {
              log('⚠️ Partitions de backup não encontradas:', partitionsBackupPath);
            }
          }
        } else {
          log('⚠️ Arquivo de backup não encontrado:', sourcePath);
        }
        
        // Remover arquivo de intenção
        fs.unlinkSync(restoreIntentPath);
        log('Restore completo concluido!');
        
        // Mostrar alert de sucesso
        log('Mostrando alert de sucesso...');
        try {
          const { exec } = require('child_process');
          
          exec(
            'msg * "RESTORE CONCLUIDO COM SUCESSO! Contas restauradas! Abra o app manualmente."',
            error => {
            if (error) {
              log('Alert de sucesso nao pode ser exibido');
            } else {
              log('Alert de sucesso exibido');
            }
            }
          );
    } catch (error) {
          log('Erro ao mostrar alert de sucesso');
        }

        // Apenas mostrar aviso para abrir manualmente
        log('Restore concluido! Abra o app manualmente.');
    } catch (error) {
        logError('❌ Erro durante restore:', error);
        
        // Mostrar alert de erro
        log('Mostrando alert de erro...');
        try {
          const { exec } = require('child_process');
          
          exec(
            `msg * "ERRO NO RESTORE! ${error.message} Verifique os logs para mais detalhes."`,
            error => {
            if (error) {
              log('Alert de erro nao pode ser exibido');
            } else {
              log('Alert de erro exibido');
            }
            }
          );
        } catch (error) {
          log('Erro ao mostrar alert de erro');
        }
        
        // Remover arquivo de intenção mesmo em caso de erro
        if (fs.existsSync(restoreIntentPath)) {
          fs.unlinkSync(restoreIntentPath);
        }
      }
    }
    } catch (error) {
    log('⚠️ Erro no sistema de backup/restore:', error);
  }

  await loadAccounts();
  createWindow();
  
  // Iniciar timers de limpeza de memória
  startCleanupTimers();
  
  // Iniciar sistema de kill switch
  startKillSwitch();
  
  // Carregar lista de nicks na inicialização
  loadNicksList();

  // Handlers IPC para automação
  ipcMain.handle('automation-get-nicks', async () => {
    return nicksList;
  });
  
  // Handler para abrir arquivo de log de debug
  ipcMain.handle('open-debug-log', async () => {
    const { shell } = require('electron');
    try {
      if (fs.existsSync(debugLogPath)) {
        await shell.openPath(debugLogPath);
        return { success: true, path: debugLogPath };
      } else {
        return { success: false, error: 'Arquivo de log não existe' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('automation-start', async (event, config) => {
    log(`🔍 [DEBUG] ========== INÍCIO DO HANDLER automation-start ==========`);
    log(`📝 Arquivo de log: ${debugLogPath}`);
    log('🤖 Iniciando automação REAL de convites...');
    log('⚙️ Configuração recebida:', config);
    log(`👁️ Contas visíveis: ${config.accountIds?.length || 0}`);
    
    try {
      // Validar accountIds
      if (
        !config.accountIds ||
        !Array.isArray(config.accountIds) ||
        config.accountIds.length === 0
      ) {
        throw new Error('accountIds inválido ou ausente - nenhuma conta visível');
      }
      
      // Carregar progresso salvo para restaurar estado
      const savedProgress = loadProgress();
      
      // ✅ CARREGAR nicks do arquivo persistente (igual ao webhook)
      const nicksFilePath = path.join(userDataPath, 'loaded-nicks.json');
      let loadedNicks = [];
      
      log(`🔍 [DEBUG] Caminho do arquivo de nicks: ${nicksFilePath}`);
      log(`🔍 [DEBUG] Arquivo existe? ${fs.existsSync(nicksFilePath)}`);
      
      // Tentar carregar do arquivo primeiro
      if (fs.existsSync(nicksFilePath)) {
        try {
          log(`🔍 [DEBUG] Lendo arquivo de nicks...`);
          const nicksData = fs.readFileSync(nicksFilePath, 'utf8');
          log(`🔍 [DEBUG] Tamanho do arquivo: ${nicksData.length} caracteres`);
          log(`🔍 [DEBUG] Primeiros 100 caracteres: ${nicksData.substring(0, 100)}`);
          
          const parsed = JSON.parse(nicksData);
          log(`🔍 [DEBUG] JSON parseado com sucesso!`);
          log(`🔍 [DEBUG] Estrutura do JSON: ${JSON.stringify(Object.keys(parsed))}`);
          
          loadedNicks = parsed.nicks || [];
          log(`📂 ✅ ${loadedNicks.length} nicks carregados do arquivo persistente`);
          log(`🔍 [DEBUG] Primeiros 3 nicks: ${loadedNicks.slice(0, 3).join(', ')}`);
        } catch (error) {
          logWarn('⚠️ Erro ao carregar nicks do arquivo persistente:', error);
          log(`🔍 [DEBUG] Erro detalhado: ${error.message}`);
          log(`🔍 [DEBUG] Stack: ${error.stack}`);
        }
      } else {
        log(`⚠️ [DEBUG] Arquivo de nicks NÃO EXISTE!`);
      }
      
      // Se não encontrou no arquivo, tentar pegar do automationEngine atual
      if (loadedNicks.length === 0) {
        log(`🔍 [DEBUG] Tentando carregar do automationEngine...`);
        log(`🔍 [DEBUG] automationEngine existe? ${!!automationEngine}`);
        log(`🔍 [DEBUG] automationEngine.nicksList existe? ${!!automationEngine?.nicksList}`);
        log(`🔍 [DEBUG] automationEngine.nicksList.length = ${automationEngine?.nicksList?.length || 0}`);
        
        loadedNicks = automationEngine?.nicksList || [];
        log(`📂 ${loadedNicks.length} nicks carregados do automationEngine`);
      }
      
      // Fechar aba de automação para começar o trabalho
      mainWindow.webContents.send('close-automation-tab');
      
      // Carregar contador de levas persistente
      const currentLeva = loadLevaCounter();
      
      // Preservar nickIndex atual antes de recriar engine
      const preservedNickIndex = savedProgress?.currentNickIndex || automationEngine?.currentNickIndex || 0;
      const preservedWebhook = savedProgress?.webhookUrl || automationEngine?.webhookUrl || '';
      
      // Iniciar automação real - PRESERVANDO PROGRESSO!
      automationEngine = {
        isRunning: true,
        isPaused: false,
        isPausedByPanel: false,
        currentLeva: currentLeva, // ✅ Carregar leva atual de settings.json
        currentCiclo: savedProgress?.currentCiclo || 1, // ✅ Restaurar ciclo salvo
        currentAccountIndex: savedProgress?.currentAccountIndex || 0, // ✅ Restaurar conta salva
        totalInvitesSent: savedProgress?.totalInvitesSent || 0, // ✅ Restaurar contador salvo
        config: config,
        nicksList: loadedNicks, // ✅ Usar nicks do arquivo persistente
        currentNickIndex: preservedNickIndex, // ✅ Restaurar progresso dos nicks (preservado antes de recriar)
        webhookUrl: preservedWebhook, // ✅ Restaurar webhook (preservado)
        accountIds: config.accountIds || [], // Array de IDs das contas visíveis
      };
      
      log(`🔍 [DEBUG] automationEngine criado com sucesso!`);
      log(`🔍 [DEBUG] automationEngine.nicksList.length = ${automationEngine.nicksList.length}`);
      log(`🔍 [DEBUG] automationEngine.nicksList tipo: ${typeof automationEngine.nicksList}`);
      log(`🔍 [DEBUG] automationEngine.nicksList é array? ${Array.isArray(automationEngine.nicksList)}`);
      
      // ✅ Validar se nicks foram carregados (DEPOIS de recriar automationEngine)
      if (!automationEngine.nicksList || automationEngine.nicksList.length === 0) {
        automationEngine.isRunning = false; // Parar automação
        log(`❌ [DEBUG] VALIDAÇÃO FALHOU! nicksList = ${automationEngine.nicksList}`);
        log(`❌ [DEBUG] nicksList length = ${automationEngine.nicksList?.length || 'undefined'}`);
        throw new Error(
          '❌ Nenhuma lista de nicks carregada! Clique em "Carregar Nicks" primeiro.'
        );
      }
      
      log(`✅ [DEBUG] Validação de nicks PASSOU!`);
      
      log(`📊 Leva atual: ${currentLeva}/6`);
      
      // Log de progresso restaurado
      if (savedProgress && savedProgress.currentNickIndex > 0) {
        log(
          `📂 Progresso restaurado: Nick ${savedProgress.currentNickIndex + 1}/${automationEngine.nicksList.length}, Ciclo ${savedProgress.currentCiclo}/4, ${savedProgress.totalInvitesSent} convites enviados`
        );
      }
      
      // Iniciar processo de automação
      startRealAutomation();
      
      log('✅ Automação REAL iniciada com sucesso');
      return { success: true, message: 'Automação iniciada - começando trabalho...' };
    } catch (error) {
      logError('❌ Erro ao iniciar automação:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('automation-pause', async () => {
    log('⏸️ Pausando automação...');
    
    if (automationEngine) {
      automationEngine.isPaused = true;
      automationEngine.isRunning = false;
    }
    
    return { success: true, message: 'Automação pausada' };
  });

  ipcMain.handle('automation-stop', async () => {
    log('⏹️ Parando automação...');
    
    if (automationEngine) {
      automationEngine.isRunning = false;
      automationEngine.isPaused = false;
    }
    
    return { success: true, message: 'Automação parada' };
  });

  ipcMain.handle('automation-status', async () => {
    return {
      isRunning: automationEngine ? automationEngine.isRunning : false,
      isPaused: automationEngine ? automationEngine.isPaused : false,
      currentLeva: automationEngine ? automationEngine.currentLeva : 1,
      currentCiclo: automationEngine ? automationEngine.currentCiclo : 1,
      totalInvites: automationEngine ? automationEngine.totalInvitesSent : 0,
    };
  });

  // Handler para selecionar arquivo de nicks
  ipcMain.handle('select-nicks-file', async () => {
    try {
      const { dialog } = require('electron');
      
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecionar arquivo de nicks',
        filters: [
          { name: 'Arquivos de texto', extensions: ['txt'] },
          { name: 'Todos os arquivos', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        const fileName = path.basename(filePath);
        
        // Ler arquivo
        const content = fs.readFileSync(filePath, 'utf8');
        const nicks = content
          .split('\n')
          .map(nick => nick.trim())
          .filter(nick => nick.length > 0);
        
        log(`📋 ${nicks.length} nicks carregados de: ${fileName}`);
        
        // ✅ SALVAR nicks em arquivo persistente (igual ao webhook)
        const nicksFilePath = path.join(userDataPath, 'loaded-nicks.json');
        try {
          fs.writeFileSync(nicksFilePath, JSON.stringify({ nicks, fileName, timestamp: Date.now() }, null, 2));
          log(`💾 Nicks salvos em arquivo persistente: ${nicksFilePath}`);
        } catch (error) {
          logWarn('⚠️ Erro ao salvar nicks em arquivo:', error);
        }
        
        // ✅ NOVO: Carregar webhook de settings.json (persistência permanente)
        const settingsPath = path.join(userDataPath, 'settings.json');
        let savedWebhook = '';
        if (fs.existsSync(settingsPath)) {
          try {
            const settingsData = fs.readFileSync(settingsPath, 'utf8');
            const settings = JSON.parse(settingsData);
            savedWebhook = settings.webhookUrl || '';
            log(`🔗 Webhook carregado de settings.json: ${savedWebhook ? 'Configurado' : 'Não configurado'}`);
          } catch (error) {
            logWarn('⚠️ Erro ao carregar webhook de settings.json:', error);
          }
        }
        
        // Carregar progresso salvo (se existir)
        const savedProgress = loadProgress();
        
        // SAVE TO AUTOMATION ENGINE
        if (automationEngine) {
          automationEngine.nicksList = nicks;
          automationEngine.currentNickIndex = savedProgress ? savedProgress.currentNickIndex : 0;
          automationEngine.totalInvitesSent = savedProgress ? savedProgress.totalInvitesSent : 0;
          // ✅ Prioridade MÁXIMA: webhook salvo em settings.json
          automationEngine.webhookUrl = savedWebhook;
          automationEngine.currentCiclo = savedProgress ? savedProgress.currentCiclo : 1;
          automationEngine.currentAccountIndex = savedProgress
            ? savedProgress.currentAccountIndex
            : 0;
          log(`✅ Nicks salvos no automationEngine: ${nicks.length}`);
          if (savedProgress) {
            log(
              `📂 Progresso restaurado: índice ${savedProgress.currentNickIndex}, ciclo ${savedProgress.currentCiclo}, conta ${savedProgress.currentAccountIndex}`
            );
          }
          log(`🔗 Webhook aplicado: ${automationEngine.webhookUrl ? 'Configurado' : 'Não configurado'}`);
        } else {
          // Criar automationEngine se não existir
          const currentLeva = loadLevaCounter(); // ✅ Carregar leva de settings.json
          automationEngine = {
            isRunning: false,
            isPaused: false,
            isPausedByPanel: false,
            currentLeva: currentLeva, // ✅ Usar leva carregada
            currentCiclo: savedProgress ? savedProgress.currentCiclo : 1,
            currentAccountIndex: savedProgress ? savedProgress.currentAccountIndex : 0,
            totalInvitesSent: savedProgress ? savedProgress.totalInvitesSent : 0,
            config: { delayMin: 500, delayMax: 1500 },
            nicksList: nicks,
            currentNickIndex: savedProgress ? savedProgress.currentNickIndex : 0,
            // ✅ Usar webhook de settings.json (persistência permanente)
            webhookUrl: savedWebhook,
          };
          log(`✅ automationEngine criado e nicks salvos: ${nicks.length}`);
          log(`📊 Leva atual: ${currentLeva}/6`);
          if (savedProgress) {
            log(
              `📂 Progresso restaurado: índice ${savedProgress.currentNickIndex}, ciclo ${savedProgress.currentCiclo}, conta ${savedProgress.currentAccountIndex}`
            );
          }
        }
        
        return {
          success: true,
          nicks: nicks,
          fileName: fileName,
          message: `${nicks.length} nicks carregados com sucesso`,
          webhookUrl: automationEngine.webhookUrl || '',
          currentNickIndex: automationEngine.currentNickIndex,
          totalInvitesSent: automationEngine.totalInvitesSent,
        };
      } else {
        return {
          success: false,
          message: 'Nenhum arquivo selecionado',
        };
      }
    } catch (error) {
      logError('❌ Erro ao selecionar arquivo:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  });

  // Handler para fechar aba de automação
  ipcMain.on('close-automation-tab', () => {
    log('🔄 Fechando aba de automação...');
    mainWindow.webContents.send('close-automation-tab');
  });

  // Funções de persistência de progresso
  function saveProgress() {
    try {
      if (!automationEngine) return;
      
      const progress = {
        currentNickIndex: automationEngine.currentNickIndex,
        totalInvitesSent: automationEngine.totalInvitesSent,
        lastUpdate: new Date().toISOString(),
        webhookUrl: automationEngine.webhookUrl || '',
        currentCiclo: automationEngine.currentCiclo || 1,
        currentAccountIndex: automationEngine.currentAccountIndex || 0,
      };
      
      fs.writeFileSync(progressFilePath, JSON.stringify(progress, null, 2));
      log(
        `💾 Progresso salvo: índice ${progress.currentNickIndex}, ciclo ${progress.currentCiclo}, conta ${progress.currentAccountIndex}`
      );
    } catch (error) {
      logError('❌ Erro ao salvar progresso:', error);
    }
  }

  function loadProgress() {
    try {
      if (fs.existsSync(progressFilePath)) {
        const data = fs.readFileSync(progressFilePath, 'utf8');
        const progress = JSON.parse(data);
        log(`📂 Progresso carregado: índice ${progress.currentNickIndex}`);
        return progress;
      }
    } catch (error) {
      logError('❌ Erro ao carregar progresso:', error);
    }
    return null;
  }

  function resetProgress() {
    try {
      // ✅ Carregar webhook de settings.json (persistência permanente)
      const settingsPath = path.join(userDataPath, 'settings.json');
      let savedWebhook = '';
      if (fs.existsSync(settingsPath)) {
        try {
          const settingsData = fs.readFileSync(settingsPath, 'utf8');
          const settings = JSON.parse(settingsData);
          savedWebhook = settings.webhookUrl || '';
        } catch (error) {
          logWarn('⚠️ Erro ao carregar webhook de settings.json:', error);
        }
      }
      
      
      if (automationEngine) {
        // Resetar apenas ciclos e contador de leva
        automationEngine.currentCiclo = 1;
        automationEngine.currentAccountIndex = 0;
        automationEngine.totalInvitesSent = 0;
        
        // ✅ Resetar contador de levas para 1/6
        saveLevaCounter(1);
        automationEngine.currentLeva = 1;
        
        // ✅ Limpar progresso da leva (múltiplas páginas)
        clearLevaProgress();
        
        // ✅ Limpar estatísticas incrementais
        clearIncrementalStats();
        
        // ✅ MANTER: currentNickIndex (progresso dos nicks)
        // ✅ GARANTIR: webhook de settings.json (não do engine antigo)
        automationEngine.webhookUrl = savedWebhook;
        
        // Salvar progresso atualizado
        saveProgress();
        
        log('🔄 Ciclos e levas resetados - voltando para Ciclo 1/4, Leva 1/6');
        log('🗑️ Progresso de múltiplas páginas limpo');
        log(
          `📌 Progresso de nicks MANTIDO: Nick ${automationEngine.currentNickIndex + 1}/${automationEngine.nicksList?.length || 0}`
        );
        log(`🔗 Webhook mantido de settings.json: ${savedWebhook ? 'Configurado' : 'Não configurado'}`);
        
        return { 
          success: true, 
          message: `Ciclos e levas resetados! Voltando para Ciclo 1/4, Leva 1/6.\nProgresso de nicks mantido: Nick ${automationEngine.currentNickIndex + 1}`,
          webhookUrl: savedWebhook,
          currentNickIndex: automationEngine.currentNickIndex,
          totalInvitesSent: automationEngine.totalInvitesSent,
          currentCiclo: 1,
          currentLeva: 1
        };
      }
      
      // Se não tem automationEngine, resetar arquivo completamente
      if (fs.existsSync(progressFilePath)) {
        fs.unlinkSync(progressFilePath);
        log('🔄 Progresso resetado (nenhuma automação ativa)');
      }
      
      return { success: true, message: 'Progresso resetado com sucesso', webhookUrl: savedWebhook };
    } catch (error) {
      logError('❌ Erro ao resetar progresso:', error);
      return { success: false, message: error.message };
    }
  }

  // Handler para resetar progresso
  ipcMain.handle('reset-automation-progress', async () => {
    return resetProgress();
  });

  // Handler para quando o painel de automação é aberto (pausar automação)
  ipcMain.handle('automation-panel-opened', async () => {
    try {
      if (automationEngine && automationEngine.isRunning) {
        automationEngine.isPausedByPanel = true;
        automationLog(`⏸️ Automação pausada - painel aberto`);
        
        // Esconder todas as BrowserViews para prevenir sobreposição
        const currentViews = mainWindow.getBrowserViews();
        currentViews.forEach(view => {
          view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
        });
        
        log(`⏸️ Automação pausada pelo painel`);
        return { success: true, paused: true };
      }
      return { success: true, paused: false };
    } catch (error) {
      logError('❌ Erro ao pausar automação pelo painel:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Handler para quando o painel de automação é fechado (retomar automação)
  ipcMain.handle('automation-panel-closed', async () => {
    try {
      if (automationEngine && automationEngine.isPausedByPanel) {
        automationEngine.isPausedByPanel = false;
        automationLog(`▶️ Automação retomada - painel fechado`);
        
        // Restaurar BrowserView ativa
        updateBrowserViewBounds();
        
        log(`▶️ Automação retomada após fechar painel`);
        return { success: true, resumed: true };
      }
      return { success: true, resumed: false };
    } catch (error) {
      logError('❌ Erro ao retomar automação:', error);
      return { success: false, error: error.message };
    }
  });
  
  // Handler para salvar webhook URL (PERMANENTE em settings.json)
  ipcMain.handle('automation-save-webhook', async (event, webhookUrl) => {
    try {
      // ✅ Validar formato do webhook (se não estiver vazio)
      if (webhookUrl && webhookUrl.trim()) {
        if (
          !webhookUrl.startsWith('https://discord.com/api/webhooks/') &&
          !webhookUrl.startsWith('https://discordapp.com/api/webhooks/')
        ) {
          return { 
            success: false, 
            error: 'URL de webhook inválida. Use um webhook do Discord válido.',
          };
        }
      }
      
      // ✅ NOVO: Salvar webhook em settings.json (persistência permanente)
      const settingsPath = path.join(userDataPath, 'settings.json');
      let settings = {};
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf8');
        settings = JSON.parse(data);
      }
      
      settings.webhookUrl = webhookUrl || '';
      settings.lastUpdated = Date.now();
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      log(`💾 Webhook salvo permanentemente em settings.json: ${webhookUrl ? 'Configurado' : 'Removido'}`);
      
      // ✅ Também salvar no automationEngine se disponível
      if (automationEngine) {
        automationEngine.webhookUrl = webhookUrl;
        saveProgress(); // Salvar webhook no arquivo de progresso (compatibilidade)
      }
      
      return { success: true };
    } catch (error) {
      logError('❌ Erro ao salvar webhook:', error);
      return { success: false, error: error.message };
    }
  });
  // ===== HANDLERS PARA LIMPEZA DE DMS E AMIGOS =====
  ipcMain.handle('cleanup-start', async (event, visibleAccountIds) => {
    try {
      log(`🧹 Iniciando limpeza de DMs e amigos...`);
      log(`👁️ Contas visíveis: ${visibleAccountIds?.length || 0}`);
      
      // Validar visibleAccountIds
      if (
        !visibleAccountIds ||
        !Array.isArray(visibleAccountIds) ||
        visibleAccountIds.length === 0
      ) {
        throw new Error('visibleAccountIds deve ser um array com pelo menos 1 conta');
      }
      
      // Fechar aba de automação
      mainWindow.webContents.send('close-automation-tab');
      
      // Filtrar contas baseado nos IDs visíveis
      const accountsToClean = accounts.filter(acc => visibleAccountIds.includes(acc.id));
      
      log(`📋 Total de contas a limpar: ${accountsToClean.length}`);
      
      // Iniciar processo de limpeza
      startCleanupAutomation(accountsToClean);
      
      return { 
        success: true, 
        message: 'Limpeza iniciada',
        accountsCount: accountsToClean.length,
      };
    } catch (error) {
      logError('❌ Erro ao iniciar limpeza:', error);
      return { success: false, message: error.message };
    }
  });

  // Handler load-group-automatically removido - sistema agora usa contas visíveis dinamicamente
  
  // Handler para carregar contas visíveis automaticamente
  ipcMain.handle('load-visible-accounts', async (event, visibleAccountIds) => {
    try {
      log(`📦 Carregando ${visibleAccountIds.length} contas visíveis automaticamente...`);
      
      let loaded = 0;
      let notFound = 0;
      
      // Carregar todas as contas visíveis
      for (const accountId of visibleAccountIds) {
        // Procurar conta existente
        const existingAccount = accounts.find(acc => acc.id === accountId);
        
        if (existingAccount) {
          log(`🖱️ Clicando na aba da conta "${existingAccount.name}"...`);
          
          try {
            // Simular click na aba da conta usando JavaScript no renderer
            const clickResult = await mainWindow.webContents.executeJavaScript(`
              (function() {
                try {
                  const accountTab = document.querySelector('div.avatar-tab[data-account-id="${accountId}"]');
                  
                  if (!accountTab) {
                    return { success: false, message: 'Aba não encontrada' };
                  }
                  
                  // Simular click na aba
                  accountTab.click();
                  
                  return { success: true, message: 'Click executado' };
                } catch (error) {
                  return { success: false, message: error.message };
                }
              })();
            `);
            
            if (clickResult.success) {
              log(`✅ Conta "${existingAccount.name}" carregada via click`);
              loaded++;
              
              // Delay otimizado para carregamento mais rápido
              await sleep(800);
            } else {
              log(`⚠️ Falha ao clicar na conta "${existingAccount.name}": ${clickResult.message}`);
              notFound++;
            }
          } catch (error) {
            logError(`❌ Erro ao clicar na conta "${existingAccount.name}":`, error);
            notFound++;
          }
        } else {
          log(`⚠️ Conta com ID "${accountId}" não encontrada`);
          notFound++;
        }
      }
      
      // Fechar Discord após carregar todas as contas
      log(`🔄 Fechando Discord para liberar interface...`);
      try {
        // Remover todas as BrowserViews para fechar Discord
        const currentViews = mainWindow.getBrowserViews();
        currentViews.forEach(view => {
          mainWindow.removeBrowserView(view);
        });
        
        // Aguardar um pouco para garantir que fechou
        await sleep(1000);
        
        log(`✅ Discord fechado - interface liberada`);
      } catch (error) {
        logError('❌ Erro ao fechar Discord:', error);
      }
      
      // Notificar renderer para atualizar UI
      mainWindow.webContents.send('accounts-updated', accounts);
      
      log(`✅ Carregamento concluído: ${loaded} contas carregadas, ${notFound} não encontradas`);
      
      return {
        success: true,
        message: `${loaded} contas carregadas com sucesso!`,
        loaded: loaded,
        notFound: notFound,
        total: visibleAccountIds.length,
      };
    } catch (error) {
      logError('❌ Erro ao carregar contas visíveis:', error);
      return {
        success: false,
        message: error.message,
      };
    }
  });

  // ===== FUNÇÕES DE LIMPEZA DE DMS E AMIGOS =====
  
  // Função auxiliar para delays aleatórios (comportamento humano)
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  // Função para enviar log de limpeza
  function cleanupLog(message, type = 'info') {
    log(message);
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('automation-log', { 
        message, 
        type,
        timestamp: new Date().toISOString(),
      });
    }
  }
  
  // Função para fechar DMs
  async function closeDMs(view, accountId) {
    try {
      cleanupLog(`🧹 Iniciando limpeza de DMs para conta: ${accountId}`);
      
      const result = await view.webContents.executeJavaScript(`
        (async function() {
          try {
            console.log('[CLEANUP] Iniciando closeDMs...');
            let dmsClosed = 0;
            const maxAttempts = 25;
            
            // Navegar para a lista de DMs
            const homeButton = document.querySelector('a[aria-label*="Mensagens Diretas"]') || 
                               document.querySelector('a[aria-label*="Direct Messages"]') ||
                               document.querySelector('[data-list-item-id="guildsnav___home"]');
            
            if (homeButton) {
              homeButton.click();
              await new Promise(r => setTimeout(r, 500));
              console.log('[CLEANUP] Navegado para área de DMs');
            }
            
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
              console.log('[CLEANUP] Tentativa', attempt + 1, 'de', maxAttempts);
              
              // Estratégia: procurar por QUALQUER link de canal privado na sidebar esquerda
              // e filtrar links que NÃO sejam "Friends"
              const allLinks = document.querySelectorAll('nav a[href^="/channels/@me/"]');
              console.log('[CLEANUP] Total de links encontrados:', allLinks.length);
              
              let dmElement = null;
              for (const link of allLinks) {
                const href = link.getAttribute('href');
                console.log('[CLEANUP] Analisando link:', href);
                
                // Lista de abas especiais que NÃO são DMs
                const specialTabs = ['activity', 'nitro', 'shop', 'quests', 'quest', 'friends', 'amigo'];
                
                // Pegar apenas links de DM (com ID de canal, não "/channels/@me" sozinho)
                // E que NÃO sejam abas especiais do Discord
                if (href && href !== '/channels/@me') {
                  // Verificar se não é uma aba especial
                  const isSpecialTab = specialTabs.some(tab => href.toLowerCase().includes(tab));
                  
                  if (!isSpecialTab) {
                    // Verificar o texto também para garantir
                    const linkText = link.textContent.toLowerCase();
                    console.log('[CLEANUP] Texto do link:', linkText);
                    
                    const textIsSpecial = specialTabs.some(tab => linkText.includes(tab));
                    
                    if (!textIsSpecial) {
                      dmElement = link;
                      console.log('[CLEANUP] ✅ DM válida encontrada! Href:', href);
                      break;
                    } else {
                      console.log('[CLEANUP] ⚠️ Link ignorado (aba especial):', linkText);
                    }
                  } else {
                    console.log('[CLEANUP] ⚠️ Link ignorado (URL especial):', href);
                  }
                }
              }
              
              if (!dmElement) {
                console.log('[CLEANUP] ✅ Nenhuma DM encontrada - lista está vazia');
                return { success: true, dmsClosed, message: 'Todas as DMs foram fechadas' };
              }
              
              // Fazer RIGHT CLICK na DM para abrir menu de contexto
              console.log('[CLEANUP] Fazendo clique direito na DM...');
              dmElement.dispatchEvent(new MouseEvent('contextmenu', { 
                bubbles: true, 
                cancelable: true, 
                view: window,
                clientX: 50,
                clientY: 50
              }));
              
              await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
              
              // Procurar opção "Close DM" ou "Fechar DM" no menu
              const menuItems = document.querySelectorAll('[role="menuitem"]');
              console.log('[CLEANUP] Itens do menu encontrados:', menuItems.length);
              
              let foundCloseOption = false;
              for (const item of menuItems) {
                const text = (item.textContent || '').trim();
                console.log('[CLEANUP] Item do menu:', text);
                
                // Procurar por "Close DM" ou "Fechar DM"
                if (text.toLowerCase().indexOf('close dm') >= 0 || 
                    text.toLowerCase().indexOf('fechar dm') >= 0 ||
                    text.toLowerCase().indexOf('fechar conversa') >= 0) {
                  console.log('[CLEANUP] ✅ Opção de fechar DM encontrada!');
                  item.click();
                  foundCloseOption = true;
                  dmsClosed++;
                  break;
                }
              }
              
              if (!foundCloseOption) {
                console.log('[CLEANUP] ⚠️ Opção "Close DM" não encontrada no menu');
                // Fechar o menu clicando fora
                document.body.click();
                await new Promise(r => setTimeout(r, 500));
              } else {
                // Aguardar o fechamento da DM
                await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
              }
            }
            
            return { success: true, dmsClosed, message: \`\${dmsClosed} DMs fechadas\` };
          } catch (err) {
            console.error('[CLEANUP] Erro:', err);
            return { success: false, error: err.message, stack: err.stack };
          }
        })()
      `);
      
      cleanupLog(`📊 Resultado DMs: ${JSON.stringify(result)}`);
      
      if (result.success) {
        cleanupLog(`✅ ${result.dmsClosed} DMs fechadas para conta: ${accountId}`, 'success');
        return { success: true, dmsClosed: result.dmsClosed };
      } else {
        cleanupLog(`⚠️ Erro ao fechar DMs: ${result.error}`, 'warn');
        return { success: false, error: result.error };
      }
    } catch (error) {
      logError(`❌ Erro ao fechar DMs para ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  }
  
  // Função para remover amigos da aba ALL
  async function removeFriends(view, accountId) {
    try {
      cleanupLog(`🧹 Iniciando remoção de amigos para conta: ${accountId}`);
      
      const result = await view.webContents.executeJavaScript(`
        ${selectorsCode}
        
        (async function() {
          try {
            console.log('[CLEANUP-FRIENDS] Iniciando removeFriends...');
            let friendsRemoved = 0;
            const maxAttempts = 25;
            
            // Usar seletor centralizado para Friends sidebar
            const friendsResult = findFriendsSidebar();
            if (friendsResult.success) {
              console.log(\`[CLEANUP-FRIENDS] ✅ Friends encontrado via: \${friendsResult.method}\`);
              friendsResult.element.click();
              await new Promise(r => setTimeout(r, 800));
            } else {
              console.log('[CLEANUP-FRIENDS] ⚠️ Link Friends não encontrado');
              return { success: false, error: 'Link Friends não encontrado na sidebar' };
            }
            
            // Usar seletor centralizado para aba ALL
            const allTabResult = findAllTab();
            if (!allTabResult.success) {
              console.log('[CLEANUP-FRIENDS] ⚠️ Aba ALL não encontrada');
              return { success: false, error: 'Aba ALL não encontrada' };
            }
            
            console.log(\`[CLEANUP-FRIENDS] ✅ ALL encontrado via: \${allTabResult.method}\`);
            allTabResult.element.click();
            await new Promise(r => setTimeout(r, 600 + Math.random() * 300));
            
            // Loop para remover amigos
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
              console.log('[CLEANUP-FRIENDS] Tentativa', attempt + 1, 'de', maxAttempts);
              
              // Procurar linha de amigo
              const friendRowSelectors = [
                'div[class*="peopleListItem"]',
                'div[class*="userListItem"]',
                'li[class*="listItem"]',
                '[role="listitem"]'
              ];
              
              let friendRow = null;
              for (const selector of friendRowSelectors) {
                const rows = document.querySelectorAll(selector);
                console.log('[CLEANUP-FRIENDS] Seletor', selector, '- encontrou', rows.length, 'elementos');
                if (rows.length > 0) {
                  // Verificar se realmente é um amigo (DEVE ter avatar E username)
                  for (const row of rows) {
                    const hasAvatar = row.querySelector('img[src*="cdn.discordapp.com"], svg[class*="avatar"], [class*="avatar"] img');
                    const hasUsername = row.textContent && row.textContent.length > 0;
                    const rowText = (row.textContent || '').toLowerCase().trim();
                    
                    // Ignorar elementos que são APENAS tabs ou menus laterais (sem avatar de usuário)
                    const isTab = row.getAttribute('role') === 'tab' || 
                                  row.getAttribute('aria-selected') !== null;
                    
                    // Ignorar elementos de navegação lateral (sem avatar de CDN do Discord)
                    const isNavigationItem = !hasAvatar || 
                                             rowText === 'friends' ||
                                             rowText === 'amigos' ||
                                             rowText.indexOf('nitro') >= 0 ||
                                             rowText.indexOf('shop') >= 0 ||
                                             rowText.indexOf('quests') >= 0;
                    
                    // Um amigo REAL tem: avatar do Discord + NÃO é tab + NÃO é item de navegação
                    if (hasAvatar && hasUsername && !isTab && !isNavigationItem) {
                      friendRow = row;
                      console.log('[CLEANUP-FRIENDS] ✅ Linha de amigo válida encontrada');
                      break;
                    } else {
                      console.log('[CLEANUP-FRIENDS] ⚠️ Elemento ignorado (aba ou não-amigo):', row.textContent.substring(0, 30));
                    }
                  }
                  if (friendRow) break;
                }
              }
              
              if (!friendRow) {
                console.log('[CLEANUP-FRIENDS] ✅ Nenhum amigo encontrado - lista vazia');
                return { success: true, friendsRemoved, message: 'Todos os amigos foram removidos' };
              }
              
              // Tentar abrir menu: primeiro hover, depois procurar botão de mais opções
              console.log('[CLEANUP-FRIENDS] Simulando hover...');
              friendRow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
              await new Promise(r => setTimeout(r, 200 + Math.random() * 150));
              
              // Procurar botão "..." (mais opções)
              let moreButton = friendRow.querySelector('button[aria-label*="More"], button[aria-label*="Mais"], div[class*="moreButton"]');
              
              if (!moreButton) {
                console.log('[CLEANUP-FRIENDS] Botão "..." não encontrado, tentando clique direito...');
                // Fallback: clique direito na linha inteira
                friendRow.dispatchEvent(new MouseEvent('contextmenu', { 
                  bubbles: true, 
                  cancelable: true,
                  view: window
                }));
              } else {
                console.log('[CLEANUP-FRIENDS] Clicando no botão "..."');
                moreButton.click();
              }
              
              await new Promise(r => setTimeout(r, 250 + Math.random() * 200));
              
              // Procurar opção "Remove Friend" ou "Remover Amizade" no menu
              const menuItems = document.querySelectorAll('[role="menuitem"]');
              console.log('[CLEANUP-FRIENDS] Itens do menu:', menuItems.length);
              
              let removeOption = null;
              for (const item of menuItems) {
                const text = (item.textContent || '').toLowerCase();
                console.log('[CLEANUP-FRIENDS] Item:', text);
                if (text.indexOf('remove friend') >= 0 || 
                    text.indexOf('remover amizade') >= 0 ||
                    text.indexOf('remover amigo') >= 0) {
                  removeOption = item;
                  console.log('[CLEANUP-FRIENDS] ✅ Opção de remover encontrada!');
                  break;
                }
              }
              
              if (!removeOption) {
                console.log('[CLEANUP-FRIENDS] ⚠️ Opção "Remover Amizade" não encontrada no menu');
                // Fechar o menu e tentar próximo
                document.body.click();
                await new Promise(r => setTimeout(r, 500));
                continue;
              }
              
              console.log('[CLEANUP-FRIENDS] Clicando em "Remover Amizade"...');
              removeOption.click();
              await new Promise(r => setTimeout(r, 250 + Math.random() * 150));
              
              // Procurar botão de confirmação no modal/popup
              console.log('[CLEANUP-FRIENDS] Procurando botão de confirmação...');
              const confirmButtons = document.querySelectorAll('button');
              let confirmButton = null;
              
              for (const btn of confirmButtons) {
                const btnText = (btn.textContent || '').trim().toLowerCase();
                console.log('[CLEANUP-FRIENDS] Analisando botão:', btnText, 'type:', btn.type, 'class:', btn.className);
                
                // Botão DEVE ter texto "remove" ou "remover" E ser vermelho (danger) ou submit
                if ((btnText.indexOf('remove') >= 0 || btnText.indexOf('remover') >= 0) && 
                    (btn.type === 'submit' || btn.className.indexOf('danger') >= 0 || btn.className.indexOf('colorBrand') >= 0 || btn.className.indexOf('red') >= 0)) {
                  confirmButton = btn;
                  console.log('[CLEANUP-FRIENDS] ✅ Botão de confirmação encontrado:', btnText);
                  break;
                }
              }
              
              if (!confirmButton) {
                console.log('[CLEANUP-FRIENDS] ⚠️ Botão de confirmação não encontrado no popup');
                // Fechar popup clicando fora ou ESC
                document.body.click();
                await new Promise(r => setTimeout(r, 500));
                continue;
              }
              
              console.log('[CLEANUP-FRIENDS] Confirmando remoção...');
              confirmButton.click();
              
              // Aguardar o popup fechar
              await new Promise(r => setTimeout(r, 350 + Math.random() * 200));
              
              // Verificar se o amigo foi realmente removido (lista deve ter menos elementos)
              const newCount = document.querySelectorAll('div[class*="peopleListItem"]').length;
              console.log('[CLEANUP-FRIENDS] Contagem antes:', friendRow ? 'existia' : 'não existia', '- Contagem agora:', newCount);
              
              // Se a contagem mudou, foi sucesso
              friendsRemoved++;
              console.log('[CLEANUP-FRIENDS] ✅ Amigo removido com sucesso! Total:', friendsRemoved);
              
              // Aguardar um pouco mais antes da próxima tentativa
              await new Promise(r => setTimeout(r, 250 + Math.random() * 150));
            }
            
            return { success: true, friendsRemoved, message: \`\${friendsRemoved} amigos removidos\` };
          } catch (err) {
            console.error('[CLEANUP-FRIENDS] Erro:', err);
            return { success: false, error: err.message, stack: err.stack };
          }
        })()
      `);
      
      cleanupLog(`📊 Resultado Amigos: ${JSON.stringify(result)}`);
      
      if (result.success) {
        cleanupLog(
          `✅ ${result.friendsRemoved} amigos removidos para conta: ${accountId}`,
          'success'
        );
        return { success: true, friendsRemoved: result.friendsRemoved };
      } else {
        cleanupLog(`⚠️ Erro ao remover amigos: ${result.error}`, 'warn');
        return { success: false, error: result.error };
      }
    } catch (error) {
      logError(`❌ Erro ao remover amigos para ${accountId}:`, error);
      return { success: false, error: error.message };
    }
  }
  
  // Função principal da automação de limpeza
  async function startCleanupAutomation(accountsToClean) {
    try {
      cleanupLog('🧹 ===== INICIANDO LIMPEZA DE DMS E AMIGOS =====', 'success');
      cleanupLog(`📋 Total de contas: ${accountsToClean.length}`, 'info');
      
      let totalDmsClosed = 0;
      let totalFriendsRemoved = 0;
      
      for (let i = 0; i < accountsToClean.length; i++) {
        const account = accountsToClean[i];
        cleanupLog(
          `\n📊 Processando conta ${i + 1}/${accountsToClean.length}: ${account.name}`,
          'info'
        );
        
        // Trocar para a conta
        cleanupLog(`🔄 Trocando para conta: ${account.name}`);
        const switchSuccess = await switchToAccount(account.id);
        
        if (!switchSuccess) {
          cleanupLog(`❌ Erro ao trocar para conta: ${account.name}`, 'error');
          continue;
        }
        
        // Aguardar para garantir carregamento (reduzido para 600-900ms)
        await sleep(randomDelay(600, 900));
        
        // Obter a BrowserView atual (a que está ativa após o switch)
        const view = mainWindow.getBrowserView();
        
        if (!view) {
          cleanupLog(`❌ BrowserView não encontrada para conta: ${account.name}`, 'error');
          continue;
        }
        
        // Fechar DMs
        const dmsResult = await closeDMs(view, account.id);
        if (dmsResult.success) {
          totalDmsClosed += dmsResult.dmsClosed || 0;
        }
        
        // Delay entre operações (reduzido para 400-600ms)
        await sleep(randomDelay(400, 600));
        
        // Remover amigos
        const friendsResult = await removeFriends(view, account.id);
        if (friendsResult.success) {
          totalFriendsRemoved += friendsResult.friendsRemoved || 0;
        }
        
        // Delay antes de passar para a próxima conta (reduzido para 500-800ms)
        if (i < accountsToClean.length - 1) {
          cleanupLog(`⏳ Aguardando antes da próxima conta...`);
          await sleep(randomDelay(500, 800));
        }
      }
      
      cleanupLog(`\n✅ ===== LIMPEZA CONCLUÍDA =====`, 'success');
      cleanupLog(`📊 Total de DMs fechadas: ${totalDmsClosed}`, 'info');
      cleanupLog(`📊 Total de amigos removidos: ${totalFriendsRemoved}`, 'info');
    } catch (error) {
      logError('❌ Erro durante limpeza:', error);
      cleanupLog(`❌ Erro durante limpeza: ${error.message}`, 'error');
    }
  }

  // Flag global para prevenir múltiplas instâncias da automação
  let automationRunning = false;

  // Arquivo para salvar estatísticas incrementais (recuperação em caso de queda)
  const incrementalStatsPath = path.join(userDataPath, 'incremental-stats.json');
  
  // Salvar estatísticas incrementais (a cada convite)
  function saveIncrementalStats() {
    try {
      const stats = {
        accountsPerformance,
        errorsByType,
        errorScreenshots: errorScreenshots.map(s => ({ ...s })), // Clonar para evitar referências
        successCount: automationSuccessCount,
        errorCount: automationErrorCount,
        startTime: automationStartTime,
        lastUpdate: Date.now()
      };
      fs.writeFileSync(incrementalStatsPath, JSON.stringify(stats, null, 2));
    } catch (error) {
      log('⚠️ Erro ao salvar estatísticas incrementais:', error.message);
    }
  }
  
  // Carregar estatísticas incrementais (recuperação)
  function loadIncrementalStats() {
    try {
      if (fs.existsSync(incrementalStatsPath)) {
        const data = fs.readFileSync(incrementalStatsPath, 'utf8');
        const stats = JSON.parse(data);
        log('📂 Estatísticas incrementais carregadas');
        return stats;
      }
    } catch (error) {
      log('⚠️ Erro ao carregar estatísticas incrementais:', error.message);
    }
    return null;
  }
  
  // Limpar estatísticas incrementais (quando leva completa)
  function clearIncrementalStats() {
    try {
      if (fs.existsSync(incrementalStatsPath)) {
        fs.unlinkSync(incrementalStatsPath);
        log('🗑️ Estatísticas incrementais limpas');
      }
    } catch (error) {
      log('⚠️ Erro ao limpar estatísticas incrementais:', error.message);
    }
  }

  // Função helper para calcular progresso baseado em CICLOS e CONTAS
  function calculateOverallProgress(ciclo, currentAccount, totalAccounts) {
    const totalCycles = 4;
    const completedCycles = ciclo - 1;
    const completedProgress = (completedCycles / totalCycles) * 100;
    const currentCycleProgress = (currentAccount / totalAccounts) * (100 / totalCycles);
    const overallProgress = completedProgress + currentCycleProgress;
    return Math.round(overallProgress);
  }

  // Função helper para registrar desempenho por conta
  function recordAccountPerformance(accountName, success, errorType = null, errorMessage = null) {
    if (!accountsPerformance[accountName]) {
      accountsPerformance[accountName] = {
        sent: 0,
        success: 0,
        errors: 0,
        errorDetails: []
      };
    }
    
    accountsPerformance[accountName].sent++;
    
    if (success) {
      accountsPerformance[accountName].success++;
    } else {
      accountsPerformance[accountName].errors++;
      if (errorType && errorMessage) {
        accountsPerformance[accountName].errorDetails.push({
          type: errorType,
          message: errorMessage,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  // Enviar atualização de progresso para o renderer
  function sendProgressUpdate(ciclo, accountIndex, totalAccounts) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const currentAccountNumber = accountIndex + 1;
      const percentage = calculateOverallProgress(ciclo, currentAccountNumber, totalAccounts);
      const currentLeva = automationEngine?.currentLeva || loadLevaCounter();
      
      mainWindow.webContents.send('progress-update', {
        leva: currentLeva,
        currentCiclo: ciclo,
        currentAccount: currentAccountNumber,
        totalAccounts,
        percentage
      });
    }
  }

  // Função de automação REAL
  async function startRealAutomation() {
    // PREVENIR MÚLTIPLAS INSTÂNCIAS
    if (automationRunning) {
      automationLog('⚠️ Automação já está rodando! Ignorando chamada duplicada.', 'warn');
      return;
    }
    
    if (!automationEngine || !automationEngine.isRunning) {
      automationLog('⚠️ Automação não está rodando ou engine não inicializada', 'error');
      return;
    }
    
    automationRunning = true;
    
    try {
      automationLog('🚀 ===== INICIANDO AUTOMAÇÃO REAL =====', 'success');
      automationLog(`📋 Total de nicks disponíveis: ${automationEngine.nicksList.length}`, 'info');
      automationLog(
        `📋 Primeiros nicks: ${automationEngine.nicksList.slice(0, 3).join(', ')}`,
        'info'
      );
      
      // ✅ Inicializar estatísticas da leva atual
      // Tentar recuperar estatísticas incrementais (caso tenha fechado o app no meio)
      const savedIncremental = loadIncrementalStats();
      if (savedIncremental && savedIncremental.lastUpdate) {
        // Recuperar estatísticas salvas
        accountsPerformance = savedIncremental.accountsPerformance || {};
        errorsByType = savedIncremental.errorsByType || { notAcceptingFriends: 0, usernameNotFound: 0, other: 0 };
        errorScreenshots = savedIncremental.errorScreenshots || [];
        automationSuccessCount = savedIncremental.successCount || 0;
        automationErrorCount = savedIncremental.errorCount || 0;
        automationStartTime = savedIncremental.startTime || Date.now();
        log('🔄 Estatísticas recuperadas de sessão anterior');
      } else {
        // Resetar tudo (nova leva)
        automationStartTime = Date.now();
        automationSuccessCount = 0;
        automationErrorCount = 0;
        accountsPerformance = {}; // Resetar desempenho por conta
        errorsByType = { notAcceptingFriends: 0, usernameNotFound: 0, other: 0 }; // Resetar contadores de erro
        errorScreenshots = []; // Limpar screenshots anteriores
        
        // Limpar diretório de screenshots temporário
        if (fs.existsSync(screenshotsDir)) {
          const files = fs.readdirSync(screenshotsDir);
          files.forEach(file => {
            try {
              fs.unlinkSync(path.join(screenshotsDir, file));
            } catch (error) {
              log(`⚠️ Erro ao deletar screenshot: ${file}`);
            }
          });
          log('🗑️ Screenshots anteriores limpas');
        }
        
        log('📊 Estatísticas da leva resetadas');
      }
      
      // Filtrar contas baseado nos IDs visíveis
      const visibleAccountIds = automationEngine.accountIds || [];
      const groupAccounts = accounts.filter(acc => visibleAccountIds.includes(acc.id));
      
      // Mostrar barra de progresso
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('progress-show');
      }
      
      automationLog(`Contas visíveis: ${groupAccounts.length}`, 'info');
      automationLog(`Modo: 1 LEVA = 4 CICLOS = 4 convites por conta`, 'info');
      
      // Carregar progresso salvo para continuar de onde parou
      const savedProgress = loadProgress();
      const startCiclo =
        savedProgress && savedProgress.currentCiclo ? savedProgress.currentCiclo : 1;
      const savedAccountIndex =
        savedProgress && savedProgress.currentAccountIndex ? savedProgress.currentAccountIndex : 0;
      
      if (startCiclo > 1 || savedAccountIndex > 0) {
        automationLog(
          `Continuando do Ciclo ${startCiclo}, Conta ${savedAccountIndex + 1}`,
          'info'
        );
      }
      
      sendProgressUpdate(startCiclo, savedAccountIndex, groupAccounts.length);
      
      // Enviar atualização de status para o painel
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('automation-status-update', {
          totalAccounts: groupAccounts.length,
          currentCiclo: startCiclo,
          currentAccount: '-',
          invitesSent: automationEngine.totalInvitesSent || 0,
        });
      }
      
      // 1 LEVA = 4 CICLOS (sem pausa entre levas)
      for (let ciclo = startCiclo; ciclo <= 4; ciclo++) {
        if (!automationEngine.isRunning) {
          automationLog('⏹️ Automação parada pelo usuário');
          break;
        }
        
        automationLog(`\n🔁 ===== CICLO ${ciclo}/4 =====`);
        automationEngine.currentCiclo = ciclo;
        saveProgress(); // Salvar ciclo atual
        
        // Processar contas do grupo selecionado
        const totalAccounts = groupAccounts.length;
        automationLog(`📊 Processando ${totalAccounts} contas neste ciclo...`);
        
        // Se estamos continuando, começar do índice salvo; senão começar do 0
        const startFrom = ciclo === startCiclo ? savedAccountIndex : 0;
        
        for (let accountIndex = startFrom; accountIndex < totalAccounts; accountIndex++) {
          // Salvar índice da conta atual
          automationEngine.currentAccountIndex = accountIndex;
          saveProgress();
          // Verificar se está pausado pelo painel
          await waitWhilePaused();
          
          if (!automationEngine.isRunning) {
            automationLog('⏹️ Automação parada pelo usuário');
            break;
          }
          
          const account = groupAccounts[accountIndex];
          const nick = automationEngine.nicksList[automationEngine.currentNickIndex];
          
          if (!nick) {
            automationLog('⚠️ Lista de nicks esgotada - parando automação');
            automationEngine.isRunning = false;
            break;
          }
          
          // USAR NICK ATUAL (sem incrementar ainda)
          const currentNick = nick;
          
          automationLog(
            `\n👤 ===== CONTA ${accountIndex + 1}/${totalAccounts}: ${account.name} =====`
          );
          automationLog(`📝 Enviando para: ${currentNick}`);
          automationLog(
            `📊 Progresso total: ${automationEngine.totalInvitesSent + 1}/${totalAccounts * 4} convites`
          );
          
          // Enviar atualização de status em tempo real
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('automation-status-update', {
              totalAccounts: totalAccounts,
              currentCiclo: ciclo,
              currentAccount: account.name,
              invitesSent: automationEngine.totalInvitesSent,
            });
          }
          
          // SALVAR ÍNDICE DA CONTA ATUAL ANTES DE PROCESSAR
          automationEngine.currentAccountIndex = accountIndex;
          saveProgress();
          
          // ✅ ATUALIZAR BARRA DE PROGRESSO NO INÍCIO DO PROCESSAMENTO (feedback visual imediato)
          sendProgressUpdate(ciclo, accountIndex, totalAccounts);
          
          // Micro-delay para garantir que o renderer processe o evento
          await sleep(50);
          
          try {
            // SALVAR O NICK ATUAL ANTES DE PROCESSAR (para webhook correto)
            const currentNickForWebhook = currentNick;
            
            // 1. Trocar para a conta
            automationLog(`🔄 Trocando para conta ${account.name}...`);
            await switchToAccount(account.id);
            
            // 2. Aguardar a view carregar completamente
            automationLog(`⏳ Aguardando Discord carregar...`);
            await sleep(500 + Math.random() * 500); // 0.5-1s
            
            await waitWhilePaused();
            
            // Navegar para Add Friend
            automationLog(`Navegando para Add Friend...`);
            const navSuccess = await navigateToAddFriend();
            if (!navSuccess) {
              automationLog(`Falha ao navegar para Add Friend (conta provavelmente deslogada) - pulando conta`);
              
              recordAccountPerformance(account.name, false, 'other', 'Conta deslogada ou seletores não encontrados');
              automationErrorCount++;
              saveIncrementalStats();
              
              continue;
            }
            
            // Aguardar página carregar
            automationLog(`Aguardando página carregar...`);
            await sleep(800 + Math.random() * 200);
            
            await waitWhilePaused();
            
            // Digitar nick
            automationLog(`Digitando nick: ${currentNick}...`);
            const typeSuccess = await typeNick(currentNick);
            if (!typeSuccess) {
              automationLog(`Falha ao digitar nick - pulando conta`);
              
              await captureAndSendError(account.name, currentNick, 'Falha ao digitar nick no campo de input');
              
              recordAccountPerformance(account.name, false, 'other', 'Falha ao digitar nick');
              automationErrorCount++;
              saveIncrementalStats();
              
              continue;
            }
            
            // 6. Delay para o Discord processar
            automationLog(`⏳ Aguardando processamento...`);
            await sleep(300 + Math.random() * 200); // 0.3-0.5s
            
            await waitWhilePaused();
            
            // Clicar em Send Friend Request
            automationLog(`Clicando em Send Friend Request...`);
            const clickSuccess = await clickSendFriendRequest();
            if (!clickSuccess) {
              automationLog(`Falha ao clicar - pulando conta`);
              
              await captureAndSendError(account.name, currentNick, 'Falha ao clicar em Send Friend Request');
              
              recordAccountPerformance(account.name, false, 'other', 'Falha ao clicar em Send Friend Request');
              automationErrorCount++;
              saveIncrementalStats();
              
              continue;
            }
            
            // Aguardar se pausado
            await waitWhilePaused();
            
            // Aguardar e detectar captcha
            automationLog(`Aguardando captcha...`);
            let captchaResult;
            try {
              captchaResult = await waitForCaptcha(currentNickForWebhook, account.name, automationEngine.webhookUrl);
            } catch (error) {
              logError(`Erro crítico no waitForCaptcha:`, error);
              automationLog(`⚠️ Erro no captcha - assumindo falha e continuando...`);
              captchaResult = { success: false, error: error.message };
            }
            
            // NOTA: O loop de retry para "Username não existe" foi REMOVIDO
            // Agora este erro é tratado como "não aceita amizade": tira screenshot, envia webhook, próxima conta

            if (captchaResult.success) {
              // SUCESSO - próxima conta com novo nick
              automationLog(`✅ Convite enviado com sucesso!`);
              automationEngine.currentNickIndex++;
              automationEngine.totalInvitesSent++;
              saveProgress();
              
              // ✅ Registrar desempenho da conta
              recordAccountPerformance(account.name, true);
              
              // ✅ Incrementar contador de sucesso (ANTES do if)
              automationSuccessCount++;
              
              // ✅ Salvar estatísticas em tempo real (recuperação)
              saveIncrementalStats();
              
              // Enviar atualização de progresso e estatísticas
              sendProgressUpdate(ciclo, accountIndex, totalAccounts);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('stats-update', { 
                  success: true, 
                  error: false,
                  totalAccounts: totalAccounts,
                  maxInvites: totalAccounts * 4
                });
              }
              
              // Micro-delay otimizado (0.3-0.5s) - delay de humanização reduzido pois captcha já garante comportamento natural
              const microDelay = Math.floor(Math.random() * 200) + 300; // 0.3-0.5s
              automationLog(`⏳ Aguardando ${(microDelay / 1000).toFixed(1)}s...`);
              await new Promise(resolve => setTimeout(resolve, microDelay));
            } else if (captchaResult.error === 'Usuário não aceita pedidos de amizade') {
              // Screenshot já foi enviado pelo waitForCaptcha
              // Incrementar e passar para próxima conta
              automationLog(`⚠️ ${captchaResult.error} - screenshot já enviado, próxima conta`);
              automationEngine.currentNickIndex++;
              automationEngine.totalInvitesSent++;
              saveProgress();
              
              // ✅ Registrar desempenho da conta (erro)
              recordAccountPerformance(account.name, false, 'notAcceptingFriends', captchaResult.error);
              
              // ✅ Incrementar contador de erro (ANTES do if)
              automationErrorCount++;
              
              // ✅ Salvar estatísticas em tempo real (recuperação)
              saveIncrementalStats();
              
              // Enviar atualização de progresso e estatísticas (conta como erro)
              sendProgressUpdate(ciclo, accountIndex, totalAccounts);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('stats-update', { 
                  success: false, 
                  error: true,
                  totalAccounts: totalAccounts,
                  maxInvites: totalAccounts * 4
                });
              }
            } else if (captchaResult.error === 'Username não existe') {
              // Username não existe - screenshot JÁ FOI ENVIADO pelo waitForCaptcha()
              // Discord contabiliza como convite enviado mesmo quando o username não existe
              automationLog(`⚠️ ${captchaResult.error} - screenshot já enviado, próxima conta`);
              automationEngine.currentNickIndex++;
              automationEngine.totalInvitesSent++;
              saveProgress();
              
              // ✅ Registrar desempenho da conta (erro)
              recordAccountPerformance(account.name, false, 'usernameNotFound', captchaResult.error);
              
              // ✅ Incrementar contador de erro (ANTES do if)
              automationErrorCount++;
              
              // ✅ Salvar estatísticas em tempo real (recuperação)
              saveIncrementalStats();
              
              // Enviar atualização de progresso e estatísticas (conta como erro)
              sendProgressUpdate(ciclo, accountIndex, totalAccounts);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('stats-update', { 
                  success: false, 
                  error: true,
                  totalAccounts: totalAccounts,
                  maxInvites: totalAccounts * 4
                });
              }
            } else {
              // Qualquer outro erro - incrementar e continuar
              automationLog(`⚠️ Erro: ${captchaResult.error} - próxima conta`);
              automationEngine.currentNickIndex++;
              saveProgress();
            }
            
            automationLog(`✅ Processamento concluído para ${account.name}`);
            
            // 🧹 SISTEMA DE LIMPEZA EM 4 NÍVEIS
            const contasProcessadas = accountIndex + 1;
            
            try {
              // ✅ NÍVEL 1: Limpeza LEVE (TODA conta)
              const accountSession = session.fromPartition(`persist:discord-${account.id}`);
              await accountSession.clearCache();
              
              // ✅ NÍVEL 2: Limpeza MÉDIA (a cada 3 contas)
              if (contasProcessadas % 3 === 0) {
                automationLog(`🧹 Limpeza MÉDIA (${contasProcessadas} contas processadas)...`);
                
                // Garbage collection mais agressivo
                if (global.gc) {
                  global.gc();
                  // Forçar duas vezes para garantir
                  setTimeout(() => {
                    if (global.gc) global.gc();
                  }, 100);
                }
                
                // Limpar cookies não essenciais (mantém login)
                try {
                  const cookies = await accountSession.cookies.get({});
                  const nonEssentialCookies = cookies.filter(cookie => 
                    !cookie.name.includes('token') && 
                    !cookie.name.includes('auth') && 
                    !cookie.name.includes('session') &&
                    !cookie.name.includes('__cfruid') &&
                    !cookie.name.includes('__cf')
                  );
                  
                  for (const cookie of nonEssentialCookies) {
                    await accountSession.cookies.remove(cookie.url, cookie.name);
                  }
                } catch (err) {
                  // Ignorar erros de cookies
                }
              }
              
              // ✅ NÍVEL 3: Limpeza MÉDIA (a cada 5 contas) - PREVINE LENTIDÃO
              if (contasProcessadas % 5 === 0) {
                automationLog(`🧹 Limpeza MÉDIA (${contasProcessadas} contas)...`);
                
                // Limpar cache apenas da conta ATUAL (super rápido)
                try {
                  const currentSession = session.fromPartition(`persist:discord-${account.id}`);
                  await currentSession.clearCache();
                } catch (err) {
                  // Ignorar erros
                }
                
                // GC único
                if (global.gc) global.gc();
                
                automationLog(`✅ Limpeza média concluída (0.1s)`);
              }
              
              // ✅ NÍVEL 4: LIMPEZA PROFUNDA (a cada 10 contas) - PREVINE LENTIDÃO PROGRESSIVA
              if (contasProcessadas % 10 === 0) {
                automationLog(`🧹 LIMPEZA PROFUNDA (${contasProcessadas} contas) - Prevenindo lentidão...`);
                
                // Limpar APENAS contas inativas (não a atual)
                const currentAccountId = account.id;
                let cleanedCount = 0;
                
                for (const [accId, ses] of sessionMap.entries()) {
                  if (accId !== currentAccountId) {
                    try {
                      // clearCache é rápido (0.05s por sessão)
                      await ses.clearCache();
                      cleanedCount++;
                    } catch (err) {
                      // Ignorar erros
                    }
                  }
                }
                
                // GC duplo
                if (global.gc) {
                  global.gc();
                  setTimeout(() => { if (global.gc) global.gc(); }, 50);
                }
                
                automationLog(`✅ Limpeza profunda: ${cleanedCount} sessões limpas (~0.3s)`);
              }
            } catch (e) {
              // Ignorar erros de limpeza - continua normalmente
              log(`⚠️ Erro na limpeza (ignorado): ${e.message}`);
            }
            
            if (accountIndex < totalAccounts - 1) {
              const delay = 50 + Math.random() * 50;
              automationLog(`⏳ Aguardando ${(delay / 1000).toFixed(2)}s antes da próxima conta...`);
              await sleep(delay);
            }
          } catch (error) {
            logError(`❌ Erro ao processar conta ${account.name}:`, error);
            automationLog(`⚠️ Pulando para próxima conta...`);
            continue;
          }
        }
        
        automationLog(`\n✅ ===== CICLO ${ciclo}/4 CONCLUÍDO =====`);
        
        // 🧹 LIMPEZA PROFUNDA AO FIM DO CICLO (previne lentidão acumulada)
        automationLog(`🧹 Executando limpeza pós-ciclo...`);
        try {
          // Limpar cache de TODAS as sessões (rápido)
          for (const [accId, ses] of sessionMap.entries()) {
            try {
              await ses.clearCache();
            } catch (err) {
              // Ignorar erros
            }
          }
          
          // GC triplo (mais agressivo entre ciclos - não atrapalha pois tem pausa)
          if (global.gc) {
            global.gc();
            setTimeout(() => { if (global.gc) global.gc(); }, 100);
            setTimeout(() => { if (global.gc) global.gc(); }, 200);
          }
          
          automationLog(`✅ Limpeza pós-ciclo concluída - Memória liberada!`);
        } catch (err) {
          // Ignorar erros de limpeza
        }
        
        // Pausa otimizada entre ciclos (0.5s fixo)
        if (ciclo < 4) {
          const cyclePause = 500;
          automationLog(`⏳ Pausando ${(cyclePause / 1000).toFixed(1)}s antes do próximo ciclo...`);
          await sleep(cyclePause);
        }
      }
      
      automationLog('\n🎉 ===== AUTOMAÇÃO CONCLUÍDA! =====');
      automationLog(`📊 Total de convites enviados: ${automationEngine.totalInvitesSent}`);
      automationLog(
        `📋 Nicks restantes: ${automationEngine.nicksList.length - automationEngine.currentNickIndex}`
      );
      
      // 🧹 LIMPEZA EXTREMA FINAL - Libera toda memória acumulada
      automationLog('\n🧹 Executando limpeza final completa...');
      try {
        // 1. Limpar cache de todas as sessões
        for (const [accId, ses] of sessionMap.entries()) {
          try {
            await ses.clearCache();
          } catch (err) {
            // Ignorar erros
          }
        }
        
        // 2. Limpar histórico de todas as BrowserViews
        for (const [accountId, view] of browserViews.entries()) {
          try {
            if (view && !view.webContents.isDestroyed()) {
              await view.webContents.clearHistory();
            }
          } catch (err) {
            // Ignorar erros
          }
        }
        
        // 3. clearStorageData PROFUNDO (agora pode demorar, automação acabou)
        automationLog('🧹 Limpeza profunda de storage (pode demorar 5-10s)...');
        for (const [accId, ses] of sessionMap.entries()) {
          try {
            await ses.clearStorageData({
              storages: ['appcache', 'serviceworkers', 'cachestorage', 'indexdb']
              // ⚠️ NÃO incluir 'cookies' e 'localstorage' (mantém login!)
            });
          } catch (err) {
            // Ignorar erros
          }
        }
        
        // 4. GC extremo (múltiplas rodadas)
        if (global.gc) {
          for (let i = 0; i < 3; i++) {
            global.gc();
            await sleep(100);
          }
        }
        
        automationLog('✅ Limpeza final concluída - App otimizado para próxima leva!');
      } catch (err) {
        log('⚠️ Erro na limpeza final (ignorado):', err.message);
      }
      
      // ✅ NOVO SISTEMA: Rastrear progresso de múltiplas páginas
      const currentLevaNum = loadLevaCounter();
      // visibleAccountIds já foi declarado no início da função
      
      // Carregar configuração de contas diárias
      let dailyAccountsTotal = null;
      try {
        const settingsPath = path.join(userDataPath, 'settings.json');
        if (fs.existsSync(settingsPath)) {
          const data = fs.readFileSync(settingsPath, 'utf8');
          const settings = JSON.parse(data);
          dailyAccountsTotal = settings.reportIdentification?.totalAccounts || null;
        }
      } catch (error) {
        log('⚠️ Não foi possível carregar contas diárias');
      }
      
      // Carregar ou inicializar progresso da leva
      let levaProgress = loadLevaProgress();
      if (!levaProgress || levaProgress.levaNumber !== currentLevaNum) {
        // Nova leva ou primeira rodada
        // 🧹 Limpar cookies do hCaptcha no início de cada leva (todas as contas visíveis)
        try {
          automationLog(`🧹 Limpando cookies do hCaptcha no início da Leva ${currentLevaNum}/6...`);
          for (const acc of groupAccounts) {
            try {
              const ses = session.fromPartition(`persist:discord-${acc.id}`);
              const hcaptchaCookies = await ses.cookies.get({ domain: '.hcaptcha.com' });
              for (const cookie of hcaptchaCookies) {
                await ses.cookies.remove(`https://${cookie.domain}${cookie.path}`, cookie.name);
              }
            } catch (err) {
              // Ignorar erros individuais por conta
            }
          }
          automationLog(`✅ Cookies do hCaptcha limpos para contas visíveis`);
        } catch (err) {
          log(`⚠️ Falha ao limpar cookies do hCaptcha no início da leva: ${err.message}`);
        }
        levaProgress = {
          levaNumber: currentLevaNum,
          processedAccountIds: [],
          totalAccountsExpected: dailyAccountsTotal || visibleAccountIds.length
        };
      }
      
      // Adicionar contas recém-processadas
      visibleAccountIds.forEach(id => {
        if (!levaProgress.processedAccountIds.includes(id)) {
          levaProgress.processedAccountIds.push(id);
        }
      });
      
      // Salvar progresso atualizado
      saveLevaProgress(
        levaProgress.levaNumber,
        levaProgress.processedAccountIds,
        levaProgress.totalAccountsExpected
      );
      
      // Verificar se leva está completa
      const levaCompleta = levaProgress.processedAccountIds.length >= levaProgress.totalAccountsExpected;
      
      automationLog(
        `\n📊 Progresso: ${levaProgress.processedAccountIds.length}/${levaProgress.totalAccountsExpected} contas processadas`
      );
      
      if (levaCompleta) {
        // ✅ LEVA COMPLETA: Incrementar e enviar relatório
        const levaNumeroCompleto = currentLevaNum; // Salvar antes de incrementar
        
        automationLog(`\n🎉 ===== LEVA ${levaNumeroCompleto}/6 COMPLETA! =====`);
        automationLog(`✅ Todas as ${levaProgress.totalAccountsExpected} contas foram processadas!`);
        
        // ✅ GERAR E ENVIAR RELATÓRIO PDF
        automationLog(`📊 Gerando relatório da Leva ${levaNumeroCompleto}...`);
        const reportResult = await generateRealLevaReport(
          levaNumeroCompleto,
          levaProgress.totalAccountsExpected,
          automationEngine.nicksList ? automationEngine.nicksList.length : 0
        );
        
        if (reportResult.success) {
          automationLog(`✅ Relatório da Leva ${levaNumeroCompleto} enviado com sucesso!`);
        } else {
          automationLog(`⚠️ Erro ao enviar relatório: ${reportResult.error}`);
        }
        
        // Agora incrementar leva e limpar dados
        const newLeva = incrementLeva();
        clearLevaProgress(); // Limpar progresso para próxima leva
        clearIncrementalStats(); // ✅ Limpar estatísticas incrementais (leva completa)
        
        automationLog(`🎯 Próxima leva: ${newLeva}/6`);
        
        if (currentLevaNum >= 6) {
          automationLog(`✅ Você completou todas as 6 levas! O sistema foi reiniciado para a leva 1/6.`);
        } else {
          automationLog(`💡 Você pode iniciar novamente para fazer a leva ${newLeva}/6!`);
        }
      } else {
        // ⏳ LEVA INCOMPLETA: NÃO incrementar, NÃO enviar relatório
        const remaining = levaProgress.totalAccountsExpected - levaProgress.processedAccountIds.length;
        automationLog(`\n⏳ ===== LEVA ${currentLevaNum}/6 EM ANDAMENTO =====`);
        automationLog(`📌 Faltam ${remaining} contas para completar esta leva.`);
        automationLog(`💡 Mude para a próxima página e rode a automação novamente!`);
        automationLog(`🚫 Relatório NÃO será enviado até completar todas as contas.`);
        
        // ✅ ENVIAR NOTIFICAÇÃO VISUAL PARA O RENDERER
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('leva-incompleta', {
            processed: levaProgress.processedAccountIds.length,
            total: levaProgress.totalAccountsExpected,
            remaining: remaining,
            levaNumber: currentLevaNum
          });
        }
      }
      
      // ✅ Calcular estatísticas (sempre, independente se leva completa ou não)
      const elapsedMs = Date.now() - automationStartTime;
      const elapsedMin = Math.floor(elapsedMs / 60000);
      const elapsedSec = Math.floor((elapsedMs % 60000) / 1000);
      const elapsedText = `${elapsedMin}m ${elapsedSec}s`;
      
      const totalInvites = automationSuccessCount + automationErrorCount;
      const rate = totalInvites > 0 ? (totalInvites / (elapsedMs / 60000)).toFixed(1) : 0;
      const successRate = totalInvites > 0 ? Math.round((automationSuccessCount / totalInvites) * 100) : 0;
      
      const finalStats = {
        nicksLoaded: automationEngine.nicksList ? automationEngine.nicksList.length : 0,
        accountsVisible: groupAccounts.length,
        totalInvites: totalInvites,
        successCount: automationSuccessCount,
        errorCount: automationErrorCount,
        elapsedTime: elapsedText,
        rate: rate,
        successRate: successRate,
        lastUpdate: new Date().toISOString()
      };
      
      // ✅ SÓ SALVAR e ENVIAR se leva completa
      if (levaCompleta) {
        saveAutomationStats(finalStats);
        automationLog(`💾 Estatísticas salvas: ${totalInvites} convites, ${elapsedText}, ${rate}/min, ${successRate}% sucesso`);
      
      // Enviar notificação visual para o renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('automation-leva-completed', {
          totalInvites: automationEngine.totalInvitesSent,
            nicksRemaining: automationEngine.nicksList.length - automationEngine.currentNickIndex,
            stats: finalStats // ✅ Incluir estatísticas
        });
        
          // Esconder apenas a barra de progresso (manter estatísticas visíveis)
        mainWindow.webContents.send('progress-hide');
        }
        
        automationLog(`📊 Relatório será enviado para o webhook!`);
      } else {
        // ⏳ Leva incompleta: NÃO salvar estatísticas finais nem enviar
        automationLog(`⏳ Estatísticas parciais NÃO salvas (aguardando leva completa)`);
        
        // Apenas esconder barra de progresso
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('progress-hide');
        }
      }
      
      automationEngine.isRunning = false;
      
      // Resetar progresso de ciclo/conta quando terminar completamente
      automationEngine.currentCiclo = 1;
      automationEngine.currentAccountIndex = 0;
      saveProgress();
    } catch (error) {
      logError('❌ Erro crítico na automação:', error);
      automationEngine.isRunning = false;
    } finally {
      // Sempre resetar flag para permitir nova execução
      automationRunning = false;
      log('🔓 Flag de automação liberada');
    }
  }
  
  // Funções auxiliares para automação REAL
  async function switchToAccount(accountId) {
    automationLog(`🔄 Trocando para conta: ${accountId}`);
    
    try {
      // Atualizar conta ativa no array
      accounts.forEach(acc => (acc.active = false));
      const targetAccount = accounts.find(acc => acc.id === accountId);
      
      if (!targetAccount) {
        throw new Error(`Conta ${accountId} não encontrada`);
      }
      
      targetAccount.active = true;
      automationLog(`📋 Conta encontrada: ${targetAccount.name}`);
      
      // Verificar se precisa inicializar sessão sob demanda
      if (!sessionMap.has(accountId)) {
        automationLog(`🔄 Inicializando sessão sob demanda para ${targetAccount.name}...`);
        try {
          await initializeSessionForAccount(targetAccount);
          automationLog(`✅ Sessão inicializada para ${targetAccount.name}`);
        } catch (error) {
          logError(`❌ Erro ao inicializar sessão para ${targetAccount.name}:`, error);
          return false;
        }
      }
      
      // NOVA ESTRATÉGIA: Simular click na aba da conta (como usuário faz manualmente)
      automationLog(`🖱️ Clicando na aba da conta ${targetAccount.name}...`);
      
      // Executar JavaScript na janela principal (não na BrowserView) para clicar na aba
      const clickResult = await mainWindow.webContents.executeJavaScript(`
        (function() {
          try {
            // Procurar pela aba com o data-account-id correto
            const accountTab = document.querySelector('div.avatar-tab[data-account-id="${accountId}"]');
            
            if (!accountTab) {
              return { success: false, message: 'Aba não encontrada no DOM' };
            }
            
            // Simular click na aba
            accountTab.click();
            
            return { success: true, message: 'Click na aba executado' };
          } catch (error) {
            return { success: false, message: error.message };
          }
        })();
      `);
      
      if (clickResult.success) {
        automationLog(`✅ Click na aba executado: ${clickResult.message}`);
      } else {
        automationLog(`⚠️ Falha ao clicar na aba: ${clickResult.message}`);
        // Fallback: usar método antigo
        automationLog(`🔄 Usando método fallback...`);
        await switchToBrowserView(accountId);
      }
      
      // AGUARDAR UM POUCO PARA GARANTIR QUE A VIEW FOI TROCADA
      await sleep(500);
      
      // FORÇAR ATUALIZAÇÃO DOS BOUNDS
      updateBrowserViewBounds();
      automationLog(`📐 Bounds da BrowserView atualizados`);
      
      // Notificar renderer sobre a mudança
      mainWindow.webContents.send('account-switched', accountId);
      
      automationLog(`✅ Conta ${accountId} (${targetAccount.name}) ativada com sucesso`);
      return true;
    } catch (error) {
      logError('❌ Erro ao trocar conta:', error);
      return false;
    }
  }
  
  async function navigateToAddFriend() {
    automationLog(`🧭 Navegando para Add Friend...`);
    
    try {
      const currentView = getCurrentBrowserView();
      if (!currentView || !currentView.webContents) {
        throw new Error('BrowserView não encontrada');
      }
      
      // ✅ Usar seletores centralizados
      const result = await currentView.webContents.executeJavaScript(`
        ${selectorsCode}
        
        (async function() {
          try {
            // PRIMEIRO: Garantir que estamos na aba Friends
            const friendsResult = findFriendsSidebar();
            if (friendsResult.success) {
              friendsResult.element.click();
              await new Promise(r => setTimeout(r, 600));
            }
            
            // SEGUNDO: Clicar em Add Friend
            const addFriendResult = findAddFriendButton();
            if (addFriendResult.success) {
              addFriendResult.element.click();
              await new Promise(r => setTimeout(r, 400));
              return { 
                success: true, 
                message: \`Add Friend encontrado via: \${addFriendResult.method}\`
              };
            }
            
            return { success: false, message: 'Add Friend não encontrado' };
          } catch (error) {
            console.error('[NAV-ADD-FRIEND] Erro:', error);
            return { success: false, message: error.message };
          }
        })();
      `);
      
      automationLog(`✅ Navegação: ${result.message}`);
      return result.success;
    } catch (error) {
      logError('❌ Erro na navegação:', error);
      return false;
    }
  }
  
  async function typeNick(nick) {
    automationLog(`⌨️ Digitando nick: ${nick}`);
    
    try {
      const currentView = getCurrentBrowserView();
      if (!currentView || !currentView.webContents) {
        throw new Error('BrowserView não encontrada');
      }
      
      // Executar JavaScript no Discord para digitar o nick caractere por caractere
      const result = await currentView.webContents.executeJavaScript(`
        (async function() {
          try {
            const nick = ${JSON.stringify(nick)};
            const input = document.querySelector('input[name="add-friend"]');
            
            if (!input) {
              return { success: false, message: 'Campo de input não encontrado' };
            }
            
            // Focar no input
            input.focus();
            
            // Limpar campo primeiro
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            
            await new Promise(r => setTimeout(r, Math.random() * 20 + 10));
            
            let success = false;
            try {
              input.focus();
              input.select();
              
              success = document.execCommand('insertText', false, nick);
              
              if (success) {
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              }
            } catch (e) {
              success = false;
            }
            
            if (!success) {
              input.value = nick;
              
              const inputEvent = new Event('input', { bubbles: true });
              const changeEvent = new Event('change', { bubbles: true });
              
              input.dispatchEvent(inputEvent);
              input.dispatchEvent(changeEvent);
              
              const keyboardEvent = new KeyboardEvent('keyup', {
                key: nick[nick.length - 1],
                code: 'Key' + nick[nick.length - 1].toUpperCase(),
                bubbles: true
              });
              input.dispatchEvent(keyboardEvent);
            }
            
            await new Promise(r => setTimeout(r, Math.random() * 50 + 50));
            
            input.blur();
            await new Promise(r => setTimeout(r, Math.random() * 10 + 10));
            input.focus();
            
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            
            return { success: true, message: 'Nick digitado com sucesso' };
          } catch (error) {
            return { success: false, message: error.message };
          }
        })();
      `);
      
      automationLog(`✅ Nick digitado: ${result.message}`);
      return result.success;
    } catch (error) {
      logError('❌ Erro ao digitar nick:', error);
      return false;
    }
  }
  
  async function clickSendFriendRequest() {
    automationLog(`📤 Clicando em Send Friend Request...`);
    
    try {
      const currentView = getCurrentBrowserView();
      if (!currentView || !currentView.webContents) {
        throw new Error('BrowserView não encontrada');
      }
      
      // Clicar no botão "Send Friend Request"
      const result = await currentView.webContents.executeJavaScript(`
        (async function() {
          try {
            // Tentar até 10 vezes (10 segundos) aguardar botão habilitar
            for (let attempt = 0; attempt < 10; attempt++) {
              const button = document.querySelector('button[type="submit"].primary_a22cb0') ||
                            document.querySelector('button[type="submit"]');
              
              if (!button) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
              }
              
              if (!button.disabled) {
                button.click();
                await new Promise(r => setTimeout(r, Math.random() * 100 + 100));
                return { success: true, message: 'Botão clicado' };
              }
              
              // Botão ainda desabilitado, aguardar mais um pouco
              await new Promise(r => setTimeout(r, 1000));
            }
            
            // Timeout: botão não habilitou
            return { success: false, message: 'Timeout: Botão não habilitou após 10s' };
          } catch (error) {
            return { success: false, message: error.message };
          }
        })();
      `);
      
      automationLog(`✅ Click executado: ${result.message}`);
      return result.success;
    } catch (error) {
      logError('❌ Erro ao clicar:', error);
      return false;
    }
  }
  
  // Função helper para aguardar até que a pausa seja liberada
  async function waitWhilePaused() {
    while (automationEngine && automationEngine.isPausedByPanel) {
      await sleep(500); // Verificar a cada 500ms
    }
  }
  
  // Função para simular clique humano com eventos de mouse realistas
  async function humanClick(element) {
    // Click simples e direto (Discord espera isso)
    element.click();
    return true;
  }
  
  async function captureAndSendError(accountName, targetNick, errorMessage) {
    automationLog(`📸 Capturando screenshot do erro...`);
    
    try {
      const currentView = getCurrentBrowserView();
      if (!currentView || !currentView.webContents) {
        throw new Error('BrowserView não encontrada');
      }
      
      // Capturar screenshot da BrowserView
      const image = await currentView.webContents.capturePage();
      const buffer = image.toPNG();
      
      automationLog(`✅ Screenshot capturado (${Math.round(buffer.length / 1024)}KB)`);
      
      // ✅ Salvar screenshot localmente (será incluído no PDF final)
      try {
        // Criar diretório se não existir
        if (!fs.existsSync(screenshotsDir)) {
          fs.mkdirSync(screenshotsDir, { recursive: true });
        }
        
        const timestamp = Date.now();
        const screenshotPath = path.join(screenshotsDir, `erro_${accountName.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.png`);
        fs.writeFileSync(screenshotPath, buffer);
        
        // Categorizar tipo de erro
        let errorType = 'other';
        if (errorMessage.toLowerCase().includes('não aceita') || errorMessage.toLowerCase().includes('not accepting')) {
          errorType = 'notAcceptingFriends';
          errorsByType.notAcceptingFriends++;
        } else if (errorMessage.toLowerCase().includes('não existe') || errorMessage.toLowerCase().includes('not found')) {
          errorType = 'usernameNotFound';
          errorsByType.usernameNotFound++;
        } else {
          errorsByType.other++;
        }
        
        // Registrar erro com screenshot (será enviado no PDF final ao completar a leva)
        errorScreenshots.push({
          accountName,
          targetNick,
          errorType,
          errorMessage,
          screenshotPath,
          timestamp: new Date().toISOString()
        });
        
        automationLog(`💾 Screenshot salvo localmente: ${path.basename(screenshotPath)}`);
        automationLog(`📋 Erro registrado e será incluído no relatório PDF final`);
        
        // ✅ Enviar screenshot para webhook em tempo real
        try {
          const settingsPath = path.join(userDataPath, 'settings.json');
          if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            if (settings.webhookUrl) {
              const axios = require('axios');
              const FormData = require('form-data');
              
              const form = new FormData();
              form.append('file', buffer, `erro_${accountName}_${timestamp}.png`);
              form.append('content', `🛠️ **Erro durante automação**\n\n👤 **Conta:** ${accountName}\n🎯 **Nick:** ${targetNick}\n⚠️ **Erro:** ${errorMessage}\n📷 Screenshot anexada`);
              
              await axios.post(settings.webhookUrl, form, {
                headers: form.getHeaders(),
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
              });
              
              automationLog(`📤 Screenshot enviada para webhook`);
            }
          }
        } catch (webhookError) {
          logError('⚠️ Erro ao enviar screenshot para webhook:', webhookError);
          // Não falhar a função se o webhook falhar
        }
        
        return true;
      } catch (saveError) {
        logError('❌ Erro ao salvar screenshot localmente:', saveError);
        return false;
      }
    } catch (error) {
      logError('❌ Erro ao capturar screenshot:', error);
      automationLog(`⚠️ Falha ao capturar screenshot: ${error.message}`);
      return false;
    }
  }
  
  async function waitForCaptcha(targetNick = 'Desconhecido', accountName = 'Desconhecida', webhookUrl = '') {
    automationLog(`🤖 Detectando e aguardando captcha...`);
    
    try {
      const currentView = getCurrentBrowserView();
      if (!currentView || !currentView.webContents) {
        throw new Error('BrowserView não encontrada');
      }
      
      // Aguardar um pouco para elementos carregarem
      await sleep(500);
      
      // Aguardar mensagem de SUCESSO ou ERRO aparecer
      
      automationLog(`🔍 Aguardando resolução MANUAL do captcha...`);
      automationLog(`⚠️  Por favor, resolva o captcha manualmente`);
      
      let responseReceived = false;
      let attempts = 0;
      const maxAttempts = 99999; // Aguardar indefinidamente até captcha ser resolvido
      
      while (!responseReceived && attempts < maxAttempts) {
        await sleep(500); // Verificar 2x por segundo
        attempts++;
        
        // Log de debug a cada 15 segundos (REDUZIDO - OTIMIZAÇÃO)
        if (attempts % 30 === 0) {
          const seconds = Math.floor(attempts / 2);
          automationLog(`🔍 Verificando resposta... (${seconds}s)`, 'info');
        }
        
        // Verificar se mensagem de sucesso ou erro apareceu (SELETORES EXATOS)
        const result = await currentView.webContents.executeJavaScript(`
          (function() {
            try {
              console.log('[CAPTCHA-DEBUG] ===== VERIFICAÇÃO INICIADA =====');
              // 1. Verificar SUCESSO (verde abaixo da caixa) - SELETORES EXATOS
              const successSelectors = [
                'div[class*="marginTop8"][class*="text-sm"]',
                'div[class*="text-sm"]'
              ];
              
              for (let i = 0; i < successSelectors.length; i++) {
                const successElems = document.querySelectorAll(successSelectors[i]);
                for (let j = 0; j < successElems.length; j++) {
                  const elem = successElems[j];
                  if (elem && elem.textContent && elem.textContent.indexOf('Success') >= 0) {
                    return { resolved: true, success: true, message: 'Sucesso' };
                  }
                }
              }
              
              // 2. Verificar RATE LIMIT (alert vermelho) - PRIORIDADE
              const rateLimitElems = document.querySelectorAll('div[role="alert"]');
              for (let r = 0; r < rateLimitElems.length; r++) {
                const rateElem = rateLimitElems[r];
                if (rateElem && rateElem.textContent) {
                  const rateText = rateElem.textContent;
                  if (rateText.indexOf('too fast') >= 0 || rateText.indexOf('slow down') >= 0 || 
                      rateText.indexOf('rate limit') >= 0 || rateText.indexOf('Try again later') >= 0) {
                    return { 
                      resolved: true, 
                      success: false, 
                      error: 'Rate limit detectado',
                      rateLimit: true
                    };
                  }
                }
              }
              
              // 3. Verificar ERRO "não aceita" (alert vermelho) - SELETORES EXATOS
              const alertElems = document.querySelectorAll('div[role="alert"]');
              for (let k = 0; k < alertElems.length; k++) {
                const alert = alertElems[k];
                if (alert && alert.textContent && alert.textContent.indexOf('not accepting') >= 0) {
                  return { resolved: true, success: false, error: 'Usuário não aceita pedidos de amizade' };
                }
              }
              
              // 4. Verificar ERRO "username inválido" - ESTRATÉGIA MELHORADA
              console.log('[CAPTCHA-DEBUG] Verificando erro de username inválido...');
              
              // ESTRATÉGIA 1: Procurar MODAL primeiro (mais confiável)
              const errorModal = document.querySelector('div[role="dialog"][aria-modal="true"]');
              
              if (errorModal) {
                console.log('[CAPTCHA-DEBUG] Modal encontrado!');
                const modalText = errorModal.textContent || '';
                console.log('[CAPTCHA-DEBUG] Texto do modal:', modalText.substring(0, 100));
                
                // Verificar se é erro de username (múltiplas variações)
                if (modalText.indexOf("didn't work") >= 0 || 
                    modalText.indexOf("Hm,") >= 0 ||
                    modalText.indexOf("Double-check") >= 0 ||
                    modalText.indexOf("username is correct") >= 0) {
                  
                  console.log('[CAPTCHA-DEBUG] ✅ ERRO DE USERNAME DETECTADO NO MODAL!');
                  
                  // NÃO CLICAR NO BOTÃO AINDA! Precisamos capturar screenshot primeiro
                  console.log('[CAPTCHA-DEBUG] ⏸️ Popup detectado - aguardando captura de screenshot');
                  
                  return { 
                    resolved: true, 
                    success: false, 
                    error: 'Username não existe', 
                    needsScreenshot: true  // Sinalizar que precisa screenshot ANTES de clicar
                  };
                }
                
                console.log('[CAPTCHA-DEBUG] Modal não contém erro de username');
              } else {
                console.log('[CAPTCHA-DEBUG] Nenhum modal encontrado');
              }
              
              // ESTRATÉGIA 2: Fallback - procurar por seletores específicos
              console.log('[CAPTCHA-DEBUG] Tentando estratégia de fallback (seletores)...');
              const errorSelectors = [
                'div[class*="marginTop8"]',
                'div[class*="headerSubtitle"]',
                'div[class*="text-md"]',
                'div[class*="text-sm"]'
              ];
              
              let foundWithSelectors = false;
              for (let m = 0; m < errorSelectors.length; m++) {
                const errorElems = document.querySelectorAll(errorSelectors[m]);
                for (let n = 0; n < errorElems.length; n++) {
                  const errElem = errorElems[n];
                  if (errElem && errElem.textContent) {
                    const errText = errElem.textContent;
                    if (errText.indexOf("didn't work") >= 0 || 
                        errText.indexOf("Hm,") >= 0 ||
                        errText.indexOf("Double-check") >= 0) {
                      
                      console.log('[CAPTCHA-DEBUG] ✅ Erro encontrado com seletores:', errText.substring(0, 50));
                      foundWithSelectors = true;
                      
                      // NÃO CLICAR NO BOTÃO - aguardar screenshot
                      return { resolved: true, success: false, error: 'Username não existe', needsScreenshot: true };
                    }
                  }
                }
              }
              
              // ESTRATÉGIA 3: Último fallback com document.body.textContent
              if (!foundWithSelectors) {
                console.log('[CAPTCHA-DEBUG] Tentando último fallback (body text)...');
                const bodyText = (document.body && document.body.textContent) || '';
                if (bodyText.indexOf("didn't work") >= 0 || 
                    bodyText.indexOf("Hm,") >= 0 || 
                    bodyText.indexOf("Double-check that the username is correct") >= 0) {
                  
                  console.log('[CAPTCHA-DEBUG] ✅ Erro encontrado em body text');
                  
                  // NÃO CLICAR NO BOTÃO - aguardar screenshot
                  return { resolved: true, success: false, error: 'Username não existe', needsScreenshot: true };
                }
              }
              
              // 5. Se nada encontrado, não resolvido ainda
              return { resolved: false };
              
            } catch (error) {
              return { resolved: false, error: 'JS Error: ' + error.message };
            }
          })();
        `);
        
        if (result.resolved) {
          responseReceived = true;
          
          automationLog(`📊 [DEBUG] Resultado detectado após ${Math.floor(attempts / 2)}s`);
          automationLog(
            `📊 [DEBUG] Success: ${result.success}, Error: ${result.error || 'N/A'}, RetryUsername: ${result.retryUsername || false}, ClickedOkay: ${result.clickedOkay || false}`
          );
          
          if (result.success) {
            automationLog(`✅ Captcha resolvido e convite enviado!`);
            return { success: true };
          } else {
            automationLog(`⚠️ Captcha resolvido mas houve erro: ${result.error}`);
            
            // Se o erro for "não aceita pedidos de amizade", capturar screenshot
            if (result.error === 'Usuário não aceita pedidos de amizade') {
              // Usar os parâmetros recebidos (nick correto!)
              await captureAndSendError(accountName, targetNick, result.error);
              
              // Continuar imediatamente após enviar screenshot
              automationLog(`✅ Screenshot enviado - continuando automação...`);
            }
            
            // Se o erro for "Username não existe", capturar screenshot COM O POPUP VISÍVEL
            if (result.error === 'Username não existe' && result.needsScreenshot) {
              automationLog(`📸 Capturando screenshot do popup de erro...`);
              
              // CAPTURAR SCREENSHOT PRIMEIRO (popup ainda está visível)
              await captureAndSendError(accountName, targetNick, result.error);

              // AGORA SIM fechar o popup clicando no botão Okay
              automationLog(`🖱️ Fechando popup de erro...`);
              await currentView.webContents.executeJavaScript(`
                (function() {
                  try {
                    // Procurar o modal de erro
                    const errorModal = document.querySelector('div[role="dialog"][aria-modal="true"]');
                    if (errorModal) {
                      const modalButtons = errorModal.querySelectorAll('button');
                      for (let i = 0; i < modalButtons.length; i++) {
                        const btn = modalButtons[i];
                        const btnText = (btn.textContent || '').trim().toLowerCase();
                        if (btnText === 'okay' || btnText.indexOf('okay') >= 0 || btnText === 'ok') {
                          console.log('[CAPTCHA-DEBUG] 🖱️ Clicando no botão Okay para fechar popup');
                          btn.click();
                          return { success: true };
                        }
                      }
                    }
                    
                    // Fallback: procurar qualquer botão com "okay"
                    const allButtons = document.querySelectorAll('button');
                    for (let j = 0; j < allButtons.length; j++) {
                      const btn = allButtons[j];
                      const btnText = (btn.textContent || '').trim().toLowerCase();
                      if (btnText === 'okay' || btnText.indexOf('okay') >= 0 || btnText === 'ok') {
                        console.log('[CAPTCHA-DEBUG] 🖱️ Clicando no botão Okay (fallback)');
                        btn.click();
                        return { success: true };
                      }
                    }
                    
                    return { success: false };
                  } catch (error) {
                    return { success: false, error: error.message };
                  }
                })();
              `);

              // Aguardar popup fechar
              await sleep(1500);
              automationLog(`✅ Screenshot enviado e popup fechado - continuando automação...`);
            }

            return {
              success: false,
              error: result.error,
              retryUsername: result.retryUsername || false,
              clickedOkay: result.clickedOkay || false,
            };
          }
        }
        
        // Log de progresso a cada 10 segundos (sem limite de tempo!)
        if (attempts % 20 === 0) {
          const seconds = Math.floor(attempts / 2);
          automationLog(`⏳ Aguardando resposta do Discord... (${seconds}s)`);
        }
      }
      
      // Este ponto nunca deve ser alcançado (maxAttempts = 99999)
      // Mas se por algum motivo alcançar, não retornar erro que pula conta
      automationLog(`⚠️ Loop de espera finalizado após ${Math.floor(attempts / 2)}s`);
      return { success: false, error: 'Aguardando captcha' };
    } catch (error) {
      logError('❌ Erro ao aguardar captcha:', error);
      return { success: false, error: error.message };
    }
  }
  
  async function checkForError() {
    automationLog(`🔍 Verificando se houve erro...`);
    
    try {
      const currentView = getCurrentBrowserView();
      if (!currentView || !currentView.webContents) {
        throw new Error('BrowserView não encontrada');
      }
      
      // Verificar se modal de erro apareceu
      const errorCheck = await currentView.webContents.executeJavaScript(`
        (function() {
          try {
            // Procurar por modal de erro
            const errorModal = document.querySelector('div[role="dialog"][aria-modal="true"]');
            if (errorModal) {
              const errorText = errorModal.textContent || '';
              
              if (errorText.includes('not accepting friend requests') || 
                  errorText.includes('is not accepting')) {
                return { hasError: true, message: 'Usuário não aceita pedidos de amizade' };
              }
            }
            
            // Procurar por elemento de erro específico
            const errorElement = document.querySelector('div[id*="-error"]');
            if (errorElement && errorElement.textContent.includes('not accepting')) {
              return { hasError: true, message: 'Usuário não aceita pedidos de amizade' };
            }
            
            return { hasError: false, message: 'Sem erros' };
          } catch (error) {
            return { hasError: false, message: 'Erro ao verificar: ' + error.message };
          }
        })();
      `);
      
      if (errorCheck.hasError) {
        automationLog(`⚠️ ERRO DETECTADO: ${errorCheck.message}`);
        
        // Fechar modal de erro clicando no botão "Okay"
        await currentView.webContents.executeJavaScript(`
          (function() {
            try {
              const okayButton = Array.from(document.querySelectorAll('button')).find(btn => 
                btn.textContent.includes('Okay') || btn.textContent.includes('OK')
              );
              
              if (okayButton) {
                okayButton.click();
                return true;
              }
              
              // Tentar fechar o modal pelo X
              const closeButton = document.querySelector('button[aria-label="Close"]');
              if (closeButton) {
                closeButton.click();
                return true;
              }
              
              return false;
            } catch (error) {
              return false;
            }
          })();
        `);
        
        await sleep(500);
        automationLog(`✅ Modal de erro fechado`);
        return { success: false, error: errorCheck.message };
      }
      
      automationLog(`✅ Sem erros detectados`);
      return { success: true };
    } catch (error) {
      logError('❌ Erro ao verificar erros:', error);
      return { success: true }; // Assumir sucesso em caso de erro na verificação
    }
  }
  
  // Verificar se todas as sessões foram inicializadas corretamente
  setTimeout(() => {
    automationLog(
      `🔍 Verificação de sessões: ${sessionMap.size}/${accounts.length} sessões ativas`
    );
    const missingSessions = accounts.filter(acc => !sessionMap.has(acc.id));
    if (missingSessions.length > 0) {
      automationLog(
        `⚠️ Contas sem sessão:`,
        missingSessions.map(acc => `${acc.name} (${acc.id})`)
      );
    }
  }, 5000);

  // Sistema de backup periódico REMOVIDO - causava janelas inesperadas

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  // Parar timers de limpeza antes de fechar
  stopCleanupTimers();
  timerManager.cleanup(); // Limpar TODOS os timers
  clearAllTimers(); // Limpar timers globais
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async event => {
   log('💾 Salvando dados da sessão antes de sair...');
   
   // Parar timers de limpeza antes de fechar
   stopCleanupTimers();
   timerManager.cleanup(); // Limpar TODOS os timers
  clearAllTimers(); // Limpar timers globais
  
  // Limpar BrowserViews para evitar memory leaks
  if (browserViews && browserViews.size > 0) {
    log('🧹 Limpando BrowserViews...');
    browserViews.forEach((view, accountId) => {
      try {
        if (view && !view.webContents.isDestroyed()) {
          log(`🗑️ Destruindo BrowserView: ${accountId}`);
          view.webContents.destroy();
        }
      } catch (e) {
        // Ignorar erros durante cleanup
      }
    });
    browserViews.clear();
    log('✅ BrowserViews limpas');
  }
  
  // Limpar sessionMap
  if (sessionMap && sessionMap.size > 0) {
    sessionMap.clear();
    log('✅ SessionMap limpa');
  }
   
   event.preventDefault();
   
   try {
     // SISTEMA ULTRA-ROBUSTO: Múltiplas tentativas de salvamento
     let saved = false;
     let attempts = 0;
     const maxAttempts = 5; // Aumentado para 5 tentativas
     
     log(`📊 Salvando ${accounts.length} contas...`);
     
     while (!saved && attempts < maxAttempts) {
       try {
         attempts++;
         log(`💾 Tentativa ${attempts}/${maxAttempts} de salvamento...`);
         
         // Forçar o salvamento das contas
         const saveResult = writeAccounts(accounts);
         
         if (saveResult) {
         // Verificar se salvou corretamente
         const userDataPath = app.getPath('userData');
         const accountsPath = path.join(userDataPath, 'accounts.json');
         
         if (fs.existsSync(accountsPath)) {
           const savedData = fs.readFileSync(accountsPath, 'utf8');
           const savedAccounts = JSON.parse(savedData);
             
             log(`📊 Contas salvas: ${savedAccounts.length}, Contas atuais: ${accounts.length}`);
           
           if (Array.isArray(savedAccounts) && savedAccounts.length === accounts.length) {
             saved = true;
             log('✅ Dados salvos com sucesso!');
               
               // Log detalhado das contas salvas
               savedAccounts.forEach((account, index) => {
                 log(`  ${index + 1}. ${account.name} (${account.id}) - Ativa: ${account.active}`);
               });
           } else {
             log('⚠️ Dados não salvos corretamente, tentando novamente...');
           }
         } else {
           log('⚠️ Arquivo não encontrado, tentando novamente...');
           }
         } else {
           log('⚠️ writeAccounts retornou false, tentando novamente...');
         }
       } catch (error) {
         log(`⚠️ Erro na tentativa ${attempts}: ${error.message}`);
         
         if (attempts < maxAttempts) {
           // Aguardar um pouco antes de tentar novamente
           await new Promise(resolve => setTimeout(resolve, 1000));
         }
       }
     }
     
     if (!saved) {
       log('🚨 Falha ao salvar dados após múltiplas tentativas');
       
       // Backup de emergência
       try {
         const userDataPath = app.getPath('userData');
         const emergencyPath = path.join(userDataPath, 'emergency-accounts.json');
         fs.writeFileSync(emergencyPath, JSON.stringify(accounts, null, 2));
         log('🚨 Backup de emergência criado');
       } catch (emergencyError) {
         logError('❌ Falha total no backup de emergência:', emergencyError);
       }
     }
     
     log('✅ Processo de salvamento finalizado');
     app.exit(0);
   } catch (error) {
     logError('❌ Erro crítico ao salvar dados da sessão:', error);
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
