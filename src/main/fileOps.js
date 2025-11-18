/**
 * 📁 Operações de arquivo async
 * 
 * Este módulo centraliza operações de I/O para evitar bloquear o thread principal.
 * Todas as funções são async e retornam Promises.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { app } = require('electron');

// Helper para escrever logs de erro/diagnóstico em userData/logs
function writeDiagnosticLog(name, content) {
  try {
    const userData = (app && app.getPath) ? app.getPath('userData') : path.join(__dirname, '..');
    const logsDir = path.join(userData, 'logs');
    if (!fsSync.existsSync(logsDir)) fsSync.mkdirSync(logsDir, { recursive: true });
    const filename = path.join(logsDir, `${name}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
    fsSync.writeFileSync(filename, `${new Date().toISOString()}\n${content}\n`);
    return filename;
  } catch (e) {
    // Se falhar ao escrever logs, não queremos quebrar a lógica de salvamento
    try { console.error('Falha ao escrever diagnostic log:', e); } catch (ignore) { void 0; }
    return null;
  }
}

/**
 * Salva JSON de forma async com backup automático
 */
async function saveJSON(filePath, data, options = {}) {
  const { createBackup = true, validate = true, keepHistory = false, atomic = false } = options;
  
  try {
    // Validar dados antes de salvar
    if (validate && typeof data !== 'object') {
      throw new Error('Dados inválidos: esperado objeto ou array');
    }
    
    // 🔒 PROTEÇÃO: Se arquivo existente tem mais dados que o novo, criar backup com timestamp
    if (createBackup && fsSync.existsSync(filePath)) {
      const existingContent = fsSync.readFileSync(filePath, 'utf8');
      let needsTimestampBackup = false;
      
      try {
        const existingData = JSON.parse(existingContent);
        // Se arquivo existente tem mais itens, é suspeito - criar backup com timestamp
        if (Array.isArray(existingData) && Array.isArray(data)) {
          if (existingData.length > data.length && existingData.length > 3) {
            needsTimestampBackup = true;
            console.warn(`⚠️ ATENÇÃO: Tentando salvar ${data.length} itens sobre arquivo com ${existingData.length} itens!`);
          }
        }
      } catch (e) {
        // Se não conseguir ler arquivo existente, criar backup por segurança
        needsTimestampBackup = true;
      }
      
      // Criar backup com timestamp se necessário
      if (needsTimestampBackup || keepHistory) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backupPath = `${filePath}.backup-${timestamp}`;
        await fs.copyFile(filePath, backupPath);
        console.log(`💾 Backup de segurança criado: ${path.basename(backupPath)}`);
      }
      
      // Criar backup temporário normal também
      const backupPath = `${filePath}.backup`;
      await fs.copyFile(filePath, backupPath);
    }
    
    // Se solicitado, tentar escrita atômica com fsync (melhor durabilidade)
    const jsonString = JSON.stringify(data, null, 2);
    if (atomic) {
      // Tentar escrita atômica com pequenas tentativas (retries)
      const dir = path.dirname(filePath);
      if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true });
      const maxAttempts = 3;
      let lastAtomicError = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const tmpPath = `${filePath}.tmp-${timestamp}`;

          // Limitar arquivos temporários antigos para evitar acúmulo
          try {
            const baseName = path.basename(filePath);
            const allFiles = fsSync.readdirSync(dir);
            const tmpPattern = `${baseName}.tmp-`;
            const tmpFiles = allFiles
              .filter(n => n.indexOf(tmpPattern) === 0)
              .map(n => ({ name: n, full: path.join(dir, n), mtime: fsSync.statSync(path.join(dir, n)).mtimeMs }))
              .sort((a, b) => a.mtime - b.mtime);
            // Manter no máximo 3 arquivos .tmp- mais recentes
            while (tmpFiles.length >= 3) {
              const remove = tmpFiles.shift();
              try { fsSync.unlinkSync(remove.full); } catch (e) { /* ignore */ }
            }
          } catch (e) {
            // Não bloquear escrita por falha ao podar tmp files
            void 0;
          }

          // Escrever em arquivo temporário (sync para garantir fsync)
          const fd = fsSync.openSync(tmpPath, 'w');
          try {
            fsSync.writeSync(fd, jsonString, 'utf8');
            fsSync.fsyncSync(fd);
          } finally {
            try { fsSync.closeSync(fd); } catch (e) { void 0; }
          }

          // Renomear atômico para o destino
          fsSync.renameSync(tmpPath, filePath);

          // Tentar fsync do diretório (melhor garantia de persistência)
          try {
            const dirFd = fsSync.openSync(dir, 'r');
            try { fsSync.fsyncSync(dirFd); } finally { fsSync.closeSync(dirFd); }
          } catch (e) {
            // Alguns sistemas/Windows podem falhar ao fsync do diretório; ignorar
            void 0;
          }

          // Validação opcional
          if (validate) {
            const saved = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(saved);
            if (JSON.stringify(parsed) !== JSON.stringify(data)) {
              throw new Error('Verificação de salvamento falhou após escrita atômica');
            }
          }

          // Remover backup temporário se tudo deu certo
          if (createBackup && fsSync.existsSync(`${filePath}.backup`)) {
            await fs.unlink(`${filePath}.backup`);
          }

          return { success: true, path: filePath };
        } catch (atomicError) {
          lastAtomicError = atomicError;
          // Log diagnóstico para ajudar a entender falhas em campo
          try {
            writeDiagnosticLog('atomic-write-failure', `${filePath}\nAttempt ${attempt} failed:\n${atomicError && (atomicError.stack || atomicError.message)}`);
          } catch (e) { /* ignore */ }

          // Se ainda houver tentativas, aguardar um curto período antes de tentar de novo
          if (attempt < maxAttempts) {
            await new Promise(r => setTimeout(r, 100 * attempt));
            continue;
          }

          // Se esgotaram tentativas, avisar e cair para fallback não-atômico
          console.warn('⚠️ Escrita atômica falhou após tentativas, fazendo fallback para escrita normal:', atomicError && atomicError.message);
        }
      }
      // cair para o caminho não-atômico abaixo
    }

    // Salvar novo arquivo (caminho original não-atômico)
    await fs.writeFile(filePath, jsonString, 'utf8');
    
    // Verificar se salvou corretamente
    if (validate) {
      const saved = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(saved);
      if (JSON.stringify(parsed) !== JSON.stringify(data)) {
        throw new Error('Verificação de salvamento falhou');
      }
    }
    
    // Remover backup temporário se tudo deu certo
    if (createBackup && fsSync.existsSync(`${filePath}.backup`)) {
      await fs.unlink(`${filePath}.backup`);
    }
    
    return { success: true, path: filePath };
  } catch (error) {
    // Restaurar backup se algo deu errado
    const backupPath = `${filePath}.backup`;
    if (createBackup && fsSync.existsSync(backupPath)) {
      try {
        await fs.copyFile(backupPath, filePath);
        await fs.unlink(backupPath);
      } catch (restoreError) {
        console.error('❌ Erro ao restaurar backup:', restoreError);
      }
    }
    
    try {
      // Logar diagnóstico adicional antes de propagar
      writeDiagnosticLog('savejson-final-error', `${filePath}\nError:\n${error && (error.stack || error.message)}`);
    } catch (e) { /* ignore */ }
    throw error;
  }
}

/**
 * Lê JSON de forma async
 */
async function readJSON(filePath, defaultValue = null) {
  try {
    if (!fsSync.existsSync(filePath)) {
      return defaultValue;
    }
    
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ Erro ao ler JSON ${filePath}:`, error.message);
    return defaultValue;
  }
}

/**
 * Escreve arquivo de texto de forma async
 */
async function writeText(filePath, content) {
  try {
    // Garantir que o diretório existe
    const dir = path.dirname(filePath);
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
    
    await fs.writeFile(filePath, content, 'utf8');
    return { success: true, path: filePath };
  } catch (error) {
    console.error(`❌ Erro ao escrever arquivo ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Lê arquivo de texto de forma async
 */
async function readText(filePath, defaultValue = '') {
  try {
    if (!fsSync.existsSync(filePath)) {
      return defaultValue;
    }
    
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    console.error(`❌ Erro ao ler arquivo ${filePath}:`, error.message);
    return defaultValue;
  }
}

/**
 * Deleta arquivo de forma async
 */
async function deleteFile(filePath) {
  try {
    if (fsSync.existsSync(filePath)) {
      await fs.unlink(filePath);
      return { success: true, path: filePath };
    }
    return { success: false, reason: 'File not found' };
  } catch (error) {
    console.error(`❌ Erro ao deletar arquivo ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Copia arquivo de forma async
 */
async function copyFile(source, destination) {
  try {
    const dir = path.dirname(destination);
    if (!fsSync.existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
    
    await fs.copyFile(source, destination);
    return { success: true, source, destination };
  } catch (error) {
    console.error(`❌ Erro ao copiar arquivo de ${source} para ${destination}:`, error.message);
    throw error;
  }
}

module.exports = {
  saveJSON,
  readJSON,
  writeText,
  readText,
  deleteFile,
  copyFile
};
