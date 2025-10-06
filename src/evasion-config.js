// ========================================
// CONFIGURAÇÃO DE EVASÃO AVANÇADA
// ========================================
// Configurações para maximizar a evasão de detecção

const EVASION_CONFIG = {
  // User-Agents para rotação
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  ],
  
  // Headers realistas
  headers: {
    'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'sec-ch-ua-arch': '"x86"',
    'sec-ch-ua-bitness': '"64"',
    'sec-ch-ua-full-version': '"131.0.6778.85"',
    'sec-ch-ua-full-version-list': '"Chromium";v="131.0.6778.85", "Not_A Brand";v="24.0.0.0"',
    'sec-ch-ua-model': '""',
    'sec-ch-ua-wow64': '?0'
  },
  
  // Propriedades do navegador para mascarar
  navigator: {
    platform: 'Win32',
    vendor: 'Google Inc.',
    languages: ['pt-BR', 'pt', 'en-US', 'en'],
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    plugins: [
      { name: 'PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
      { name: 'Chromium PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
      { name: 'Microsoft Edge PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
      { name: 'WebKit built-in PDF', description: 'Portable Document Format', filename: 'internal-pdf-viewer' }
    ]
  },
  
  // URLs para bloquear
  blockedUrls: [
    'hcaptcha.com',
    'captcha',
    'challenge',
    'recaptcha',
    'google.com/recaptcha',
    'captcha-api.com',
    'captcha-service.com'
  ],
  
  // Elementos para remover
  blockedElements: [
    'hcaptcha',
    'captcha',
    'recaptcha',
    'g-recaptcha',
    'captcha-container',
    'captcha-wrapper'
  ],
  
  // APIs para desabilitar
  disabledAPIs: [
    'hcaptcha',
    'grecaptcha',
    'captcha',
    'PublicKeyCredential',
    'CredentialsContainer'
  ],
  
  // Timing para simular comportamento humano
  humanTiming: {
    minDelay: 100,
    maxDelay: 500,
    mouseMoveInterval: 2000,
    keyboardInterval: 3000
  }
};

// Exportar configuração
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EVASION_CONFIG;
} else {
  window.EVASION_CONFIG = EVASION_CONFIG;
}

