// ========================================
// MANIPULADOR DE CAPTCHA INTELIGENTE
// ========================================
// Sistema que detecta captcha mas não bloqueia agressivamente
// para evitar detecção de automação

console.log('🧠 Manipulador de captcha inteligente carregado');

// ========================================
// DETECÇÃO DE CAPTCHA
// ========================================

class CaptchaHandler {
  constructor() {
    this.captchaDetected = false;
    this.captchaElements = [];
    this.observer = null;
    this.init();
  }

  init() {
    this.setupObserver();
    this.setupEventListeners();
    this.simulateHumanBehavior();
  }

  // Detectar elementos de captcha sem removê-los agressivamente
  setupObserver() {
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            this.checkForCaptcha(node);
          }
        });
      });
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Verificar se elemento é captcha
  checkForCaptcha(element) {
    const captchaIndicators = [
      'hcaptcha', 'captcha', 'recaptcha', 'g-recaptcha',
      'captcha-container', 'captcha-wrapper', 'challenge'
    ];

    const isCaptcha = captchaIndicators.some(indicator => 
      element.id?.includes(indicator) ||
      element.className?.includes(indicator) ||
      element.textContent?.includes('I\'m not a robot') ||
      element.textContent?.includes('hCaptcha') ||
      element.textContent?.includes('reCAPTCHA')
    );

    if (isCaptcha) {
      console.log('🔍 Captcha detectado:', element);
      this.captchaDetected = true;
      this.captchaElements.push(element);
      this.handleCaptchaDetected(element);
    }
  }

  // Lidar com captcha detectado de forma sutil
  handleCaptchaDetected(element) {
    // Em vez de remover, vamos mascarar de forma mais sutil
    this.maskCaptchaElement(element);
    this.simulateHumanInteraction();
  }

  // Mascarar elemento de captcha de forma MUITO sutil (Discord-safe)
  maskCaptchaElement(element) {
    try {
      // Apenas tornar menos visível, mas NÃO esconder completamente
      element.style.opacity = '0.8';
      element.style.pointerEvents = 'auto'; // Manter interação
      
      // Adicionar atributo para identificar
      element.setAttribute('data-captcha-masked', 'true');
      
      console.log('🎭 Elemento captcha mascarado de forma Discord-safe');
    } catch (error) {
      console.warn('⚠️ Erro ao mascarar captcha:', error);
    }
  }

  // Simular interação humana quando captcha é detectado
  simulateHumanInteraction() {
    // Simular movimento de mouse
    setTimeout(() => {
      const event = new MouseEvent('mousemove', {
        clientX: Math.random() * window.innerWidth,
        clientY: Math.random() * window.innerHeight
      });
      document.dispatchEvent(event);
    }, Math.random() * 1000 + 500);

    // Simular scroll
    setTimeout(() => {
      window.scrollBy(0, Math.random() * 100 - 50);
    }, Math.random() * 2000 + 1000);

    // Simular tecla pressionada
    setTimeout(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        code: 'Tab',
        keyCode: 9
      });
      document.dispatchEvent(event);
    }, Math.random() * 3000 + 2000);
  }

  // Configurar listeners de eventos
  setupEventListeners() {
    // Listener para detectar tentativas de interação com captcha
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-captcha-masked]')) {
        e.preventDefault();
        e.stopPropagation();
        console.log('🚫 Interação com captcha mascarado bloqueada');
      }
    });

    // Listener para detectar tentativas de foco em captcha
    document.addEventListener('focus', (e) => {
      if (e.target.closest('[data-captcha-masked]')) {
        e.target.blur();
        console.log('🚫 Foco em captcha mascarado bloqueado');
      }
    });
  }

  // Simular comportamento humano contínuo
  simulateHumanBehavior() {
    // Movimento de mouse aleatório
    setInterval(() => {
      if (Math.random() < 0.1) { // 10% de chance a cada intervalo
        const event = new MouseEvent('mousemove', {
          clientX: Math.random() * window.innerWidth,
          clientY: Math.random() * window.innerHeight
        });
        document.dispatchEvent(event);
      }
    }, 5000);

    // Scroll aleatório
    setInterval(() => {
      if (Math.random() < 0.05) { // 5% de chance a cada intervalo
        window.scrollBy(0, Math.random() * 200 - 100);
      }
    }, 10000);

    // Atividade de teclado aleatória
    setInterval(() => {
      if (Math.random() < 0.03) { // 3% de chance a cada intervalo
        const keys = ['Tab', 'Enter', 'Space'];
        const key = keys[Math.floor(Math.random() * keys.length)];
        const event = new KeyboardEvent('keydown', {
          key: key,
          code: key,
          keyCode: key === 'Tab' ? 9 : key === 'Enter' ? 13 : 32
        });
        document.dispatchEvent(event);
      }
    }, 15000);
  }

  // Verificar se captcha está presente
  hasCaptcha() {
    return this.captchaDetected;
  }

  // Obter elementos de captcha
  getCaptchaElements() {
    return this.captchaElements;
  }

  // Limpar detecções
  clear() {
    this.captchaDetected = false;
    this.captchaElements = [];
    if (this.observer) {
      this.observer.disconnect();
    }
  }
}

// ========================================
// INICIALIZAÇÃO
// ========================================

// Inicializar quando DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.captchaHandler = new CaptchaHandler();
  });
} else {
  window.captchaHandler = new CaptchaHandler();
}

// Exportar para uso global
if (typeof window !== 'undefined') {
  window.CaptchaHandler = CaptchaHandler;
}

console.log('🧠 Manipulador de captcha inteligente ativado');







