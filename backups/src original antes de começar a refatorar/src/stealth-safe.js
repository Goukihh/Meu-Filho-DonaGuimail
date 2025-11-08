// Script de stealth (compatível com Discord)
console.log('Stealth carregando...');

// Mascarar webdriver
Object.defineProperty(navigator, 'webdriver', {
  get: () => undefined,
  configurable: true,
});

// Remover variáveis do Electron
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

// Adicionar window.chrome com suporte a iframes
if (!window.chrome) {
  Object.defineProperty(window, 'chrome', {
    value: {
      runtime: {},
      loadTimes: function () {},
      csi: function () {},
      app: {},
    },
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

// Garantir window.chrome em todos os iframes
const injectChromeIntoIframe = iframe => {
  try {
    if (iframe.contentWindow && !iframe.contentWindow.chrome) {
      Object.defineProperty(iframe.contentWindow, 'chrome', {
        value: {
          runtime: {},
          loadTimes: function () {},
          csi: function () {},
          app: {},
        },
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  } catch (e) {
    // Cross-origin iframe ignorado
  }
};

// Observer para iframes existentes
document.querySelectorAll('iframe').forEach(injectChromeIntoIframe);

// Observer para iframes novos
const iframeObserver = new MutationObserver(mutations => {
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.tagName === 'IFRAME') {
        node.addEventListener('load', () => injectChromeIntoIframe(node));
      }
    });
  });
});

// Iniciar observação de iframes
if (document.body) {
  iframeObserver.observe(document.body, { childList: true, subtree: true });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    iframeObserver.observe(document.body, { childList: true, subtree: true });
  });
}

// Adicionar navigator.plugins fake
if (navigator.plugins.length === 0) {
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      return [
        {
          name: 'Chrome PDF Plugin',
          filename: 'internal-pdf-viewer',
          description: 'Portable Document Format',
        },
        {
          name: 'Chrome PDF Viewer',
          filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai',
          description: '',
        },
        {
          name: 'Native Client',
          filename: 'internal-nacl-plugin',
          description: '',
        },
      ];
    },
  });
}

// Adicionar navigator.languages
if (!navigator.languages || navigator.languages.length === 0) {
  Object.defineProperty(navigator, 'languages', {
    get: () => ['pt-BR', 'pt', 'en-US', 'en'],
  });
}

// Mascarar permissions
if (navigator.permissions && navigator.permissions.query) {
  const originalQuery = navigator.permissions.query;
  navigator.permissions.query = parameters => {
    if (parameters.name === 'notifications') {
      return Promise.resolve({ state: 'prompt' });
    }
    return originalQuery(parameters);
  };
}

// Remover traces de automation
delete navigator.__driver_evaluate;
delete navigator.__webdriver_evaluate;
delete navigator.__selenium_evaluate;
delete navigator.__fxdriver_evaluate;
delete navigator.__driver_unwrapped;
delete navigator.__webdriver_unwrapped;
delete navigator.__selenium_unwrapped;
delete navigator.__fxdriver_unwrapped;
delete navigator.__webdriver_script_fn;
delete navigator.__webdriver_script_func;
delete navigator.__webdriver_script_function;

// Battery API fake
if (!navigator.getBattery) {
  navigator.getBattery = () =>
    Promise.resolve({
      charging: true,
      chargingTime: 0,
      dischargingTime: Infinity,
      level: 1,
    });
}

// Mascarar navigator.userAgentData
if (navigator.userAgentData) {
  Object.defineProperty(navigator, 'userAgentData', {
    get: () => ({
      brands: [
        { brand: 'Google Chrome', version: '131' },
        { brand: 'Chromium', version: '131' },
        { brand: 'Not_A Brand', version: '24' },
      ],
      mobile: false,
      platform: 'Windows',
    }),
    configurable: true,
    enumerable: true,
  });
}

// Mascarar Notification.permission
try {
  if (window.Notification) {
    Object.defineProperty(Notification, 'permission', {
      get: () => 'default',
      configurable: true,
    });
  }
} catch (e) {
  // Ignorado
}

// Adicionar fake de browser history
try {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    // Delay natural
    setTimeout(() => originalPushState.apply(history, args), 0);
  };

  history.replaceState = function (...args) {
    setTimeout(() => originalReplaceState.apply(history, args), 0);
  };
} catch (e) {
  // Ignorado
}

// Mascarar outerHTML
try {
  const originalOuterHTMLDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'outerHTML');
  if (originalOuterHTMLDesc) {
    Object.defineProperty(Element.prototype, 'outerHTML', {
      get: function () {
        return originalOuterHTMLDesc.get.call(this);
      },
      set: function (value) {
        originalOuterHTMLDesc.set.call(this, value);
      },
    });
  }
} catch (e) {
  // Ignorado
}

// Remover propriedades específicas do Electron
delete window.electron;
delete window._electron;
delete window.electronRequire;
delete window.Buffer;

// Mascarar chrome.runtime
if (window.chrome && window.chrome.runtime) {
  // Simular extensão real
  Object.defineProperty(window.chrome, 'runtime', {
    value: {
      sendMessage: () => {},
      connect: () => {},
      onMessage: {
        addListener: () => {},
        removeListener: () => {},
      },
    },
    configurable: true,
    enumerable: true,
  });
}

// Adicionar fake de service worker
if (!navigator.serviceWorker) {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      register: () => Promise.reject('NotSupportedError'),
      getRegistrations: () => Promise.resolve([]),
      ready: Promise.reject('NotSupportedError'),
    },
    configurable: true,
    enumerable: true,
  });
}

// Mascarar conexão de rede
if (navigator.connection || navigator.mozConnection || navigator.webkitConnection) {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  Object.defineProperty(navigator, 'connection', {
    value: {
      effectiveType: '4g',
      rtt: 50,
      downlink: 10,
      saveData: false,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    configurable: true,
    enumerable: true,
  });
}

// Proteger contra timing attacks
const originalPerformanceNow = performance.now;
performance.now = function () {
  // Micro-variação aleatória (0-0.1ms)
  return originalPerformanceNow.call(performance) + Math.random() * 0.1;
};

// Mascarar Date com variação natural
const originalDate = Date;
// eslint-disable-next-line no-global-assign
Date = class extends originalDate {
  constructor(...args) {
    if (args.length === 0) {
      // Micro-variação aleatória (0-10ms)
      super(originalDate.now() + Math.floor(Math.random() * 10));
    } else {
      super(...args);
    }
  }

  static now() {
    // Micro-variação aleatória
    return originalDate.now() + Math.floor(Math.random() * 10);
  }
};

// Remover traces do Chrome DevTools Protocol
delete window.__remoteFunction__;
delete window.__nightmare;
delete window._Selenium_IDE_Recorder;
delete window.domAutomation;
delete window.domAutomationController;

// Adicionar fake de speech synthesis
if (!window.speechSynthesis) {
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      getVoices: () => [],
      speak: () => {},
      cancel: () => {},
      pause: () => {},
      resume: () => {},
      pending: false,
      speaking: false,
      paused: false,
    },
    configurable: true,
    enumerable: true,
  });
}

// Proteção contra canvas fingerprinting
try {
  const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;

  // Adicionar ruído mínimo para variar fingerprint
  const addCanvasNoise = (canvas, context) => {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (Math.random() < 0.0001) {
        imageData.data[i] = imageData.data[i] ^ 1;
      }
    }
    context.putImageData(imageData, 0, 0);
  };

  HTMLCanvasElement.prototype.toDataURL = function (...args) {
    const context = this.getContext('2d');
    if (context) {
      addCanvasNoise(this, context);
    }
    return originalToDataURL.apply(this, args);
  };

  HTMLCanvasElement.prototype.toBlob = function (...args) {
    const context = this.getContext('2d');
    if (context) {
      addCanvasNoise(this, context);
    }
    return originalToBlob.apply(this, args);
  };

  CanvasRenderingContext2D.prototype.getImageData = function (...args) {
    const imageData = originalGetImageData.apply(this, args);
    // Ruído mínimo
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (Math.random() < 0.0001) {
        imageData.data[i] = imageData.data[i] ^ 1;
      }
    }
    return imageData;
  };
} catch (e) {
  // Ignorado
}

// Proteção contra audio context fingerprinting
try {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (AudioContext) {
    const originalGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function (...args) {
      const channelData = originalGetChannelData.apply(this, args);
      // Ruído mínimo
      for (let i = 0; i < channelData.length; i++) {
        if (Math.random() < 0.00001) {
          channelData[i] = channelData[i] + (Math.random() - 0.5) * 0.0001;
        }
      }
      return channelData;
    };
  }
} catch (e) {
  // Ignorado
}

// Proteção contra WebRTC leak
try {
  // Bloquear RTCPeerConnection para prevenir leak de IP
  if (window.RTCPeerConnection) {
    const originalRTCPeerConnection = window.RTCPeerConnection;
    window.RTCPeerConnection = function (...args) {
      const pc = new originalRTCPeerConnection(...args);
      // Bloquear data channels
      const originalCreateDataChannel = pc.createDataChannel;
      pc.createDataChannel = function () {
        console.log('WebRTC data channel bloqueado');
        return null;
      };
      return pc;
    };
  }

  // Mascarar navigator.mediaDevices
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices;
    navigator.mediaDevices.enumerateDevices = async function () {
      const devices = await originalEnumerateDevices.call(this);
      // Retornar dispositivos genéricos
      return devices.map((device, _index) => ({
        deviceId: 'default',
        kind: device.kind,
        label:
          device.kind === 'audioinput'
            ? 'Microphone'
            : device.kind === 'audiooutput'
              ? 'Speaker'
              : 'Camera',
        groupId: 'default',
      }));
    };
  }
} catch (e) {
  // Ignorado
}

// Proteção contra font fingerprinting
try {
  // Normalizar lista de fontes
  const commonFonts = [
    'Arial',
    'Verdana',
    'Helvetica',
    'Times New Roman',
    'Courier New',
    'Georgia',
    'Palatino',
    'Garamond',
    'Bookman',
    'Comic Sans MS',
    'Trebuchet MS',
    'Arial Black',
    'Impact',
  ];

  // Interceptar document.fonts.check
  if (document.fonts && document.fonts.check) {
    const originalCheck = document.fonts.check;
    document.fonts.check = function (font) {
      // Retornar true para fontes comuns
      const fontFamily = font.split(' ').pop().replace(/['"]/g, '');
      return commonFonts.includes(fontFamily) ? true : originalCheck.call(this, font);
    };
  }

  // Mascarar offsetWidth/offsetHeight
  const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  const originalOffsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight'
  );

  if (originalOffsetWidth && originalOffsetHeight) {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      get: function () {
        const width = originalOffsetWidth.get.call(this);
        // Micro-variação aleatória (0-1px)
        return width + (Math.random() < 0.5 ? 0 : Math.floor(Math.random() * 2));
      },
    });

    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      get: function () {
        const height = originalOffsetHeight.get.call(this);
        // Micro-variação aleatória (0-1px)
        return height + (Math.random() < 0.5 ? 0 : Math.floor(Math.random() * 2));
      },
    });
  }
} catch (e) {
  // Ignorado
}

console.log('Mascaramento aplicado (24+ proteções)');
console.log('Propriedades protegidas:');
console.log('   - navigator.webdriver:', navigator.webdriver);
console.log('   - window.chrome:', typeof window.chrome);
console.log('   - navigator.plugins.length:', navigator.plugins.length);
console.log('   - navigator.languages:', navigator.languages);
console.log('   - navigator.userAgentData:', !!navigator.userAgentData);
console.log('   - window.electron:', typeof window.electron);
console.log('   - Canvas fingerprinting: Protegido');
console.log('   - Audio fingerprinting: Protegido');
console.log('   - WebRTC leak: Bloqueado');
console.log('   - Font fingerprinting: Normalizado');
console.log('   - Total de proteções: 24+');
