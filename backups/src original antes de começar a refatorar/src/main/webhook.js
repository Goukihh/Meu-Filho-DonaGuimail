/**
 * 🔔 Gerenciador de Webhooks
 * 
 * Valida URLs, envia com retry exponencial e timeout configurável.
 */

const axios = require('axios');

/**
 * Valida se uma URL é um webhook válido do Discord
 */
function validateWebhookURL(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, reason: 'URL vazia ou inválida' };
  }
  
  // Remover espaços
  url = url.trim();
  
  // Verificar se é HTTPS
  if (!url.startsWith('https://')) {
    return { valid: false, reason: 'Webhook deve ser HTTPS' };
  }
  
  // Verificar se é do Discord
  const discordWebhookPattern = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/;
  if (!discordWebhookPattern.test(url)) {
    return { valid: false, reason: 'URL não é um webhook válido do Discord' };
  }
  
  return { valid: true, url };
}

/**
 * Sleep com Promise
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Envia dados para webhook com retry exponencial
 */
async function sendToWebhook(webhookUrl, data, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    timeout = 30000,
    onRetry = null
  } = options;
  
  // Validar webhook
  const validation = validateWebhookURL(webhookUrl);
  if (!validation.valid) {
    throw new Error(`Webhook inválido: ${validation.reason}`);
  }
  
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Log da tentativa
      if (attempt > 0) {
        console.log(`[WEBHOOK] Tentativa ${attempt + 1}/${maxRetries + 1}...`);
        if (onRetry) {
          onRetry(attempt, maxRetries);
        }
      }
      
      // Fazer requisição
      const response = await axios.post(webhookUrl, data, {
        timeout,
        headers: data.getHeaders ? data.getHeaders() : {},
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      
      // Sucesso!
      console.log(`[WEBHOOK] ✅ Enviado com sucesso (status: ${response.status})`);
      return {
        success: true,
        status: response.status,
        data: response.data,
        attempts: attempt + 1
      };
      
    } catch (error) {
      lastError = error;
      
      // Verificar se deve fazer retry
      const shouldRetry = (
        error.code === 'ECONNABORTED' || // Timeout
        error.code === 'ECONNRESET' ||   // Conexão resetada
        error.code === 'ETIMEDOUT' ||    // Timeout de rede
        (error.response && error.response.status >= 500) // Erro do servidor
      );
      
      if (!shouldRetry || attempt === maxRetries) {
        // Não faz retry ou atingiu limite
        break;
      }
      
      // Calcular delay exponencial: 1s, 2s, 4s, 8s...
      const delay = initialDelay * Math.pow(2, attempt);
      console.log(`[WEBHOOK] ⚠️ Erro: ${error.message}. Aguardando ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  // Todas as tentativas falharam
  const errorMessage = lastError.response
    ? `Status ${lastError.response.status}: ${lastError.response.statusText}`
    : lastError.message;
  
  console.error(`[WEBHOOK] ❌ Falha após ${maxRetries + 1} tentativas: ${errorMessage}`);
  
  return {
    success: false,
    error: errorMessage,
    attempts: maxRetries + 1,
    lastError
  };
}

/**
 * Testa se um webhook está funcionando
 */
async function testWebhook(webhookUrl) {
  const validation = validateWebhookURL(webhookUrl);
  if (!validation.valid) {
    return { valid: false, reason: validation.reason };
  }
  
  try {
    const testData = {
      content: '🧪 Teste de webhook do Meu Filho',
      embeds: [{
        title: 'Teste de Conexão',
        description: 'Se você está vendo esta mensagem, o webhook está funcionando!',
        color: 5763719,
        timestamp: new Date().toISOString()
      }]
    };
    
    const response = await axios.post(webhookUrl, testData, {
      timeout: 10000
    });
    
    return {
      valid: true,
      working: true,
      status: response.status
    };
  } catch (error) {
    return {
      valid: true,
      working: false,
      error: error.message,
      status: error.response ? error.response.status : null
    };
  }
}

module.exports = {
  validateWebhookURL,
  sendToWebhook,
  testWebhook
};
