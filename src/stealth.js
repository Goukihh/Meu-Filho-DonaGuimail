// ========================================
// SCRIPT DE EVASÃO STEALTH - VERSÃO COMPATÍVEL
// ========================================
// Script minimalista focado apenas em mascarar webdriver
// para evitar conflitos com scripts do Discord

console.log('🕵️ Script de evasão stealth (versão compatível) carregado');

// ========================================
// MASCARAR FLAG WEBDRIVER
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

console.log('🕵️ Script de evasão stealth ativado com sucesso');