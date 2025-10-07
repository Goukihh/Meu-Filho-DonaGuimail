// ========================================
// SCRIPT DE TESTE DE EVASÃO
// ========================================
// Testa se as técnicas de evasão estão funcionando

console.log('🧪 Iniciando testes de evasão...');

// Teste 1: Verificar se webdriver está mascarado
function testWebdriverMasking() {
  console.log('🔍 Testando mascaramento de webdriver...');
  
  const webdriver = navigator.webdriver;
  const hasWebdriver = 'webdriver' in navigator;
  
  console.log(`webdriver: ${webdriver}`);
  console.log(`hasWebdriver: ${hasWebdriver}`);
  
  if (webdriver === false || webdriver === undefined) {
    console.log('✅ Webdriver mascarado com sucesso');
    return true;
  } else {
    console.log('❌ Webdriver não foi mascarado');
    return false;
  }
}

// Teste 2: Verificar se APIs de captcha estão bloqueadas
function testCaptchaAPIs() {
  console.log('🔍 Testando bloqueio de APIs de captcha...');
  
  const hcaptcha = window.hcaptcha;
  const grecaptcha = window.grecaptcha;
  const captcha = window.captcha;
  
  console.log(`hcaptcha: ${hcaptcha}`);
  console.log(`grecaptcha: ${grecaptcha}`);
  console.log(`captcha: ${captcha}`);
  
  if (hcaptcha === undefined && grecaptcha === undefined && captcha === undefined) {
    console.log('✅ APIs de captcha bloqueadas com sucesso');
    return true;
  } else {
    console.log('❌ APIs de captcha não foram bloqueadas');
    return false;
  }
}

// Teste 3: Verificar se propriedades do navegador estão mascaradas
function testNavigatorMasking() {
  console.log('🔍 Testando mascaramento do navigator...');
  
  const platform = navigator.platform;
  const vendor = navigator.vendor;
  const languages = navigator.languages;
  const hardwareConcurrency = navigator.hardwareConcurrency;
  const deviceMemory = navigator.deviceMemory;
  
  console.log(`platform: ${platform}`);
  console.log(`vendor: ${vendor}`);
  console.log(`languages: ${languages}`);
  console.log(`hardwareConcurrency: ${hardwareConcurrency}`);
  console.log(`deviceMemory: ${deviceMemory}`);
  
  const tests = [
    platform === 'Win32',
    vendor === 'Google Inc.',
    Array.isArray(languages) && languages.includes('pt-BR'),
    typeof hardwareConcurrency === 'number' && hardwareConcurrency > 0,
    typeof deviceMemory === 'number' && deviceMemory > 0
  ];
  
  const passed = tests.filter(Boolean).length;
  console.log(`✅ ${passed}/${tests.length} testes de navigator passaram`);
  
  return passed === tests.length;
}

// Teste 4: Verificar se plugins estão mascarados
function testPluginsMasking() {
  console.log('🔍 Testando mascaramento de plugins...');
  
  const plugins = navigator.plugins;
  const pluginsLength = plugins.length;
  
  console.log(`plugins.length: ${pluginsLength}`);
  console.log(`plugins:`, Array.from(plugins).map(p => p.name));
  
  if (pluginsLength > 0) {
    console.log('✅ Plugins mascarados com sucesso');
    return true;
  } else {
    console.log('❌ Plugins não foram mascarados');
    return false;
  }
}

// Teste 5: Verificar se variáveis do Electron estão removidas
function testElectronVariables() {
  console.log('🔍 Testando remoção de variáveis do Electron...');
  
  const process = window.process;
  const require = window.require;
  const global = window.global;
  const module = window.module;
  const exports = window.exports;
  
  console.log(`process: ${process}`);
  console.log(`require: ${require}`);
  console.log(`global: ${global}`);
  console.log(`module: ${module}`);
  console.log(`exports: ${exports}`);
  
  const tests = [
    process === undefined,
    require === undefined,
    global === undefined,
    module === undefined,
    exports === undefined
  ];
  
  const passed = tests.filter(Boolean).length;
  console.log(`✅ ${passed}/${tests.length} variáveis do Electron removidas`);
  
  return passed === tests.length;
}

// Teste 6: Verificar se fetch está interceptado
function testFetchInterception() {
  console.log('🔍 Testando interceptação de fetch...');
  
  // Tentar fazer uma requisição para um URL de captcha
  const testUrl = 'https://hcaptcha.com/test';
  
  return fetch(testUrl)
    .then(() => {
      console.log('❌ Fetch não foi interceptado - requisição passou');
      return false;
    })
    .catch((error) => {
      if (error.message.includes('blocked') || error.message.includes('Captcha')) {
        console.log('✅ Fetch interceptado com sucesso');
        return true;
      } else {
        console.log('❌ Fetch interceptado, mas com erro diferente:', error.message);
        return false;
      }
    });
}

// Executar todos os testes
async function runAllTests() {
  console.log('🧪 Executando todos os testes de evasão...');
  
  const results = {
    webdriver: testWebdriverMasking(),
    captchaAPIs: testCaptchaAPIs(),
    navigator: testNavigatorMasking(),
    plugins: testPluginsMasking(),
    electron: testElectronVariables(),
    fetch: await testFetchInterception()
  };
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  console.log(`\n📊 Resultados dos testes:`);
  console.log(`✅ ${passed}/${total} testes passaram`);
  
  Object.entries(results).forEach(([test, result]) => {
    console.log(`${result ? '✅' : '❌'} ${test}: ${result ? 'PASSOU' : 'FALHOU'}`);
  });
  
  if (passed === total) {
    console.log('\n🎉 Todos os testes passaram! Sistema de evasão funcionando perfeitamente.');
  } else {
    console.log('\n⚠️ Alguns testes falharam. Verifique a configuração.');
  }
  
  return results;
}

// Executar testes automaticamente
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runAllTests);
} else {
  runAllTests();
}

// Exportar função para uso manual
if (typeof window !== 'undefined') {
  window.testEvasion = runAllTests;
}





