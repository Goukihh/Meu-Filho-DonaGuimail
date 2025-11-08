/**
 * 📁 Operações de arquivo async
 * 
 * Este módulo centraliza operações de I/O para evitar bloquear o thread principal.
 * Todas as funções são async e retornam Promises.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

/**
 * Salva JSON de forma async com backup automático
 */
async function saveJSON(filePath, data, options = {}) {
  const { createBackup = true, validate = true } = options;
  
  try {
    // Validar dados antes de salvar
    if (validate && typeof data !== 'object') {
      throw new Error('Dados inválidos: esperado objeto ou array');
    }
    
    // Criar backup se arquivo existir
    if (createBackup && fsSync.existsSync(filePath)) {
      const backupPath = `${filePath}.backup`;
      await fs.copyFile(filePath, backupPath);
    }
    
    // Salvar novo arquivo
    const jsonString = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, jsonString, 'utf8');
    
    // Verificar se salvou corretamente
    if (validate) {
      const saved = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(saved);
      if (JSON.stringify(parsed) !== JSON.stringify(data)) {
        throw new Error('Verificação de salvamento falhou');
      }
    }
    
    // Remover backup se tudo deu certo
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
