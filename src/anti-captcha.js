// ========================================
// SISTEMA ANTI-CAPTCHA AVANÇADO
// ========================================
// Técnicas específicas para contornar hCaptcha e reCAPTCHA

console.log('🛡️ Sistema anti-captcha carregado');

// ========================================
// INTERCEPTAÇÃO DE REQUISIÇÕES
// ========================================

// Interceptar fetch globalmente
const originalFetch = window.fetch;
window.fetch = function(...args) {
  const url = args[0];
  
  // Bloquear requisições de captcha
  if (typeof url === 'string' && (
    url.includes('hcaptcha.com') || 
    url.includes('captcha') ||
    url.includes('challenge') ||
    url.includes('recaptcha') ||
    url.includes('google.com/recaptcha')
  )) {
    console.log('🚫 [ANTI-CAPTCHA] Bloqueando fetch:', url);
    return Promise.reject(new Error('Captcha request blocked'));
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
      url.includes('challenge') ||
      url.includes('recaptcha') ||
      url.includes('google.com/recaptcha')
    )) {
      console.log('🚫 [ANTI-CAPTCHA] Bloqueando XHR:', url);
      throw new Error('Captcha XHR blocked');
    }
    return originalOpen.apply(this, [method, url, ...args]);
  };
  
  return xhr;
};

// ========================================
// REMOÇÃO DE ELEMENTOS CAPTCHA
// ========================================

// Observer para remover elementos captcha
const captchaObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === 1) { // Element node
        // Verificar por ID
        if (node.id && (
          node.id.includes('hcaptcha') || 
          node.id.includes('captcha') ||
          node.id.includes('recaptcha') ||
          node.id.includes('g-recaptcha')
        )) {
          console.log('🚫 [ANTI-CAPTCHA] Removendo elemento por ID:', node);
          node.remove();
          return;
        }
        
        // Verificar por classe
        if (node.className && (
          node.className.includes('hcaptcha') ||
          node.className.includes('captcha') ||
          node.className.includes('recaptcha') ||
          node.className.includes('g-recaptcha')
        )) {
          console.log('🚫 [ANTI-CAPTCHA] Removendo elemento por classe:', node);
          node.remove();
          return;
        }
        
        // Verificar por data attributes
        if (node.dataset && (
          node.dataset.sitekey ||
          node.dataset.hcaptcha ||
          node.dataset.recaptcha
        )) {
          console.log('🚫 [ANTI-CAPTCHA] Removendo elemento por data:', node);
          node.remove();
          return;
        }
        
        // Verificar por texto
        if (node.textContent && (
          node.textContent.includes('hCaptcha') ||
          node.textContent.includes('reCAPTCHA') ||
          node.textContent.includes('I\'m not a robot')
        )) {
          console.log('🚫 [ANTI-CAPTCHA] Removendo elemento por texto:', node);
          node.remove();
          return;
        }
      }
    });
  });
});

// Iniciar observer quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    captchaObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
} else {
  captchaObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// ========================================
// SOBRESCREVER APIS DE CAPTCHA
// ========================================

// Remover hCaptcha API
if (window.hcaptcha) {
  window.hcaptcha = undefined;
  console.log('🚫 [ANTI-CAPTCHA] hCaptcha API removida');
}

// Remover reCAPTCHA API
if (window.grecaptcha) {
  window.grecaptcha = undefined;
  console.log('🚫 [ANTI-CAPTCHA] reCAPTCHA API removida');
}

// Sobrescrever funções de verificação
window.hcaptcha = undefined;
window.grecaptcha = undefined;
window.captcha = undefined;

// ========================================
// INTERCEPTAR SCRIPTS DE CAPTCHA
// ========================================

// Interceptar carregamento de scripts
const originalCreateElement = document.createElement;
document.createElement = function(tagName) {
  const element = originalCreateElement.call(this, tagName);
  
  if (tagName.toLowerCase() === 'script') {
    const originalSetAttribute = element.setAttribute;
    element.setAttribute = function(name, value) {
      if (name === 'src' && typeof value === 'string' && (
        value.includes('hcaptcha') ||
        value.includes('captcha') ||
        value.includes('recaptcha') ||
        value.includes('google.com/recaptcha')
      )) {
        console.log('🚫 [ANTI-CAPTCHA] Bloqueando script:', value);
        return; // Não definir o src
      }
      return originalSetAttribute.call(this, name, value);
    };
  }
  
  return element;
};

// ========================================
// MASCARAR TIMING E COMPORTAMENTO
// ========================================

// Adicionar delays realistas
const originalSetTimeout = window.setTimeout;
window.setTimeout = function(callback, delay, ...args) {
  // Adicionar pequenas variações aleatórias para parecer mais humano
  const randomDelay = delay + Math.floor(Math.random() * 100);
  return originalSetTimeout.call(this, callback, randomDelay, ...args);
};

// Mascarar performance timing
if (window.performance && window.performance.now) {
  const originalNow = window.performance.now;
  window.performance.now = function() {
    // Adicionar pequenas variações para evitar detecção
    return originalNow.call(this) + Math.random() * 0.1;
  };
}

// ========================================
// SIMULAR COMPORTAMENTO HUMANO
// ========================================

// Adicionar eventos de mouse aleatórios para simular atividade
let mouseActivity = false;
document.addEventListener('mousemove', () => {
  mouseActivity = true;
  setTimeout(() => {
    mouseActivity = false;
  }, 5000);
});

// Simular atividade de teclado
let keyboardActivity = false;
document.addEventListener('keydown', () => {
  keyboardActivity = true;
  setTimeout(() => {
    keyboardActivity = false;
  }, 3000);
});

// ========================================
// BLOQUEAR DETECÇÃO DE AUTOMAÇÃO
// ========================================

// Sobrescrever propriedades que indicam automação
Object.defineProperty(navigator, 'webdriver', {
  get: () => false,
  configurable: false
});

// Remover indicadores de automação
delete window.chrome;
delete window.navigator.webdriver;

// Mascarar propriedades do Chrome
if (window.chrome) {
  Object.defineProperty(window.chrome, 'runtime', {
    get: () => undefined,
    configurable: false
  });
}

console.log('🛡️ Sistema anti-captcha ativado com sucesso');

