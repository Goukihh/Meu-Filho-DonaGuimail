const { app, BrowserWindow, BrowserView, ipcMain, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
// Auto-updater removido para evitar falsos alarmes do Windows Defender

// Usar pasta de dados do usuário para persistência permanente
const userDataPath = app.getPath('userData');
const accountsFilePath = path.join(userDataPath, 'accounts.json');

// Função para copiar diretório recursivamente (otimizada)
async function copyDirectory(src, dest) {
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
        // Pular pastas de cache desnecessárias
        if (entry.name.includes('Cache') || entry.name.includes('Code Cache') || 
            entry.name.includes('GPUCache') || entry.name.includes('DawnCache') ||
            entry.name.includes('blob_storage') || entry.name.includes('databases') ||
            entry.name.includes('Service Worker') || entry.name.includes('Network')) {
          continue;
        }
        
        // Recursivamente copiar subdiretórios
        await copyDirectory(srcPath, destPath);
      } else {
        // Copiar arquivo
        fs.copyFileSync(srcPath, destPath);
      }
    }
  } catch (error) {
    console.error('Erro ao copiar diretorio:', error);
    throw error;
  }
}

// Função para copiar diretório recursivamente (versão original que funcionava)
async function copyDirectoryUltraOptimized(src, dest) {
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
        // Pular apenas pastas de cache desnecessárias
        if (entry.name.includes('Cache') || entry.name.includes('Code Cache') || 
            entry.name.includes('GPUCache') || entry.name.includes('DawnCache') ||
            entry.name.includes('blob_storage') || entry.name.includes('databases') ||
            entry.name.includes('Service Worker') || entry.name.includes('Network')) {
          continue;
        }
        
        // Recursivamente copiar subdiretórios
        await copyDirectoryUltraOptimized(srcPath, destPath);
      } else {
        // Copiar arquivo
        fs.copyFileSync(srcPath, destPath);
      }
    }
  } catch (error) {
    console.error('Erro ao copiar diretorio:', error);
    throw error;
  }
}

// Função para copiar apenas Partitions essenciais (versão original que funcionava)
async function copyEssentialPartitions(src, dest) {
  try {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    let sessionCount = 0;
    
    // Filtrar apenas sessões discord-* (SEM LIMITE)
    const discordSessions = entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith('discord-'))
      .map(entry => ({
        name: entry.name,
        path: path.join(src, entry.name)
      }));
    
    for (const session of discordSessions) {
      const srcPath = session.path;
      const destPath = path.join(dest, session.name);
      
      // Usar a função de cópia original que funcionava
      await copyDirectory(srcPath, destPath);
      sessionCount++;
    }
    
    console.log(`Sessoes copiadas: ${sessionCount} (TODAS as contas salvas)`);
  } catch (error) {
    console.error('Erro ao copiar Partitions essenciais:', error);
    throw error;
  }
}

// Função para criar arquivo ZIP (versão original que funcionava)
async function createZipFile(sourceDir, zipPath) {
  const archiver = require('archiver');
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { 
    zlib: { level: 1 }, // Compressão leve para velocidade
    forceLocalTime: true,
    forceZip64: false
  });
  
  return new Promise((resolve, reject) => {
    output.on('close', () => {
      console.log(`ZIP criado: ${archive.pointer()} bytes`);
      resolve();
    });
    
    archive.on('error', (err) => {
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

console.log(`📁 Dados salvos em: ${userDataPath}`);

let mainWindow;
let accounts = [];
let browserViews = new Map();
let sessionMap = new Map();
// Cache de avatares movido para renderer.js para evitar duplicação
let isModalOpen = false; // Sinal de trânsito para controlar visibilidade da BrowserView
let isRenaming = false; // Controle para evitar recriação durante renomeação
let isClearing = false; // Controle para evitar recriação durante limpeza de sessão
let isRemoving = false; // Controle para evitar recriação durante remoção
let isAddingAccount = false; // Controle para evitar recriação durante adição de conta
let cleanupInterval; // Variável para controle de limpeza de memória
let killSwitchInterval; // Variável para controle do kill switch

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

// Função para obter User-Agent aleatório
function getRandomUserAgent() {
  try {
    if (!REALISTIC_USER_AGENTS || REALISTIC_USER_AGENTS.length === 0) {
      console.warn('⚠️ Array de User-Agents vazio, usando padrão');
      return REALISTIC_USER_AGENT;
    }
    return REALISTIC_USER_AGENTS[Math.floor(Math.random() * REALISTIC_USER_AGENTS.length)];
  } catch (error) {
    console.warn('⚠️ Erro ao obter User-Agent aleatório, usando padrão:', error);
    return REALISTIC_USER_AGENT;
  }
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
    // Validar dados antes de salvar
    if (!Array.isArray(accountsToSave)) {
      console.error('❌ Dados inválidos para salvar - não é um array');
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
        ...account // Manter outras propriedades
      };
    });
    
    // Salvar com backup de segurança
    const backupPath = accountsFilePath + '.backup';
    if (fs.existsSync(accountsFilePath)) {
      fs.copyFileSync(accountsFilePath, backupPath);
    }
    
    // Salvar arquivo principal
    fs.writeFileSync(accountsFilePath, JSON.stringify(processedAccounts, null, 2));
    
    // Verificar se salvou corretamente
    const savedData = fs.readFileSync(accountsFilePath, 'utf8');
    const parsedData = JSON.parse(savedData);
    
    if (parsedData.length === processedAccounts.length) {
      console.log(`💾 ${processedAccounts.length} contas salvas com sucesso`);
      
      // Remover backup se salvou corretamente
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      
    return true;
    } else {
      console.error('❌ Verificação de salvamento falhou');
      return false;
    }
  } catch (error) {
    console.error('❌ Erro ao salvar contas:', error);
    
    // Tentar restaurar backup se existir
    const backupPath = accountsFilePath + '.backup';
    if (fs.existsSync(backupPath)) {
      try {
        fs.copyFileSync(backupPath, accountsFilePath);
        console.log('🔄 Backup restaurado após erro');
      } catch (restoreError) {
        console.error('❌ Erro ao restaurar backup:', restoreError);
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
  try {
    console.log(`🔐 Inicializando sessão para: ${account.name} (${account.id})`);
    
    // Verificar se a conta já tem uma sessão
    if (sessionMap.has(account.id)) {
      console.log(`⚠️ Sessão já existe para ${account.name}, reutilizando...`);
      return;
    }
    
  const partition = `persist:discord-${account.id}`;
  const ses = session.fromPartition(partition);
  
  // INJETAR SCRIPT DE EVASÃO STEALTH SEGURO
  const stealthSafeScriptPath = path.join(__dirname, 'stealth-safe.js');
  ses.setPreloads([stealthSafeScriptPath]);
  console.log(`🕵️ Script de evasão stealth seguro injetado para: ${account.name}`);
  
  sessionMap.set(account.id, ses);
  
    console.log(`🔐 Sessão criada para: ${account.name} (${partition})`);

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
    
    // MASCARAR TODAS AS REQUISIÇÕES PARA SER MAIS NATURAL (Discord-safe)
    // Adicionar headers realistas para TODAS as requisições, não apenas captcha
    details.requestHeaders['User-Agent'] = REALISTIC_USER_AGENT;
    details.requestHeaders['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8';
    details.requestHeaders['Accept-Language'] = 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7';
    details.requestHeaders['Sec-Fetch-Dest'] = 'document';
    details.requestHeaders['Sec-Fetch-Mode'] = 'navigate';
    details.requestHeaders['Sec-Fetch-Site'] = 'none';
    details.requestHeaders['Sec-Fetch-User'] = '?1';
    
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
  
  } catch (error) {
    console.error(`❌ Erro ao inicializar sessão para ${account.name}:`, error);
    throw error;
  }
}

// Inicializar todas as sessões
async function initializeSessions() {
  try {
    console.log(`🔄 Inicializando sessões para ${accounts.length} contas...`);
    
  for (const account of accounts) {
      try {
    await initializeSessionForAccount(account);
        console.log(`✅ Sessão inicializada para: ${account.name}`);
      } catch (error) {
        console.error(`❌ Erro ao inicializar sessão para ${account.name}:`, error);
        // Continuar com as outras contas mesmo se uma falhar
      }
    }
    
    console.log(`✅ Todas as sessões inicializadas: ${sessionMap.size} sessões ativas`);
  
  // Verificar se todas as contas têm sessões
  const missingSessions = accounts.filter(acc => !sessionMap.has(acc.id));
  if (missingSessions.length > 0) {
    console.log(`⚠️ ${missingSessions.length} contas sem sessão:`, missingSessions.map(acc => acc.name));
  }
  
  } catch (error) {
    console.error('❌ Erro crítico ao inicializar sessões:', error);
  }
}

// Cache inteligente: Pré-carregar sessões mais usadas
async function preloadFrequentSessions() {
  try {
    console.log('⚡ Iniciando pré-carregamento de sessões frequentes...');
    
    // Carregar apenas as primeiras 3 contas ativas para performance
    const activeAccounts = accounts.filter(acc => acc.active).slice(0, 3);
    console.log(`📊 ${activeAccounts.length} contas ativas encontradas`);
    
    for (const account of activeAccounts) {
      try {
      if (!sessionMap.has(account.id)) {
        console.log(`🚀 Pré-carregando sessão para: ${account.name}`);
        await initializeSessionForAccount(account);
        } else {
          console.log(`✅ Sessão já existe para: ${account.name}`);
        }
      } catch (error) {
        console.error(`❌ Erro ao pré-carregar sessão para ${account.name}:`, error);
      }
    }
    
    console.log(`✅ Pré-carregamento concluído: ${sessionMap.size} sessões ativas`);
  } catch (error) {
    console.error('❌ Erro no pré-carregamento:', error);
  }
}


// Variáveis para controlar os timers
let cleanupTimer = null;
let aggressiveTimer = null;

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
    
    // Limpar apenas cache das sessões, mas manter as sessões ativas
    for (const [key, session] of sessionMap.entries()) {
      try {
        session.clearCache(); // Apenas cache, não dados de login
      } catch (e) {
        // Ignorar erros silenciosamente
      }
    }
    
    // APENAS DESTRUIR BROWSERVIEWS SE O MODO PC FRACO ESTIVER ATIVO
    if (isWeakPC) {
      console.log('💻 Modo PC Fraco ativo - Aplicando limpeza agressiva de BrowserViews');
      
      // DESTRUIÇÃO AGRESSIVA: Manter apenas 1 BrowserView ativa
      const activeAccount = accounts.find(acc => acc.active);
      const viewsToDestroy = [];
      
      browserViews.forEach((view, accountId) => {
        if (accountId !== activeAccount?.id) {
          try {
            // DESTRUIR completamente BrowserViews inativas
            if (!view.webContents.isDestroyed()) {
              mainWindow.removeBrowserView(view);
              view.webContents.destroy();
              viewsToDestroy.push(accountId);
            }
          } catch (e) {
            // Ignorar erros silenciosamente
          }
        } else {
          // Manter apenas a view ativa
          try {
            if (!view.webContents.isDestroyed()) {
              view.webContents.setBackgroundThrottling(false);
            }
          } catch (e) {
            // Ignorar erros silenciosamente
          }
        }
      });
      
      // Remover referências das BrowserViews destruídas
      viewsToDestroy.forEach(accountId => {
        browserViews.delete(accountId);
      });
    } else {
      console.log('⚡ Modo normal - Preservando todas as BrowserViews');
    }
    
  } catch (error) {
    // Silenciar erros para evitar EPIPE
  }
}

// SISTEMA DE KILL SWITCH - CONTROLE REMOTO
const KILL_SWITCH_URL = 'https://meu-filho-kill-switch.onrender.com/api/status'; // URL do seu servidor
const KILL_SWITCH_CHECK_INTERVAL = 30 * 60 * 1000; // Verificar a cada 30 minutos

// Verificar kill switch
async function checkKillSwitch() {
  try {
    console.log('🔍 Verificando kill switch...');
    
    const response = await fetch(KILL_SWITCH_URL, {
      method: 'GET',
      timeout: 10000 // 10 segundos de timeout
    });
    
    if (!response.ok) {
      console.log('⚠️ Erro ao verificar kill switch, continuando...');
      return;
    }
    
    const data = await response.json();
    
    if (!data.active) {
      console.log('❌ KILL SWITCH ATIVADO - Encerrando aplicação');
      console.log('📢 Motivo:', data.message);
      
      // Mostrar mensagem para o usuário
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('kill-switch-activated', data.message);
      }
      
      // Encerrar aplicação após 3 segundos
      setTimeout(() => {
        app.quit();
      }, 3000);
      
      return true; // Kill switch ativado
    } else {
      console.log('✅ Kill switch OK - App funcionando normalmente');
      return false; // Kill switch não ativado
    }
  } catch (error) {
    console.log('⚠️ Erro ao verificar kill switch:', error.message);
    console.log('📱 Continuando sem verificação...');
    return false; // Em caso de erro, continuar funcionando
  }
}

// Iniciar verificação do kill switch
function startKillSwitch() {
  console.log('🔒 Sistema de kill switch iniciado');
  
  // Verificar imediatamente
  checkKillSwitch();
  
  // Verificar a cada 30 minutos
  killSwitchInterval = setInterval(checkKillSwitch, KILL_SWITCH_CHECK_INTERVAL);
}

// Parar verificação do kill switch
function stopKillSwitch() {
  if (killSwitchInterval) {
    clearInterval(killSwitchInterval);
    killSwitchInterval = null;
    console.log('🔓 Sistema de kill switch parado');
  }
}

// Iniciar timers de limpeza
function startCleanupTimers() {
  // Limpar timers existentes se houver
  if (cleanupTimer) clearInterval(cleanupTimer);
  if (aggressiveTimer) clearInterval(aggressiveTimer);
  
  // Executar limpeza suave a cada 5 minutos
  cleanupTimer = setInterval(cleanupMemory, 5 * 60 * 1000);
  
  // Limpeza agressiva a cada 2 minutos
  aggressiveTimer = setInterval(aggressiveMemoryCleanup, 2 * 60 * 1000);
}

// Parar timers de limpeza
function stopCleanupTimers() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  if (aggressiveTimer) {
    clearInterval(aggressiveTimer);
    aggressiveTimer = null;
  }
}

// Carregar contas do armazenamento (usando fs) - OTIMIZADO
async function loadAccounts() {
  try {
    console.log('🔄 Carregando contas...');
    
    if (fs.existsSync(accountsFilePath)) {
      const data = fs.readFileSync(accountsFilePath, 'utf8');
      
      // Verificar se o arquivo não está vazio
      if (data.trim() === '' || data.trim() === '[]') {
        console.log('⚠️ Arquivo de contas está vazio, verificando backup automático...');
        
        // Tentar restaurar do backup automático
        const autoBackupPath = path.join(userDataPath, 'auto-backup.json');
        if (fs.existsSync(autoBackupPath)) {
          try {
            const backupData = fs.readFileSync(autoBackupPath, 'utf8');
            const backup = JSON.parse(backupData);
            
            if (backup.accounts && Array.isArray(backup.accounts) && backup.accounts.length > 0) {
              console.log(`🔄 Restaurando ${backup.accounts.length} contas do backup automático...`);
              accounts = backup.accounts;
              writeAccounts(accounts);
              console.log('✅ Contas restauradas do backup automático');
              return;
            }
          } catch (backupError) {
            console.log('⚠️ Erro ao ler backup automático:', backupError.message);
          }
        }
        
        console.log('⚠️ Nenhum backup encontrado, usando contas padrão');
        accounts = defaultAccounts;
        writeAccounts(accounts);
      } else {
      accounts = JSON.parse(data);
      console.log(`📱 ${accounts.length} contas carregadas do arquivo.`);
        
        // Verificar se as contas são válidas
        if (!Array.isArray(accounts) || accounts.length === 0) {
          console.log('⚠️ Contas inválidas, verificando backup automático...');
          
          // Tentar restaurar do backup automático
          const autoBackupPath = path.join(userDataPath, 'auto-backup.json');
          if (fs.existsSync(autoBackupPath)) {
            try {
              const backupData = fs.readFileSync(autoBackupPath, 'utf8');
              const backup = JSON.parse(backupData);
              
              if (backup.accounts && Array.isArray(backup.accounts) && backup.accounts.length > 0) {
                console.log(`🔄 Restaurando ${backup.accounts.length} contas do backup automático...`);
                accounts = backup.accounts;
                writeAccounts(accounts);
                console.log('✅ Contas restauradas do backup automático');
                return;
              }
            } catch (backupError) {
              console.log('⚠️ Erro ao ler backup automático:', backupError.message);
            }
          }
          
          console.log('⚠️ Nenhum backup encontrado, usando contas padrão');
          accounts = defaultAccounts;
          writeAccounts(accounts);
        }
      }
      
      // Otimização: Pré-processar contas para melhor performance
      accounts.forEach((account, index) => {
        if (account.id && !account.avatar) {
          account.avatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
        }
        // Garantir que todas as contas tenham propriedades essenciais
        if (!account.active) account.active = false;
        if (!account.name) account.name = `Conta ${index + 1}`;
        if (!account.id) account.id = `account${index + 1}`;
      });
      
      // Salvar contas processadas
      writeAccounts(accounts);
      console.log(`✅ ${accounts.length} contas processadas e salvas`);
      
    } else {
      console.log('📝 Arquivo de contas não existe, verificando backup automático...');
      
      // Tentar restaurar do backup automático
      const autoBackupPath = path.join(userDataPath, 'auto-backup.json');
      if (fs.existsSync(autoBackupPath)) {
        try {
          const backupData = fs.readFileSync(autoBackupPath, 'utf8');
          const backup = JSON.parse(backupData);
          
          if (backup.accounts && Array.isArray(backup.accounts) && backup.accounts.length > 0) {
            console.log(`🔄 Restaurando ${backup.accounts.length} contas do backup automático...`);
            accounts = backup.accounts;
            writeAccounts(accounts);
            console.log('✅ Contas restauradas do backup automático');
            return;
          }
        } catch (backupError) {
          console.log('⚠️ Erro ao ler backup automático:', backupError.message);
        }
      }
      
      console.log('📝 Nenhum backup encontrado, criando com contas padrão');
      accounts = defaultAccounts;
      writeAccounts(accounts);
      console.log('✅ Contas padrão criadas e salvas');
    }
  } catch (error) {
    console.error('❌ Erro ao carregar contas:', error);
    console.log('🔄 Tentando restaurar do backup automático...');
    
    // Tentar restaurar do backup automático em caso de erro
    const autoBackupPath = path.join(userDataPath, 'auto-backup.json');
    if (fs.existsSync(autoBackupPath)) {
      try {
        const backupData = fs.readFileSync(autoBackupPath, 'utf8');
        const backup = JSON.parse(backupData);
        
        if (backup.accounts && Array.isArray(backup.accounts) && backup.accounts.length > 0) {
          console.log(`🔄 Restaurando ${backup.accounts.length} contas do backup automático...`);
          accounts = backup.accounts;
          writeAccounts(accounts);
          console.log('✅ Contas restauradas do backup automático');
          return;
        }
      } catch (backupError) {
        console.log('⚠️ Erro ao ler backup automático:', backupError.message);
      }
    }
    
    console.log('🔄 Usando contas padrão como fallback');
    accounts = defaultAccounts;
    writeAccounts(accounts);
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
  try {
    console.log(`🔧 Criando BrowserView para: ${accountId}`);
    
    // Validar se a conta existe
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) {
      console.error(`❌ Conta ${accountId} não encontrada`);
      return null;
    }
    
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
  console.log(`🔧 User-Agent para ${accountId}: ${randomUserAgent}`);
  view.webContents.setUserAgent(randomUserAgent);

  // Scripts já são injetados via preload, não precisamos injetar novamente
  console.log(`🕵️ Scripts de evasão já carregados via preload para: ${accountId}`);

  // Injetar script de mascaramento quando o DOM estiver pronto
  view.webContents.on('dom-ready', () => {
    console.log(`Discord DOM pronto para ${accountId}`);
    
    // Scripts de evasão já estão carregados via preload (stealth-safe.js)
    // Não precisamos mais injetar scripts adicionais
    
    console.log(`🕵️ Scripts de evasão ativos para: ${accountId}`);
    
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
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('view-loaded');
    }
    
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
  } catch (error) {
    console.error(`❌ Erro ao criar BrowserView para ${accountId}:`, error);
    // Retornar null em caso de erro, mas não quebrar o app
    return null;
  }
}

// Extrair foto de perfil do Discord
async function extractProfilePicture(view, accountId) {
  try {
    console.log(`🖼️ Extraindo foto de perfil para ${accountId}`);
    
    // Validar se a view existe
    if (!view || !view.webContents) {
      console.error(`❌ BrowserView inválida para ${accountId}`);
      return;
    }
    
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
async function switchToBrowserView(accountId) {
  if (!mainWindow) return;

  // Verificar se modo PC fraco está ativo
  const isWeakPC = await isWeakPCModeActive();
  
  if (isWeakPC) {
    // MODO PC FRACO: Limitar a 5 BrowserViews simultâneas
    console.log(`💻 Modo PC Fraco: Gerenciando BrowserViews (${browserViews.size} ativas)`);
    
    // Se já temos 5 BrowserViews, destruir a mais antiga
    if (browserViews.size >= 5) {
      const oldestAccount = Array.from(browserViews.keys())[0];
      if (oldestAccount !== accountId) {
        const oldestView = browserViews.get(oldestAccount);
        if (oldestView && !oldestView.webContents.isDestroyed()) {
          mainWindow.removeBrowserView(oldestView);
          oldestView.webContents.destroy();
          browserViews.delete(oldestAccount);
          console.log(`💥 BrowserView ${oldestAccount} destruída (limite atingido)`);
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
  
  console.log(`🔄 Trocado para BrowserView: ${accountId} (${browserViews.size} ativas)`);
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
    console.error('❌ Erro ao verificar modo PC fraco:', error);
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
  
  // Só recriar BrowserView se NÃO estiver renomeando, limpando, removendo ou adicionando conta
  if (!isRenaming && !isClearing && !isRemoving && !isAddingAccount) {
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
    console.log(`🚫 Recriação bloqueada - ainda renomeando, limpando, removendo ou adicionando conta`);
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
      
    case 'clear-session':
      // FECHAR COMPLETAMENTE a BrowserView para evitar sobreposição
      console.log(`🧹 Fechando BrowserView para limpeza da conta ${accountId}`);
      isClearing = true; // BLOQUEAR recriação automática
      const activeBrowserViewClear = getCurrentBrowserView();
      if (activeBrowserViewClear) {
        mainWindow.removeBrowserView(activeBrowserViewClear);
        console.log(`🧹 BrowserView removida completamente para limpeza`);
      }
      mainWindow.webContents.send('prompt-for-clear-session', accountId);
      break;
      
    case 'remove':
      // FECHAR COMPLETAMENTE a BrowserView para evitar sobreposição
      console.log(`🗑️ Fechando BrowserView para remoção da conta ${accountId}`);
      isRemoving = true; // BLOQUEAR recriação automática
      const activeBrowserViewRemove = getCurrentBrowserView();
      if (activeBrowserViewRemove) {
        mainWindow.removeBrowserView(activeBrowserViewRemove);
        console.log(`🗑️ BrowserView removida completamente para remoção`);
      }
      mainWindow.webContents.send('prompt-for-remove', accountId);
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
  
  console.log(`✅ Nova conta criada: ${newAccount.name} (${newAccount.id})`);
  return accounts;
});

// Handler para reordenar contas
ipcMain.handle('reorder-accounts', async (event, { fromIndex, toIndex }) => {
  try {
    console.log(`🔄 Reordenando contas: ${fromIndex} → ${toIndex}`);
    
    // Verificar se os índices são válidos
    if (fromIndex < 0 || fromIndex >= accounts.length || 
        toIndex < 0 || toIndex >= accounts.length) {
      console.error('❌ Índices inválidos para reordenação');
      return { success: false, message: 'Índices inválidos' };
    }
    
    // Mover conta no array
    const [movedAccount] = accounts.splice(fromIndex, 1);
    accounts.splice(toIndex, 0, movedAccount);
    
    // Salvar nova ordem
    const saved = writeAccounts(accounts);
    if (saved) {
      console.log(`✅ Contas reordenadas com sucesso: ${fromIndex} → ${toIndex}`);
      return { success: true, message: 'Contas reordenadas com sucesso' };
    } else {
      console.error('❌ Erro ao salvar nova ordem das contas');
      return { success: false, message: 'Erro ao salvar nova ordem' };
    }
  } catch (error) {
    console.error('❌ Erro na reordenação:', error);
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

// Listener para executar limpeza de sessão
ipcMain.on('execute-clear-session', async (event, { accountId }) => {
  try {
    const ses = sessionMap.get(accountId);
    if (ses) {
      await ses.clearStorageData();
      console.log(`🗑️ Sessão limpa para ${accountId}`);
      
      const clearView = browserViews.get(accountId);
      if (clearView) {
        clearView.webContents.reload();
      }
    }
    
    // LIBERAR recriação da BrowserView após limpar
    isClearing = false;
    console.log(`🔓 Limpeza concluída - recriação liberada`);
    
    // Recriar BrowserView após limpar
    const activeAccount = accounts.find(acc => acc.active);
    if (activeAccount && !getCurrentBrowserView()) {
      console.log(`🔄 Recriando BrowserView após limpeza: ${activeAccount.id}`);
      const view = createBrowserView(activeAccount.id);
      browserViews.set(activeAccount.id, view);
      mainWindow.setBrowserView(view);
      setTimeout(() => {
        updateBrowserViewBounds();
      }, 100);
    }
  } catch (error) {
    console.error(`❌ Erro ao limpar sessão da conta ${accountId}:`, error);
    isClearing = false; // Liberar mesmo em caso de erro
  }
});

// Listener para executar remoção
ipcMain.on('execute-remove', (event, { accountId }) => {
  try {
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
      
      // LIBERAR recriação da BrowserView após remover
      isRemoving = false;
      console.log(`🔓 Remoção concluída - recriação liberada`);
      
      // Recriar BrowserView após remover
      const activeAccount = accounts.find(acc => acc.active);
      if (activeAccount && !getCurrentBrowserView()) {
        console.log(`🔄 Recriando BrowserView após remoção: ${activeAccount.id}`);
        const view = createBrowserView(activeAccount.id);
        browserViews.set(activeAccount.id, view);
        mainWindow.setBrowserView(view);
        setTimeout(() => {
          updateBrowserViewBounds();
        }, 100);
      }
    } else {
      console.log(`⚠️ Remoção falhou: conta ${accountId} não encontrada`);
      isRemoving = false; // Liberar mesmo em caso de erro
    }
  } catch (error) {
    console.error(`❌ Erro ao remover conta ${accountId}:`, error);
    isRemoving = false; // Liberar mesmo em caso de erro
  }
});

// Listener para fechar menu de contexto
ipcMain.on('context-menu-closed', () => {
  console.log(`🚦 Sinal verde: Modal fechado`);
  isModalOpen = false; // Sinal verde: Modal fechado
  
  // Restaurar BrowserView após fechar menu de contexto
  const activeAccount = accounts.find(acc => acc.active);
  if (activeAccount && !getCurrentBrowserView() && !isRenaming && !isClearing && !isRemoving && !isAddingAccount) {
    console.log(`🔧 BrowserView restaurada após fechar menu de contexto`);
    const view = createBrowserView(activeAccount.id);
    browserViews.set(activeAccount.id, view);
    mainWindow.setBrowserView(view);
    setTimeout(() => {
      updateBrowserViewBounds();
    }, 100);
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
      console.log('⏰ Timeout na verificação de atualizações');
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
    `Nova atualização ${latestVersion}`
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
    console.error('❌ Erro ao obter modo PC fraco:', error);
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
    
    console.log('💻 Modo PC fraco salvo:', weakPCMode);
    return { success: true };
  } catch (error) {
    console.error('❌ Erro ao salvar modo PC fraco:', error);
    return { success: false, message: error.message };
  }
});

// Aplicar otimizações do modo PC fraco no main process
function applyWeakPCOptimizations() {
  console.log('⚡ Aplicando otimizações do modo PC fraco no main process...');
  
  // Limpar BrowserViews inativas mais agressivamente
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  
  cleanupInterval = setInterval(() => {
    aggressiveBrowserViewCleanup();
  }, 5 * 1000); // A cada 5 segundos
  
  // Aplicar limpeza inicial
  aggressiveBrowserViewCleanup();
  
  console.log('⚡ Otimizações do modo PC fraco aplicadas no main process');
}

// Remover otimizações do modo PC fraco
function removeWeakPCOptimizations() {
  console.log('⚡ Removendo otimizações do modo PC fraco...');
  
  // Restaurar limpeza normal
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  
  cleanupInterval = setInterval(() => {
    cleanupMemory();
  }, 5 * 60 * 1000); // A cada 5 minutos (normal)
  
  console.log('⚡ Otimizações do modo PC fraco removidas');
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
              console.log(`💥 BrowserView ${accountId} destruída (limite de 5 atingido)`);
            }
          } catch (error) {
            console.error(`❌ Erro ao destruir BrowserView ${accountId}:`, error);
          }
        }
      }
    }
    
    // NUNCA LIMPAR SESSÕES NO MODO PC FRACO - APENAS CACHE
    // As sessões devem permanecer logadas sempre!
    console.log(`🔐 Preservando todas as ${sessionMap.size} sessões logadas (NUNCA deslogar)`);
    
    // Forçar garbage collection
    if (global.gc) {
      global.gc();
    }
    
    console.log(`🧹 Limpeza agressiva concluída: ${destroyedCount} BrowserViews destruídas, ${browserViews.size} ativas`);
  } catch (error) {
    console.error('❌ Erro na limpeza agressiva:', error);
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
// SISTEMA DE BACKUP
// ========================================

// Função para copiar diretório recursivamente
async function copyDirectory(source, destination) {
  try {
    // Criar diretório de destino
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }
    
    // Ler todos os itens do diretório fonte
    const items = fs.readdirSync(source);
    
    for (const item of items) {
      const sourcePath = path.join(source, item);
      const destPath = path.join(destination, item);
      
      const stat = fs.statSync(sourcePath);
      
      if (stat.isDirectory()) {
        // Se for diretório, copiar recursivamente
        await copyDirectory(sourcePath, destPath);
      } else {
        // Se for arquivo, copiar diretamente
        fs.copyFileSync(sourcePath, destPath);
      }
    }
    
    console.log(`✅ Diretório copiado: ${source} -> ${destination}`);
  } catch (error) {
    console.error(`❌ Erro ao copiar diretório ${source}:`, error);
    throw error;
  }
}

// Função para copiar conteúdo de diretório (sem recursão para evitar loops)
function copyDirectoryContents(source, destination) {
  try {
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }
    
    const items = fs.readdirSync(source);
    
    for (const item of items) {
      const sourcePath = path.join(source, item);
      const destPath = path.join(destination, item);
      const stat = fs.statSync(sourcePath);
      
      if (stat.isDirectory()) {
        // Para diretórios, criar apenas o diretório vazio (não recursivo)
        fs.mkdirSync(destPath, { recursive: true });
        console.log(`📁 Diretório criado (conteúdo não copiado): ${item}`);
      } else {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`📄 Arquivo copiado: ${item}`);
      }
    }
  } catch (error) {
    console.error('❌ Erro ao copiar conteúdo do diretório:', error);
    throw error;
  }
}

// Função para criar backup completo (contas + sessões + dados de login)
async function createCompleteBackup() {
  try {
    const archiver = require('archiver');
    const os = require('os');
    
    console.log('🔄 Criando backup ZIP da pasta de dados...');
    
    // Mostrar diálogo para escolher onde salvar o backup
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Salvar Backup',
      defaultPath: path.join(os.homedir(), 'Documents', `meu-filho-backup-${new Date().toISOString().split('T')[0]}.zip`),
      filters: [
        { name: 'Arquivos ZIP', extensions: ['zip'] },
        { name: 'Todos os arquivos', extensions: ['*'] }
      ]
    });
    
    if (result.canceled) {
      console.log('❌ Backup cancelado pelo usuário');
      return { success: false, error: 'Backup cancelado pelo usuário' };
    }
    
    const backupPath = result.filePath;
    console.log(`💾 Salvando backup em: ${backupPath}`);
    
    // Criar arquivo ZIP
    const output = fs.createWriteStream(backupPath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Máxima compressão
    });
    
    // Configurar eventos
    output.on('close', () => {
      console.log(`✅ Backup criado com sucesso: ${archive.pointer()} bytes`);
    });
    
    archive.on('error', (err) => {
      console.error('❌ Erro ao criar backup:', err);
      throw err;
    });
    
    // Pipe archive data to the file
    archive.pipe(output);
    
    // Adicionar TODOS os arquivos e diretórios (excluir apenas backups anteriores)
    console.log(`📁 Compactando TODOS os dados de: ${userDataPath}`);
    
    // Listar todos os itens na pasta
    const allItems = fs.readdirSync(userDataPath);
    console.log(`📊 Encontrados ${allItems.length} itens para backup`);
    
    // Verificar se há dados importantes
    const hasAccounts = allItems.includes('accounts.json');
    const hasSessions = allItems.some(item => item.startsWith('discord-'));
    const hasCache = allItems.some(item => ['Cache', 'DawnCache', 'GPUCache'].includes(item));
    const hasAutoBackup = allItems.includes('auto-backup.json');
    
    console.log(`🔍 Verificação de dados:`);
    console.log(`  - Contas: ${hasAccounts ? '✅' : '❌'}`);
    console.log(`  - Sessões: ${hasSessions ? '✅' : '❌'}`);
    console.log(`  - Cache: ${hasCache ? '✅' : '❌'}`);
    console.log(`  - Backup automático: ${hasAutoBackup ? '✅' : '❌'}`);
    
    if (!hasAccounts && !hasSessions && !hasAutoBackup) {
      console.warn('⚠️ Nenhum dado importante encontrado para backup');
      return { 
        success: false, 
        error: 'Nenhum dado importante encontrado para backup. Verifique se há contas e sessões salvas.' 
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
        console.warn(`⚠️ Erro ao calcular tamanho de ${item}:`, error.message);
      }
    }
    
    const estimatedSizeMB = (estimatedSize / (1024 * 1024)).toFixed(2);
    console.log(`📊 Tamanho estimado dos dados: ${estimatedSizeMB} MB`);
    
    let addedCount = 0;
    let skippedCount = 0;
    
    for (const item of allItems) {
      const itemPath = path.join(userDataPath, item);
      const stat = fs.statSync(itemPath);
      
      // Excluir apenas backups anteriores e arquivos temporários
      if (item.startsWith('backup-') || item.startsWith('emergency-') || item.includes('temp')) {
        console.log(`⏭️ Pulando backup anterior: ${item}`);
        skippedCount++;
        continue;
      }
      
      try {
        if (stat.isDirectory()) {
          // Adicionar diretório completo
          archive.directory(itemPath, item);
          console.log(`📁 Adicionando diretório: ${item}`);
          addedCount++;
        } else {
          // Adicionar arquivo
          archive.file(itemPath, { name: item });
          console.log(`📄 Adicionando arquivo: ${item}`);
          addedCount++;
        }
      } catch (addError) {
        console.warn(`⚠️ Erro ao adicionar ${item}:`, addError.message);
        skippedCount++;
      }
    }
    
    console.log(`📊 Resumo do backup:`);
    console.log(`  - Itens adicionados: ${addedCount}`);
    console.log(`  - Itens pulados: ${skippedCount}`);
    console.log(`  - Total processado: ${addedCount + skippedCount}`);
    
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
    
    console.log(`✅ Backup ZIP criado com sucesso: ${backupPath}`);
    console.log(`📊 Tamanho do backup: ${fileSizeMB} MB`);
    
    // Verificar se o backup tem tamanho razoável (pelo menos 1MB)
    if (stats.size < 1024 * 1024) {
      console.warn('⚠️ Backup muito pequeno - pode estar incompleto');
      return { 
        success: false, 
        error: 'Backup muito pequeno - pode estar incompleto. Verifique se há dados para backup.' 
      };
    }
    
    // Verificar se o backup tem pelo menos 10% do tamanho estimado (se estimativa > 0)
    if (estimatedSize > 0) {
      const expectedMinSize = estimatedSize * 0.1; // 10% do tamanho estimado
      if (stats.size < expectedMinSize) {
        console.warn(`⚠️ Backup muito pequeno comparado ao esperado (${fileSizeMB} MB vs ${(expectedMinSize / (1024 * 1024)).toFixed(2)} MB esperado)`);
        return { 
          success: false, 
          error: 'Backup muito pequeno comparado ao esperado. Pode estar incompleto.' 
        };
      }
    }
    
    // Verificar se o backup tem pelo menos alguns arquivos importantes
    if (addedCount < 5) {
      console.warn('⚠️ Muito poucos arquivos no backup - pode estar incompleto');
      return { 
        success: false, 
        error: 'Muito poucos arquivos no backup - pode estar incompleto. Verifique se há dados para backup.' 
      };
    }
    
    // Verificação adicional: tentar abrir o ZIP para confirmar que está válido
    try {
      const testZip = require('decompress');
      const testPath = path.join(os.tmpdir(), 'backup-test');
      const testResult = await testZip(backupPath, testPath);
      console.log(`✅ Backup validado: ${testResult.length} arquivos extraídos`);
      
      // Verificar se os arquivos importantes estão no backup
      const testAccounts = testResult.some(file => file.path.includes('accounts.json'));
      const testSessions = testResult.some(file => file.path.includes('discord-'));
      
      console.log(`🔍 Verificação de integridade:`);
      console.log(`  - accounts.json: ${testAccounts ? '✅' : '❌'}`);
      console.log(`  - Sessões Discord: ${testSessions ? '✅' : '❌'}`);
      
      if (!testAccounts) {
        console.warn('⚠️ accounts.json não encontrado no backup');
        return { 
          success: false, 
          error: 'Backup incompleto - accounts.json não encontrado. Tente novamente.' 
        };
      }
      
      if (!testSessions) {
        console.warn('⚠️ Sessões Discord não encontradas no backup');
        return { 
          success: false, 
          error: 'Backup incompleto - Sessões Discord não encontradas. Tente novamente.' 
        };
      }
      
      // Limpar arquivos de teste
      fs.rmSync(testPath, { recursive: true, force: true });
    } catch (validationError) {
      console.error('❌ Backup inválido:', validationError);
      return { 
        success: false, 
        error: 'Backup criado mas é inválido. Tente novamente.' 
      };
    }
    
    console.log(`🎉 BACKUP COMPLETO E VÁLIDO!`);
    console.log(`📊 Estatísticas finais:`);
    console.log(`  - Tamanho: ${fileSizeMB} MB`);
    console.log(`  - Tamanho estimado: ${estimatedSizeMB} MB`);
    console.log(`  - Itens incluídos: ${addedCount}`);
    console.log(`  - Itens pulados: ${skippedCount}`);
    console.log(`  - Arquivo: ${backupPath}`);
    
    // Calcular eficiência de compressão
    const compressionRatio = estimatedSize > 0 ? ((estimatedSize - stats.size) / estimatedSize * 100).toFixed(1) : '0';
    console.log(`📈 Eficiência de compressão: ${compressionRatio}%`);
    
    return { 
      success: true, 
      path: backupPath, 
      timestamp: Date.now(),
      size: fileSizeMB,
      estimatedSize: estimatedSizeMB,
      itemsAdded: addedCount,
      itemsSkipped: skippedCount,
      compressionRatio: compressionRatio,
      message: `✅ BACKUP COMPLETO E VÁLIDO!\n\nArquivo: ${backupPath}\nTamanho: ${fileSizeMB} MB (${compressionRatio}% de compressão)\nItens incluídos: ${addedCount}\n\nEste backup contém TODOS os dados necessários para restaurar suas contas e sessões.`
    };
    
  } catch (error) {
    console.error('❌ Erro ao criar backup:', error);
    return { success: false, error: `Erro ao criar backup: ${error.message}` };
  }
}

// Função para restaurar backup completo
async function restoreCompleteBackup(backupPath) {
  try {
    const decompress = require('decompress');
    const os = require('os');
    
    console.log('🔄 Restaurando backup ZIP...');
    
    // Se não foi fornecido um caminho, mostrar diálogo para selecionar
    if (!backupPath) {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Selecionar Backup',
        defaultPath: path.join(os.homedir(), 'Documents'),
        filters: [
          { name: 'Arquivos ZIP', extensions: ['zip'] },
          { name: 'Todos os arquivos', extensions: ['*'] }
        ],
        properties: ['openFile']
      });
      
      if (result.canceled) {
        console.log('❌ Restauração cancelada pelo usuário');
        return { success: false, error: 'Restauração cancelada pelo usuário' };
      }
      
      backupPath = result.filePaths[0];
    }
    
    if (!fs.existsSync(backupPath)) {
      return { success: false, error: 'Arquivo de backup não encontrado' };
    }

    console.log(`📁 Restaurando backup de: ${backupPath}`);
    
    // Criar backup de emergência da pasta atual
    const tempBackupPath = path.join(os.tmpdir(), `meu-filho-emergency-backup-${Date.now()}`);
    console.log(`💾 Criando backup de emergência em: ${tempBackupPath}`);
    
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
          console.log(`⏭️ Pulando arquivo de backup no backup de emergência: ${file}`);
          continue;
        }
        
        const destPath = path.join(tempBackupPath, file);
        
        if (stat.isDirectory()) {
          // Copiar diretório (como pastas de sessões)
          fs.mkdirSync(destPath, { recursive: true });
          copyDirectoryContents(filePath, destPath);
          console.log(`📁 Copiando diretório para backup de emergência: ${file}`);
        } else {
          // Copiar arquivo
          fs.copyFileSync(filePath, destPath);
          console.log(`📄 Copiando arquivo para backup de emergência: ${file}`);
        }
      }
      
      console.log('✅ Backup de emergência criado com sucesso');
    } catch (error) {
      console.warn('⚠️ Não foi possível criar backup de emergência:', error.message);
    }
    
    try {
      // Limpar pasta de dados atual (com tratamento de arquivos bloqueados)
      console.log('🗑️ Limpando pasta de dados atual...');
      if (fs.existsSync(userDataPath)) {
        const items = fs.readdirSync(userDataPath);
        for (const item of items) {
          const itemPath = path.join(userDataPath, item);
          const stat = fs.statSync(itemPath);
          
          try {
            if (stat.isDirectory()) {
              // Para diretórios, tentar remover com force
              fs.rmSync(itemPath, { recursive: true, force: true });
              console.log(`🗑️ Diretório removido: ${item}`);
            } else {
              // Para arquivos, tentar remover
              fs.unlinkSync(itemPath);
              console.log(`🗑️ Arquivo removido: ${item}`);
            }
          } catch (error) {
            if (error.code === 'EPERM' || error.code === 'EBUSY') {
              console.log(`⚠️ Arquivo bloqueado pelo sistema, pulando: ${item}`);
              // Tentar renomear o arquivo para removê-lo depois
              try {
                const tempPath = path.join(userDataPath, `${item}.old`);
                fs.renameSync(itemPath, tempPath);
                console.log(`📝 Arquivo renomeado para remoção posterior: ${item}`);
              } catch (renameError) {
                console.log(`⚠️ Não foi possível renomear arquivo bloqueado: ${item}`);
              }
            } else {
              console.log(`⚠️ Erro ao remover ${item}:`, error.message);
            }
          }
        }
      }
      
      // Descompactar backup ZIP
      console.log('📦 Descompactando backup...');
      await decompress(backupPath, userDataPath);
      
      // Tentar remover arquivos renomeados (.old) que não puderam ser deletados
      console.log('🧹 Limpando arquivos renomeados...');
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
              console.log(`🗑️ Arquivo antigo removido: ${item}`);
            } catch (error) {
              console.log(`⚠️ Ainda não foi possível remover: ${item}`);
            }
          }
        }
      } catch (error) {
        console.log('⚠️ Erro na limpeza de arquivos antigos:', error.message);
      }
      
      console.log('✅ Backup restaurado com sucesso!');
      
      // Mostrar diálogo de sucesso
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Backup Restaurado',
        message: 'Backup restaurado com sucesso!',
        detail: 'O aplicativo será reiniciado para aplicar as mudanças.',
        buttons: ['OK']
      });
      
      return { 
        success: true, 
        message: 'Backup restaurado com sucesso! O aplicativo será reiniciado.',
        requiresRestart: true,
        emergencyBackup: tempBackupPath
      };
      
    } catch (error) {
      console.error('❌ Erro durante a restauração:', error);
      
      // Tentar restaurar backup de emergência
      try {
        console.log('🔄 Tentando restaurar backup de emergência...');
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
          await copyDirectory(tempBackupPath, userDataPath);
          console.log('✅ Backup de emergência restaurado');
        }
      } catch (restoreError) {
        console.error('❌ Erro ao restaurar backup de emergência:', restoreError);
      }
      
      return { 
        success: false, 
        error: `Erro ao restaurar backup: ${error.message}`,
        emergencyBackup: tempBackupPath
      };
    }
    
  } catch (error) {
    console.error('❌ Erro ao restaurar backup:', error);
    return { success: false, error: `Erro ao restaurar backup: ${error.message}` };
  }
}

// Função para gerenciar backups (manter apenas os 3 mais recentes)
function manageBackups() {
  try {
    const backupFiles = fs.readdirSync(userDataPath)
      .filter(file => file.startsWith('backup-') && file.endsWith('.json'))
      .map(file => ({
        name: file,
        path: path.join(userDataPath, file),
        timestamp: parseInt(file.replace('backup-', '').replace('.json', ''))
      }))
      .sort((a, b) => b.timestamp - a.timestamp); // Mais recentes primeiro

    // Manter apenas os 3 backups mais recentes
    if (backupFiles.length > 3) {
      const toDelete = backupFiles.slice(3);
      toDelete.forEach(backup => {
        try {
          fs.unlinkSync(backup.path);
          console.log(`🗑️ Backup antigo removido: ${backup.name}`);
              } catch (error) {
          console.error(`❌ Erro ao remover backup ${backup.name}:`, error);
        }
      });
    }

    console.log(`📊 Gerenciamento de backups: ${backupFiles.length} backups encontrados`);
    return backupFiles.slice(0, 3); // Retornar apenas os 3 mais recentes
               } catch (error) {
    console.error('❌ Erro no gerenciamento de backups:', error);
    return [];
  }
}

// Handler para criar backup manual
ipcMain.handle('create-backup', async (event) => {
  console.log('💾 Preparando backup para próxima inicialização...');
  
  try {
    // Abrir diálogo para escolher onde salvar backup
           const result = await dialog.showSaveDialog(mainWindow, {
             title: 'Salvar Backup',
             defaultPath: path.join(require('os').homedir(), 'Documents', 'meu-filho-backup.zip'),
             filters: [
               { name: 'ZIP Files', extensions: ['zip'] },
               { name: 'All Files', extensions: ['*'] }
             ]
           });
    
    if (result.canceled) {
      return { 
        success: false, 
        error: 'Usuário cancelou a operação' 
      };
    }
    
    const userDataPath = app.getPath('userData');
    const intentPath = path.join(userDataPath, 'pending-backup.json');
    
    // Salvar intenção de backup
    const intentData = {
      backupPath: result.filePath,
      timestamp: Date.now()
    };
    
    fs.writeFileSync(intentPath, JSON.stringify(intentData, null, 2), 'utf8');
    console.log('Intencao de backup salva. App sera fechado para executar backup.');
    
          // Fechar app para executar backup
          setTimeout(() => {
            app.quit();
          }, 3000);
    
    return { 
      success: true, 
      message: 'App será fechado em 3 segundos. Abra manualmente após o backup ser concluído' 
    };
    
  } catch (error) {
    console.error('❌ Erro ao preparar backup:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
});

// Handler para restaurar backup
ipcMain.handle('restore-backup', async (event) => {
  console.log('🔄 Preparando restore para próxima inicialização...');
  
  try {
    // Abrir diálogo para escolher arquivo de backup
           const result = await dialog.showOpenDialog(mainWindow, {
             title: 'Selecionar Backup',
             defaultPath: path.join(require('os').homedir(), 'Documents'),
             filters: [
               { name: 'ZIP Files', extensions: ['zip'] },
               { name: 'JSON Files', extensions: ['json'] },
               { name: 'All Files', extensions: ['*'] }
             ],
             properties: ['openFile']
           });
    
    if (result.canceled || result.filePaths.length === 0) {
      return { 
        success: false, 
        error: 'Usuário cancelou a operação' 
      };
    }
    
    const userDataPath = app.getPath('userData');
    const intentPath = path.join(userDataPath, 'pending-restore.json');
    
    // Salvar intenção de restore
    const intentData = {
      sourcePath: result.filePaths[0],
      timestamp: Date.now()
    };
    
    fs.writeFileSync(intentPath, JSON.stringify(intentData, null, 2), 'utf8');
    console.log('Intencao de restore salva. App sera fechado para executar restore.');
    
          // Fechar app para executar restore
          setTimeout(() => {
            app.quit();
          }, 3000);
    
    return { 
      success: true, 
      message: 'App será fechado em 3 segundos. Abra manualmente após o restore ser concluído' 
    };
    
  } catch (error) {
    console.error('❌ Erro ao preparar restore:', error);
    return { 
      success: false, 
      error: error.message 
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
      date: new Date(backup.timestamp).toLocaleString('pt-BR')
    }));
          } catch (error) {
    console.error('❌ Erro ao listar backups:', error);
    return [];
  }
});

// Eventos do app
app.whenReady().then(async () => {
  // 🔄 SISTEMA DE BACKUP/RESTORE COMPLETO ANTES DO APP CARREGAR
  try {
    const userDataPath = app.getPath('userData');
    const accountsPath = path.join(userDataPath, 'accounts.json');
    const partitionsPath = path.join(userDataPath, 'Partitions');
    const backupIntentPath = path.join(userDataPath, 'pending-backup.json');
    const restoreIntentPath = path.join(userDataPath, 'pending-restore.json');
    
    // 📤 VERIFICAR SE HÁ BACKUP PARA FAZER
    if (fs.existsSync(backupIntentPath)) {
        console.log('Executando backup completo pendente...');
      const intentData = JSON.parse(fs.readFileSync(backupIntentPath, 'utf8'));
      const backupPath = intentData.backupPath;
      
        // Mostrar alert nativo do Windows
        console.log('Mostrando alert nativo...');
        try {
          const { exec } = require('child_process');
          
          // Alert nativo simples
          exec('msg * "BACKUP INICIADO - Preparando backup... Por favor, aguarde... NAO FECHE O APP!"', (error) => {
            if (error) {
              console.log('Alert nao pode ser exibido, continuando backup...');
            } else {
              console.log('Alert de progresso exibido');
            }
          });
          
        } catch (error) {
          console.log('Erro ao mostrar alert, continuando backup...');
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
            console.log('⚠️ Erro ao remover pasta temporária, tentando método alternativo...');
            // Método alternativo: renomear e deletar depois
            const tempOldDir = tempBackupDir + '-old-' + Date.now();
            try {
              fs.renameSync(tempBackupDir, tempOldDir);
              // Tentar deletar em background
              setTimeout(() => {
                try {
                  fs.rmSync(tempOldDir, { recursive: true, force: true });
                } catch (e) {
                  console.log('⚠️ Não foi possível limpar pasta antiga:', e.message);
                }
              }, 1000);
            } catch (renameError) {
              console.log('⚠️ Não foi possível renomear pasta, continuando...');
            }
          }
        }
        fs.mkdirSync(tempBackupDir, { recursive: true });
        
        console.log('📁 Copiando accounts.json...');
        if (fs.existsSync(accountsPath)) {
          const accountsData = fs.readFileSync(accountsPath, 'utf8');
          fs.writeFileSync(path.join(tempBackupDir, 'accounts.json'), accountsData, 'utf8');
          console.log('✅ accounts.json copiado');
        } else {
          console.log('⚠️ Arquivo accounts.json não encontrado');
        }
        
        console.log('📁 Copiando pasta Partitions...');
        if (fs.existsSync(partitionsPath)) {
          // Copiar apenas arquivos essenciais (sem cache desnecessário)
          await copyEssentialPartitions(partitionsPath, path.join(tempBackupDir, 'Partitions'));
          console.log('✅ Pasta Partitions copiada (otimizada)');
        } else {
          console.log('⚠️ Pasta Partitions não encontrada');
        }
        
        console.log('🗜️ Criando arquivo ZIP...');
        await createZipFile(tempBackupDir, backupPath);
        console.log('✅ Backup ZIP criado em:', backupPath);
        
        // Limpar pasta temporária com tratamento de erro
        try {
          fs.rmSync(tempBackupDir, { recursive: true, force: true });
          console.log('🧹 Pasta temporária removida');
        } catch (cleanupError) {
          console.log('⚠️ Erro ao limpar pasta temporária:', cleanupError.message);
          // Tentar método alternativo
          try {
            const tempOldDir = tempBackupDir + '-cleanup-' + Date.now();
            fs.renameSync(tempBackupDir, tempOldDir);
            setTimeout(() => {
              try {
                fs.rmSync(tempOldDir, { recursive: true, force: true });
              } catch (e) {
                console.log('⚠️ Não foi possível limpar pasta temporária:', e.message);
              }
            }, 2000);
          } catch (renameError) {
            console.log('⚠️ Não foi possível renomear pasta temporária:', renameError.message);
          }
        }
        
        // Remover arquivo de intenção
        fs.unlinkSync(backupIntentPath);
        console.log('Backup completo concluido!');
        
        // Mostrar alert de sucesso
        console.log('Mostrando alert de sucesso...');
        try {
          const { exec } = require('child_process');
          
          exec(`msg * "BACKUP CONCLUIDO COM SUCESSO! Local: ${backupPath} Backup criado!"`, (error) => {
            if (error) {
              console.log('Alert de sucesso nao pode ser exibido');
            } else {
              console.log('Alert de sucesso exibido');
            }
          });
          
        } catch (error) {
          console.log('Erro ao mostrar alert de sucesso');
        }

        // Apenas mostrar aviso para abrir manualmente
        console.log('Backup concluido! Abra o app manualmente.');
        
      } catch (error) {
        console.error('❌ Erro durante backup:', error);
        
        // Mostrar alert de erro
        console.log('Mostrando alert de erro...');
        try {
          const { exec } = require('child_process');
          
          exec(`msg * "ERRO NO BACKUP! ${error.message} Verifique os logs para mais detalhes."`, (error) => {
            if (error) {
              console.log('Alert de erro nao pode ser exibido');
            } else {
              console.log('Alert de erro exibido');
            }
          });
          
        } catch (error) {
          console.log('Erro ao mostrar alert de erro');
        }
        
        // Limpar pasta temporária em caso de erro
        if (fs.existsSync(tempBackupDir)) {
          try {
            fs.rmSync(tempBackupDir, { recursive: true, force: true });
          } catch (cleanupError) {
            console.log('⚠️ Erro ao limpar pasta temporária em caso de erro:', cleanupError.message);
            // Tentar método alternativo
            try {
              const tempOldDir = tempBackupDir + '-error-' + Date.now();
              fs.renameSync(tempBackupDir, tempOldDir);
              setTimeout(() => {
                try {
                  fs.rmSync(tempOldDir, { recursive: true, force: true });
                } catch (e) {
                  console.log('⚠️ Não foi possível limpar pasta temporária:', e.message);
                }
              }, 2000);
            } catch (renameError) {
              console.log('⚠️ Não foi possível renomear pasta temporária:', renameError.message);
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
      console.log('Executando restore completo pendente...');
      const intentData = JSON.parse(fs.readFileSync(restoreIntentPath, 'utf8'));
      const sourcePath = intentData.sourcePath;
      
      // Abrir CMD para mostrar progresso do restore
      // Mostrar alert nativo do Windows para progresso
        console.log('Mostrando alert nativo...');
      try {
        const { exec } = require('child_process');
        
        // Alert nativo simples
        exec('msg * "RESTORE INICIADO - Preparando restauracao... Por favor, aguarde... NAO FECHE O APP!"', (error) => {
          if (error) {
              console.log('Alert nao pode ser exibido, continuando restore...');
            } else {
              console.log('Alert de progresso exibido');
          }
        });
        
      } catch (error) {
        console.log('Erro ao mostrar alert, continuando restore...');
      }
      
      try {
        if (fs.existsSync(sourcePath)) {
          // Verificar se é arquivo ZIP
          if (sourcePath.endsWith('.zip')) {
            console.log('📦 Extraindo arquivo ZIP...');
            const AdmZip = require('adm-zip');
            const zip = new AdmZip(sourcePath);
            const tempRestoreDir = path.join(userDataPath, 'temp-restore');
            
            // Limpar pasta temporária se existir
            if (fs.existsSync(tempRestoreDir)) {
              fs.rmSync(tempRestoreDir, { recursive: true });
            }
            fs.mkdirSync(tempRestoreDir, { recursive: true });
            
            // Extrair ZIP
            zip.extractAllTo(tempRestoreDir, true);
            console.log('✅ ZIP extraído');
            
            // Restaurar accounts.json
            const accountsBackupPath = path.join(tempRestoreDir, 'accounts.json');
            if (fs.existsSync(accountsBackupPath)) {
              const backupData = fs.readFileSync(accountsBackupPath, 'utf8');
        fs.writeFileSync(accountsPath, backupData, 'utf8');
              console.log('✅ accounts.json restaurado');
            } else {
              console.log('⚠️ accounts.json não encontrado no backup');
            }
            
            // Restaurar Partitions
            const partitionsBackupPath = path.join(tempRestoreDir, 'Partitions');
            if (fs.existsSync(partitionsBackupPath)) {
              console.log('📁 Restaurando Partitions...');
              
              // Remover Partitions existentes
              if (fs.existsSync(partitionsPath)) {
                fs.rmSync(partitionsPath, { recursive: true, force: true });
              }
              
              // Copiar Partitions do backup
              await copyDirectory(partitionsBackupPath, partitionsPath);
              console.log('✅ Partitions (tokens) restaurados');
            } else {
              console.log('⚠️ Partitions não encontradas no backup');
            }
            
            // Limpar pasta temporária
            fs.rmSync(tempRestoreDir, { recursive: true });
            console.log('🧹 Pasta temporária removida');
            
          } else {
            // Backup antigo (não ZIP) - manter compatibilidade
            console.log('📁 Restaurando backup antigo...');
            const backupData = fs.readFileSync(sourcePath, 'utf8');
            fs.writeFileSync(accountsPath, backupData, 'utf8');
            console.log('✅ accounts.json restaurado de:', sourcePath);
            
            // Tentar restaurar Partitions do backup antigo
            const partitionsBackupPath = sourcePath.replace('.json', '-partitions');
            if (fs.existsSync(partitionsBackupPath)) {
              console.log('📁 Restaurando Partitions de:', partitionsBackupPath);
              
              // Remover Partitions existentes
              if (fs.existsSync(partitionsPath)) {
                fs.rmSync(partitionsPath, { recursive: true, force: true });
              }
              
              // Copiar Partitions do backup
              await copyDirectory(partitionsBackupPath, partitionsPath);
              console.log('✅ Partitions (tokens) restaurados de:', partitionsBackupPath);
            } else {
              console.log('⚠️ Partitions de backup não encontradas:', partitionsBackupPath);
            }
          }
        } else {
          console.log('⚠️ Arquivo de backup não encontrado:', sourcePath);
        }
        
        // Remover arquivo de intenção
        fs.unlinkSync(restoreIntentPath);
        console.log('Restore completo concluido!');
        
        // Mostrar alert de sucesso
        console.log('Mostrando alert de sucesso...');
        try {
          const { exec } = require('child_process');
          
          exec('msg * "RESTORE CONCLUIDO COM SUCESSO! Contas restauradas! Abra o app manualmente."', (error) => {
            if (error) {
              console.log('Alert de sucesso nao pode ser exibido');
            } else {
              console.log('Alert de sucesso exibido');
            }
          });
          
    } catch (error) {
          console.log('Erro ao mostrar alert de sucesso');
        }

        // Apenas mostrar aviso para abrir manualmente
        console.log('Restore concluido! Abra o app manualmente.');
        
    } catch (error) {
        console.error('❌ Erro durante restore:', error);
        
        // Mostrar alert de erro
        console.log('Mostrando alert de erro...');
        try {
          const { exec } = require('child_process');
          
          exec(`msg * "ERRO NO RESTORE! ${error.message} Verifique os logs para mais detalhes."`, (error) => {
            if (error) {
              console.log('Alert de erro nao pode ser exibido');
            } else {
              console.log('Alert de erro exibido');
            }
          });
          
        } catch (error) {
          console.log('Erro ao mostrar alert de erro');
        }
        
        // Remover arquivo de intenção mesmo em caso de erro
        if (fs.existsSync(restoreIntentPath)) {
          fs.unlinkSync(restoreIntentPath);
        }
      }
    }
    
    } catch (error) {
    console.log('⚠️ Erro no sistema de backup/restore:', error);
  }

  await loadAccounts();
  createWindow();
  
  // Iniciar timers de limpeza de memória
  startCleanupTimers();
  
  // Iniciar sistema de kill switch
  startKillSwitch();
  
  // Verificar se todas as sessões foram inicializadas corretamente
  setTimeout(() => {
    console.log(`🔍 Verificação de sessões: ${sessionMap.size}/${accounts.length} sessões ativas`);
    const missingSessions = accounts.filter(acc => !sessionMap.has(acc.id));
    if (missingSessions.length > 0) {
      console.log(`⚠️ Contas sem sessão:`, missingSessions.map(acc => `${acc.name} (${acc.id})`));
    }
  }, 5000);

  // Sistema de backup periódico
  setInterval(async () => {
    try {
      console.log('🔄 Executando backup...');
      const result = await createCompleteBackup();
      if (result.success) {
        manageBackups(); // Gerenciar backups após criar
           console.log('✅ Backup concluído');
         }
       } catch (error) {
      console.error('❌ Erro no backup:', error);
    }
  }, 30 * 60 * 1000); // Backup a cada 30 minutos

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  // Parar timers de limpeza antes de fechar
  stopCleanupTimers();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

 app.on('before-quit', async (event) => {
   console.log('💾 Salvando dados da sessão antes de sair...');
   
   // Parar timers de limpeza antes de fechar
   stopCleanupTimers();
   
   event.preventDefault();
   
   try {
     // SISTEMA ULTRA-ROBUSTO: Múltiplas tentativas de salvamento
     let saved = false;
     let attempts = 0;
     const maxAttempts = 5; // Aumentado para 5 tentativas
     
     console.log(`📊 Salvando ${accounts.length} contas...`);
     
     while (!saved && attempts < maxAttempts) {
       try {
         attempts++;
         console.log(`💾 Tentativa ${attempts}/${maxAttempts} de salvamento...`);
         
         // Forçar o salvamento das contas
         const saveResult = writeAccounts(accounts);
         
         if (saveResult) {
         // Verificar se salvou corretamente
         const userDataPath = app.getPath('userData');
         const accountsPath = path.join(userDataPath, 'accounts.json');
         
         if (fs.existsSync(accountsPath)) {
           const savedData = fs.readFileSync(accountsPath, 'utf8');
           const savedAccounts = JSON.parse(savedData);
             
             console.log(`📊 Contas salvas: ${savedAccounts.length}, Contas atuais: ${accounts.length}`);
           
           if (Array.isArray(savedAccounts) && savedAccounts.length === accounts.length) {
             saved = true;
             console.log('✅ Dados salvos com sucesso!');
               
               // Log detalhado das contas salvas
               savedAccounts.forEach((account, index) => {
                 console.log(`  ${index + 1}. ${account.name} (${account.id}) - Ativa: ${account.active}`);
               });
           } else {
             console.log('⚠️ Dados não salvos corretamente, tentando novamente...');
           }
         } else {
           console.log('⚠️ Arquivo não encontrado, tentando novamente...');
           }
         } else {
           console.log('⚠️ writeAccounts retornou false, tentando novamente...');
         }
         
       } catch (error) {
         console.log(`⚠️ Erro na tentativa ${attempts}: ${error.message}`);
         
         if (attempts < maxAttempts) {
           // Aguardar um pouco antes de tentar novamente
           await new Promise(resolve => setTimeout(resolve, 1000));
         }
       }
     }
     
     if (!saved) {
       console.log('🚨 Falha ao salvar dados após múltiplas tentativas');
       
       // Backup de emergência
       try {
         const userDataPath = app.getPath('userData');
         const emergencyPath = path.join(userDataPath, 'emergency-accounts.json');
         fs.writeFileSync(emergencyPath, JSON.stringify(accounts, null, 2));
         console.log('🚨 Backup de emergência criado');
       } catch (emergencyError) {
         console.error('❌ Falha total no backup de emergência:', emergencyError);
       }
     }
     
     console.log('✅ Processo de salvamento finalizado');
     app.exit(0);
     
   } catch (error) {
     console.error('❌ Erro crítico ao salvar dados da sessão:', error);
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