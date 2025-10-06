// ========================================
// SCRIPT DE EVASÃO STEALTH - VERSÃO ANTI-HCAPTCHA
// ========================================
// Script avançado para contornar hCaptcha e outras proteções

console.log('🕵️ Script de evasão stealth (versão anti-hCaptcha) carregado');

// ========================================
// MASCARAR FLAG WEBDRIVER E AUTOMAÇÃO
// ========================================

// Remover flag webdriver de forma segura
Object.defineProperty(navigator, 'webdriver', {
  get: () => false,
  configurable: true
});

// Remover flags de automação do Chrome de forma segura
try {
  delete window.chrome;
} catch (e) {
  // Ignorar erros silenciosamente
}

try {
  delete window.navigator.webdriver;
} catch (e) {
  // Ignorar erros silenciosamente
}

// ========================================
// MASCARAMENTO AVANÇADO DE FINGERPRINTING
// ========================================

// Mascarar plugins para parecer um navegador real
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

// Mascarar languages
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

// Mascarar hardwareConcurrency
Object.defineProperty(navigator, 'hardwareConcurrency', {
  get: () => 8,
  configurable: false
});

// Mascarar deviceMemory
Object.defineProperty(navigator, 'deviceMemory', {
  get: () => 8,
  configurable: false
});

// Mascarar maxTouchPoints
Object.defineProperty(navigator, 'maxTouchPoints', {
  get: () => 0,
  configurable: false
});

// ========================================
// BLOQUEAR WEBAUTHN E CREDENTIALS
// ========================================

// Desabilitar completamente WebAuthn/Passkey
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

// ========================================
// MASCARAR VARIÁVEIS GLOBAIS DO ELECTRON
// ========================================

// Remover variáveis globais do Electron
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
// MASCARAR CHROME RUNTIME
// ========================================

if (window.chrome) {
  Object.defineProperty(window.chrome, 'runtime', {
    get: () => undefined,
    configurable: false
  });
}

// Adicionar propriedades que navegadores reais possuem
if (!window.chrome) {
  window.chrome = {};
}

window.chrome.app = undefined;
window.chrome.csi = function() {};
window.chrome.loadTimes = function() {};

// ========================================
// TÉCNICAS ANTI-HCAPTCHA ESPECÍFICAS
// ========================================

// Interceptar e modificar requisições do hCaptcha
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const url = args[0];
  
  // Bloquear requisições específicas do hCaptcha
  if (typeof url === 'string' && (
    url.includes('hcaptcha.com') || 
    url.includes('captcha') ||
    url.includes('challenge')
  )) {
    console.log('🚫 Bloqueando requisição hCaptcha:', url);
    return Promise.reject(new Error('Request blocked'));
  }
  
  return originalFetch.apply(this, args);
};

// Interceptar XMLHttpRequest
const originalXHR = window.XMLHttpRequest;
window.XMLHttpRequest = function() {
  const xhr = new originalXHR();
  const originalOpen = xhr.open;
  
  xhr.open = function(method, url, ...args) {
    if (typeof url === 'string' && (
      url.includes('hcaptcha.com') || 
      url.includes('captcha') ||
      url.includes('challenge')
    )) {
      console.log('🚫 Bloqueando XHR hCaptcha:', url);
      throw new Error('XHR blocked');
    }
    return originalOpen.apply(this, [method, url, ...args]);
  };
  
  return xhr;
};

// Remover elementos hCaptcha do DOM
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === 1) { // Element node
        if (node.id && (
          node.id.includes('hcaptcha') || 
          node.id.includes('captcha') ||
          node.className && node.className.includes('hcaptcha')
        )) {
          console.log('🚫 Removendo elemento hCaptcha:', node);
          node.remove();
        }
      }
    });
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Sobrescrever funções de verificação de bot
if (window.hcaptcha) {
  window.hcaptcha = undefined;
  console.log('🚫 hCaptcha API removida');
}

// Sobrescrever funções de verificação de bot
if (window.grecaptcha) {
  window.grecaptcha = undefined;
  console.log('🚫 reCAPTCHA API removida');
}

console.log('🕵️ Script de evasão stealth anti-hCaptcha ativado com sucesso');