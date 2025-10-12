// ========================================
// SCRIPT DE EVASÃO STEALTH - VERSÃO SEGURA
// ========================================
// Versão mais sutil que não bloqueia captcha agressivamente
// para evitar detecção de automação pelo Discord

console.log('🕵️ Script de evasão stealth (versão segura) carregado');

// ========================================
// MASCARAR FLAG WEBDRIVER (SUBTIL)
// ========================================

// Mascarar webdriver de forma mais natural
Object.defineProperty(navigator, 'webdriver', {
  get: () => false,
  configurable: true
});

// Remover indicadores de automação de forma sutil
try {
  if (window.chrome && window.chrome.runtime) {
    Object.defineProperty(window.chrome, 'runtime', {
      get: () => undefined,
      configurable: false
    });
  }
} catch (e) {
  // Ignorar silenciosamente
}

// ========================================
// MASCARAMENTO NATURAL DE FINGERPRINTING
// ========================================

// Mascarar plugins de forma realista
Object.defineProperty(navigator, 'plugins', {
  get: () => {
    return [
      { name: 'PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
      { name: 'Chromium PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' }
    ];
  },
  configurable: false
});

// Mascarar languages de forma natural
Object.defineProperty(navigator, 'languages', {
  get: () => ['pt-BR', 'pt', 'en-US', 'en'],
  configurable: false
});

// Mascarar platform
Object.defineProperty(navigator, 'platform', {
  get: () => 'Win32',
  configurable: false
});

// Mascarar vendor
Object.defineProperty(navigator, 'vendor', {
  get: () => 'Google Inc.',
  configurable: false
});

// Mascarar hardware de forma realista
Object.defineProperty(navigator, 'hardwareConcurrency', {
  get: () => 8,
  configurable: false
});

Object.defineProperty(navigator, 'deviceMemory', {
  get: () => 8,
  configurable: false
});

Object.defineProperty(navigator, 'maxTouchPoints', {
  get: () => 0,
  configurable: false
});

// ========================================
// SIMULAÇÃO DE COMPORTAMENTO HUMANO
// ========================================

// Adicionar delays naturais para simular comportamento humano
const originalSetTimeout = window.setTimeout;
window.setTimeout = function(callback, delay, ...args) {
  // Adicionar pequenas variações aleatórias (50-150ms)
  const humanDelay = delay + Math.floor(Math.random() * 100) + 50;
  return originalSetTimeout.call(this, callback, humanDelay, ...args);
};

// Simular atividade de mouse ocasional
let lastMouseMove = Date.now();
document.addEventListener('mousemove', () => {
  lastMouseMove = Date.now();
});

// Simular atividade de teclado ocasional
let lastKeyPress = Date.now();
document.addEventListener('keydown', () => {
  lastKeyPress = Date.now();
});

// ========================================
// MASCARAR VARIÁVEIS DO ELECTRON (SUBTIL)
// ========================================

// Remover variáveis do Electron de forma mais natural
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

// ========================================
// TÉCNICAS ANTI-DETECÇÃO DISCORD
// ========================================

// Mascarar timing de performance de forma sutil
if (window.performance && window.performance.now) {
  const originalNow = window.performance.now;
  window.performance.now = function() {
    // Adicionar variação mínima para evitar detecção
    return originalNow.call(this) + (Math.random() - 0.5) * 0.1;
  };
}

// Simular comportamento de navegador real
if (!window.chrome) {
  window.chrome = {};
}

window.chrome.app = undefined;

// ========================================
// TÉCNICAS DISCORD-SAFE (SEM BLOQUEAR CAPTCHA)
// ========================================

// Apenas mascarar headers para parecer mais natural
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const url = args[0];
  
  // Apenas adicionar headers realistas para TODAS as requisições
  if (args[1] && args[1].headers) {
    args[1].headers = {
      ...args[1].headers,
      'User-Agent': navigator.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1'
    };
  }
  
  return originalFetch.apply(this, args);
};

// ========================================
// SIMULAÇÃO DE COMPORTAMENTO NATURAL
// ========================================

// Adicionar eventos de mouse aleatórios para simular atividade humana
setInterval(() => {
  if (Date.now() - lastMouseMove > 30000) { // 30 segundos sem mouse
    // Simular movimento de mouse sutil
    const event = new MouseEvent('mousemove', {
      clientX: Math.random() * window.innerWidth,
      clientY: Math.random() * window.innerHeight
    });
    document.dispatchEvent(event);
  }
}, 30000);

// Simular atividade de teclado ocasional
setInterval(() => {
  if (Date.now() - lastKeyPress > 60000) { // 1 minuto sem teclado
    // Simular tecla pressionada sutil
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      code: 'Tab',
      keyCode: 9
    });
    document.dispatchEvent(event);
  }
}, 60000);

console.log('🕵️ Script de evasão stealth seguro ativado com sucesso');







