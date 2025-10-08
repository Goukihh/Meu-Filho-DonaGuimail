const https = require('https');
const crypto = require('crypto');
const os = require('os');

class SimpleRemoteControl {
  constructor() {
    this.heartbeatInterval = null;
    this.isRunning = false;
    this.serverUrl = 'localhost:3000';
    this.hardwareId = this.generateHardwareId();
    this.pendingCommands = new Map();
  }

  // Gerar ID único do hardware
  generateHardwareId() {
    try {
      const networkInterfaces = os.networkInterfaces();
      let macAddress = '';
      
      for (const interfaceName in networkInterfaces) {
        const interfaces = networkInterfaces[interfaceName];
        for (const iface of interfaces) {
          if (iface.mac && iface.mac !== '00:00:00:00:00:00') {
            macAddress = iface.mac;
            break;
          }
        }
        if (macAddress) break;
      }
      
      const hardwareInfo = {
        mac: macAddress,
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        cpus: os.cpus().length,
        totalmem: os.totalmem(),
        userInfo: os.userInfo().username
      };
      
      const hardwareString = JSON.stringify(hardwareInfo);
      return crypto.createHash('sha256').update(hardwareString).digest('hex').substring(0, 16);
    } catch (error) {
      console.error('❌ Erro ao gerar hardware ID:', error);
      return 'fallback-id-' + Date.now();
    }
  }

  // Iniciar heartbeat para manter conexão com servidor
  startHeartbeat() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🔐 Iniciando sistema de controle remoto...');
    
    // Registrar usuário primeiro
    this.registerUser();
    
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
      this.checkPendingCommands(); // Verificar comandos pendentes
    }, 10000); // A cada 10 segundos para ser mais responsivo
    
    // Enviar heartbeat inicial
    setTimeout(() => {
      this.sendHeartbeat();
    }, 2000);
  }

  // Parar heartbeat
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.isRunning = false;
    console.log('🔐 Sistema de controle remoto parado');
  }

  // Registrar usuário no servidor
  registerUser() {
    try {
      const os = require('os');
      const postData = JSON.stringify({
        userId: this.hardwareId,
        userName: os.hostname(),
        version: '1.2.4',
        platform: os.platform(),
        arch: os.arch(),
        hardwareId: this.hardwareId,
        timestamp: Date.now()
      });

      const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/register-user',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 5000
      };

      const req = require('http').request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          console.log('✅ Usuário registrado no painel de controle');
        });
      });

      req.on('error', (error) => {
        console.log('⚠️ Servidor do painel offline - continuando sem controle remoto');
      });

      req.on('timeout', () => {
        req.destroy();
      });

      req.setTimeout(5000);
      req.write(postData);
      req.end();
    } catch (error) {
      console.log('⚠️ Erro ao registrar usuário:', error.message);
    }
  }

  // Enviar heartbeat para o servidor
  sendHeartbeat() {
    try {
      const os = require('os');
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      
      // Obter informações reais das contas
      let accountsInfo = { total: 0, active: 0, names: [] };
      
      try {
        const userDataPath = app.getPath('userData');
        const accountsFilePath = path.join(userDataPath, 'accounts.json');
        
        if (fs.existsSync(accountsFilePath)) {
          const accountsData = fs.readFileSync(accountsFilePath, 'utf8');
          const accounts = JSON.parse(accountsData);
          
          if (Array.isArray(accounts)) {
            accountsInfo = {
              total: accounts.length,
              active: accounts.filter(acc => acc.active).length,
              names: accounts.map(acc => acc.name || `Conta ${accounts.indexOf(acc) + 1}`)
            };
          }
        }
      } catch (error) {
        console.log('⚠️ Erro ao ler contas para heartbeat:', error.message);
      }
      
      const postData = JSON.stringify({
        userId: this.hardwareId,
        userName: os.hostname(),
        hardwareId: this.hardwareId,
        timestamp: Date.now(),
        status: 'online',
        accounts: accountsInfo
      });

      const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/heartbeat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 5000
      };

      const req = require('http').request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(responseData);
            if (result.commands && result.commands.length > 0) {
              this.processCommands(result.commands);
            }
          } catch (error) {
            // Servidor pode não estar rodando, isso é normal
          }
        });
      });

      req.on('error', (error) => {
        // Servidor offline, isso é normal em desenvolvimento
      });

      req.on('timeout', () => {
        req.destroy();
      });

      req.setTimeout(5000);
      req.write(postData);
      req.end();
    } catch (error) {
      // Erro silencioso - servidor pode não estar disponível
    }
  }

  // Processar comandos recebidos do servidor
  processCommands(commands) {
    if (!Array.isArray(commands)) {
      console.log('⚠️ Comandos inválidos recebidos:', typeof commands);
      return;
    }

    commands.forEach(command => {
      try {
        if (!command || !command.type) {
          console.log('⚠️ Comando inválido ignorado:', command);
          return;
        }

        console.log(`🔐 Comando recebido: ${command.type}`);
        this.pendingCommands.set(command.id, command);
        
        switch (command.type) {
          case 'send_message':
            this.executeMessage(command.data);
            break;
          case 'restart_app':
            this.executeRestart();
            break;
          case 'disable_app':
            this.executeDisable(command.data);
            break;
          case 'clear_block_file':
            this.executeClearBlock();
            break;
          case 'shutdown':
            this.executeShutdown();
            break;
          case 'restart':
            this.executeRestart();
            break;
          case 'update':
            this.executeUpdate(command.data);
            break;
          default:
            console.log(`🔐 Comando desconhecido: ${command.type}`);
        }
        
        // Marcar comando como executado
        this.markCommandExecuted(command.id);
      } catch (error) {
        console.error('❌ Erro ao processar comando:', command.type, error.message);
      }
    });
  }

  // Executar mensagem
  executeMessage(data) {
    if (!data || !data.message) {
      console.log('⚠️ Dados de mensagem inválidos:', data);
      return;
    }

    console.log('🔐 Executando comando de mensagem:', data.message);
    const { dialog } = require('electron');
    dialog.showMessageBox(null, {
      type: 'info',
      title: 'Mensagem do Administrador',
      message: data.message,
      buttons: ['OK']
    }).catch(error => {
      console.error('❌ Erro ao exibir mensagem:', error);
    });
  }

  // Executar desativação (bloqueio)
  executeDisable(data) {
    if (!data || !data.reason) {
      console.log('⚠️ Dados de desativação inválidos:', data);
      return;
    }

    console.log('🔐 Executando BLOQUEIO:', data.reason);
    
    // Criar backup das contas antes do banimento
    this.createAccountsBackup();
    
    // Criar arquivo de bloqueio
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const blockFile = path.join(process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share'), 'meu-filho', 'BLOCKED.txt');
    
    // Criar pasta se não existir
    const blockDir = path.dirname(blockFile);
    if (!fs.existsSync(blockDir)) {
      fs.mkdirSync(blockDir, { recursive: true });
    }
    
    const blockData = {
      blocked: true,
      reason: data.reason,
      timestamp: Date.now(),
      hardwareId: this.hardwareId
    };
    
    fs.writeFileSync(blockFile, JSON.stringify(blockData, null, 2));
    console.log('🚫 Arquivo de bloqueio criado:', blockFile);
    
    // Mostrar diálogo de bloqueio
    const { dialog } = require('electron');
    dialog.showMessageBox(null, {
      type: 'error',
      title: 'Meu Filho - Acesso Negado',
      message: 'Seu acesso ao app foi desativado pelo administrador.',
      detail: `🚫 BLOQUEIO APLICADO\n\nMotivo: ${data.reason}\n\nO app será fechado em 3 segundos...`
    }).then(() => {
      const { app } = require('electron');
      app.quit();
    }).catch(error => {
      console.error('❌ Erro ao exibir diálogo de bloqueio:', error);
      const { app } = require('electron');
      app.quit();
    });
  }

  // Executar limpeza de bloqueio (desbloqueio)
  executeClearBlock() {
    console.log('🔐 Executando DESBLOQUEIO...');
    
    const fs = require('fs');
    const path = require('path');
    const blockFile = path.join(process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share'), 'meu-filho', 'BLOCKED.txt');
    
    try {
      if (fs.existsSync(blockFile)) {
        fs.unlinkSync(blockFile);
        console.log('✅ Arquivo de bloqueio removido:', blockFile);
      } else {
        console.log('⚠️ Arquivo de bloqueio não encontrado:', blockFile);
      }
      
      // Restaurar backup de contas se existir
      this.restoreAccountsBackup();
      
      // Mostrar diálogo de desbloqueio
      const { dialog } = require('electron');
      dialog.showMessageBox(null, {
        type: 'info',
        title: 'Meu Filho - Acesso Restaurado',
        message: 'Seu acesso ao app foi RESTAURADO pelo administrador.',
        detail: '✅ DESBLOQUEIO APLICADO\n\nSeu acesso foi restaurado e você pode usar o app normalmente.\n\nAs contas foram restauradas do backup.'
      }).catch(error => {
        console.error('❌ Erro ao exibir diálogo de desbloqueio:', error);
      });
    } catch (error) {
      console.error('❌ Erro ao remover arquivo de bloqueio:', error);
    }
  }

  // Marcar comando como executado
  markCommandExecuted(commandId) {
    try {
      const postData = JSON.stringify({ commandId: commandId });
      const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/execute-command',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 3000
      };

      const req = require('http').request(options);
      req.on('error', (error) => {
        console.log('⚠️ Erro ao marcar comando como executado:', error.message);
      });
      req.setTimeout(3000);
      req.write(postData);
      req.end();
    } catch (error) {
      console.log('⚠️ Erro ao marcar comando como executado:', error.message);
    }
  }

  // Executar shutdown
  executeShutdown() {
    console.log('🔐 Executando shutdown remoto...');
    const { app } = require('electron');
    app.quit();
  }

  // Executar restart
  executeRestart() {
    console.log('🔐 Executando restart remoto...');
    const { app } = require('electron');
    app.relaunch();
    app.quit();
  }

  // Executar atualização
  executeUpdate(updateData) {
    console.log('🔐 Executando atualização remota...');
    // Implementar lógica de atualização se necessário
  }

  // Limpar comandos pendentes
  async clearPendingCommands() {
    try {
      const postData = JSON.stringify({
        hardwareId: this.hardwareId,
        action: 'clear'
      });

      const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/clear-commands',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 3000
      };

      const req = require('http').request(options);
      req.on('error', () => {
        // Servidor pode não estar disponível
      });
      req.setTimeout(3000);
      req.write(postData);
      req.end();
    } catch (error) {
      // Erro silencioso
    }
  }

  // Verificar comandos pendentes
  async checkPendingCommands() {
    try {
      const postData = JSON.stringify({ userId: this.hardwareId });
      const options = {
        hostname: 'localhost',
        port: 3000,
        path: '/api/check-commands',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 3000
      };

      const req = require('http').request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => { responseData += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(responseData);
            if (result.commands && result.commands.length > 0) {
              console.log(`🔐 Verificando ${result.commands.length} comandos pendentes`);
              this.processCommands(result.commands);
            }
          } catch (error) {
            console.log('⚠️ Erro ao verificar comandos pendentes:', error.message);
          }
        });
      });

      req.on('error', (error) => {
        console.log('⚠️ Erro ao verificar comandos pendentes:', error.message);
      });

      req.on('timeout', () => {
        req.destroy();
      });

      req.setTimeout(3000);
      req.write(postData);
      req.end();
    } catch (error) {
      console.log('⚠️ Erro ao verificar comandos pendentes:', error.message);
    }
  }

  // Criar backup das contas antes do banimento (SISTEMA ULTRA-ROBUSTO)
  createAccountsBackup() {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      const os = require('os');
      
      const userDataPath = app.getPath('userData');
      const accountsFilePath = path.join(userDataPath, 'accounts.json');
      
      // Verificar se arquivo de contas existe e tem conteúdo
      if (!fs.existsSync(accountsFilePath)) {
        console.log('⚠️ Arquivo de contas não encontrado, criando backup vazio');
        const emptyAccounts = JSON.stringify([], null, 2);
        this.createMultipleBackups(emptyAccounts, userDataPath);
        return;
      }
      
      const accountsData = fs.readFileSync(accountsFilePath, 'utf8');
      
      // Verificar se dados são válidos
      let accounts;
      try {
        accounts = JSON.parse(accountsData);
        if (!Array.isArray(accounts)) {
          throw new Error('Dados de contas inválidos');
        }
      } catch (error) {
        console.log('⚠️ Dados de contas corrompidos, criando backup de recuperação');
        const emptyAccounts = JSON.stringify([], null, 2);
        this.createMultipleBackups(emptyAccounts, userDataPath);
        return;
      }
      
      // Criar backup com timestamp para evitar conflitos
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupData = {
        timestamp: Date.now(),
        date: new Date().toISOString(),
        accounts: accounts,
        version: '1.2.4',
        hardwareId: this.hardwareId,
        backupType: 'before-ban'
      };
      
      const backupJson = JSON.stringify(backupData, null, 2);
      
      // Criar múltiplos backups em locais diferentes
      this.createMultipleBackups(backupJson, userDataPath, timestamp);
      
      console.log('💾 Sistema de backup ultra-robusto ativado');
      console.log(`📊 ${accounts.length} contas salvas em múltiplos locais`);
      
    } catch (error) {
      console.error('❌ Erro crítico ao criar backup das contas:', error);
      
      // Backup de emergência
      try {
        const fs = require('fs');
        const path = require('path');
        const { app } = require('electron');
        const userDataPath = app.getPath('userData');
        const emergencyBackup = path.join(userDataPath, 'emergency-backup.json');
        
        const emergencyData = {
          timestamp: Date.now(),
          error: error.message,
          accounts: [],
          emergency: true
        };
        
        fs.writeFileSync(emergencyBackup, JSON.stringify(emergencyData, null, 2));
        console.log('🚨 Backup de emergência criado');
      } catch (emergencyError) {
        console.error('❌ Falha total no sistema de backup:', emergencyError);
      }
    }
  }
  
  // Criar múltiplos backups em locais diferentes
  createMultipleBackups(backupData, userDataPath, timestamp) {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const backupLocations = [
      // 1. Backup principal (pasta do app)
      path.join(userDataPath, 'accounts-backup-before-ban.json'),
      
      // 2. Backup com timestamp
      path.join(userDataPath, `accounts-backup-${timestamp}.json`),
      
      // 3. Backup na pasta Documents
      path.join(os.homedir(), 'Documents', 'meu-filho-backup.json'),
      
      // 4. Backup na pasta Desktop
      path.join(os.homedir(), 'Desktop', 'meu-filho-backup.json'),
      
      // 5. Backup na pasta AppData (Windows) / Library (macOS)
      path.join(process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share'), 'meu-filho-backup.json'),
      
      // 6. Backup na pasta do usuário
      path.join(os.homedir(), 'meu-filho-backup.json')
    ];
    
    let successCount = 0;
    
    for (const backupPath of backupLocations) {
      try {
        // Criar diretório se não existir
        const dir = path.dirname(backupPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(backupPath, backupData);
        successCount++;
        console.log(`✅ Backup criado: ${backupPath}`);
      } catch (error) {
        console.log(`⚠️ Falha ao criar backup em: ${backupPath} - ${error.message}`);
      }
    }
    
    console.log(`📊 ${successCount}/${backupLocations.length} backups criados com sucesso`);
    
    // Criar arquivo de índice dos backups
    try {
      const indexPath = path.join(userDataPath, 'backup-index.json');
      const indexData = {
        timestamp: Date.now(),
        backups: backupLocations.filter((_, index) => index < successCount),
        totalBackups: successCount,
        created: new Date().toISOString()
      };
      
      fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
      console.log('📋 Índice de backups criado');
    } catch (error) {
      console.log('⚠️ Erro ao criar índice de backups:', error.message);
    }
  }

  // Restaurar backup das contas após desbanimento (SISTEMA ULTRA-ROBUSTO)
  restoreAccountsBackup() {
    try {
      const fs = require('fs');
      const path = require('path');
      const { app } = require('electron');
      const os = require('os');
      
      const userDataPath = app.getPath('userData');
      const accountsFilePath = path.join(userDataPath, 'accounts.json');
      
      console.log('🔄 Iniciando restauração ultra-robusta das contas...');
      
      // Lista de locais de backup para tentar restaurar
      const backupLocations = [
        // 1. Backup principal
        path.join(userDataPath, 'accounts-backup-before-ban.json'),
        
        // 2. Backups com timestamp
        ...this.findTimestampedBackups(userDataPath),
        
        // 3. Backup na pasta Documents
        path.join(os.homedir(), 'Documents', 'meu-filho-backup.json'),
        
        // 4. Backup na pasta Desktop
        path.join(os.homedir(), 'Desktop', 'meu-filho-backup.json'),
        
        // 5. Backup na pasta AppData
        path.join(process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + '/.local/share'), 'meu-filho-backup.json'),
        
        // 6. Backup na pasta do usuário
        path.join(os.homedir(), 'meu-filho-backup.json'),
        
        // 7. Backup de emergência
        path.join(userDataPath, 'emergency-backup.json')
      ];
      
      let restoredAccounts = null;
      let backupUsed = null;
      
      // Tentar restaurar de cada local
      for (const backupPath of backupLocations) {
        try {
          if (fs.existsSync(backupPath)) {
            console.log(`🔍 Tentando restaurar de: ${backupPath}`);
            
            const backupData = fs.readFileSync(backupPath, 'utf8');
            const backup = JSON.parse(backupData);
            
            // Verificar se é backup válido
            if (backup.accounts && Array.isArray(backup.accounts)) {
              restoredAccounts = backup.accounts;
              backupUsed = backupPath;
              console.log(`✅ Backup válido encontrado: ${backupPath}`);
              console.log(`📊 ${restoredAccounts.length} contas encontradas no backup`);
              break;
            } else if (backup.emergency) {
              console.log('🚨 Backup de emergência encontrado, mas sem contas');
            }
          }
        } catch (error) {
          console.log(`⚠️ Erro ao ler backup de ${backupPath}: ${error.message}`);
        }
      }
      
      if (restoredAccounts !== null) {
        // Restaurar contas
        fs.writeFileSync(accountsFilePath, JSON.stringify(restoredAccounts, null, 2));
        console.log(`✅ ${restoredAccounts.length} contas restauradas com sucesso!`);
        console.log(`📁 Backup usado: ${backupUsed}`);
        
        // Criar backup de segurança da restauração
        this.createRestoreBackup(restoredAccounts, userDataPath);
        
        // Limpar backups antigos (manter apenas os mais recentes)
        this.cleanupOldBackups(userDataPath);
        
      } else {
        console.log('⚠️ Nenhum backup válido encontrado, mantendo contas atuais');
        
        // Verificar se arquivo de contas existe
        if (!fs.existsSync(accountsFilePath)) {
          console.log('📝 Criando arquivo de contas vazio');
          fs.writeFileSync(accountsFilePath, JSON.stringify([], null, 2));
        }
      }
      
    } catch (error) {
      console.error('❌ Erro crítico ao restaurar backup das contas:', error);
      
      // Tentar criar arquivo de contas vazio como último recurso
      try {
        const fs = require('fs');
        const path = require('path');
        const { app } = require('electron');
        const userDataPath = app.getPath('userData');
        const accountsFilePath = path.join(userDataPath, 'accounts.json');
        
        if (!fs.existsSync(accountsFilePath)) {
          fs.writeFileSync(accountsFilePath, JSON.stringify([], null, 2));
          console.log('🚨 Arquivo de contas vazio criado como último recurso');
        }
      } catch (emergencyError) {
        console.error('❌ Falha total na restauração:', emergencyError);
      }
    }
  }
  
  // Encontrar backups com timestamp
  findTimestampedBackups(userDataPath) {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const files = fs.readdirSync(userDataPath);
      const timestampedBackups = files
        .filter(file => file.startsWith('accounts-backup-') && file.endsWith('.json'))
        .filter(file => file !== 'accounts-backup-before-ban.json')
        .map(file => path.join(userDataPath, file))
        .sort((a, b) => {
          // Ordenar por data de modificação (mais recente primeiro)
          return fs.statSync(b).mtime - fs.statSync(a).mtime;
        });
      
      return timestampedBackups;
    } catch (error) {
      console.log('⚠️ Erro ao buscar backups com timestamp:', error.message);
      return [];
    }
  }
  
  // Criar backup da restauração
  createRestoreBackup(accounts, userDataPath) {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const restoreBackup = {
        timestamp: Date.now(),
        date: new Date().toISOString(),
        accounts: accounts,
        version: '1.2.4',
        backupType: 'restore-backup'
      };
      
      const restorePath = path.join(userDataPath, 'restore-backup.json');
      fs.writeFileSync(restorePath, JSON.stringify(restoreBackup, null, 2));
      console.log('💾 Backup da restauração criado');
    } catch (error) {
      console.log('⚠️ Erro ao criar backup da restauração:', error.message);
    }
  }
  
  // Limpar backups antigos
  cleanupOldBackups(userDataPath) {
    try {
      const fs = require('fs');
      const path = require('path');
      
      const files = fs.readdirSync(userDataPath);
      const backupFiles = files
        .filter(file => file.startsWith('accounts-backup-') && file.endsWith('.json'))
        .filter(file => file !== 'accounts-backup-before-ban.json')
        .map(file => ({
          name: file,
          path: path.join(userDataPath, file),
          mtime: fs.statSync(path.join(userDataPath, file)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime); // Mais recente primeiro
      
      // Manter apenas os 3 backups mais recentes
      const toDelete = backupFiles.slice(3);
      
      for (const file of toDelete) {
        try {
          fs.unlinkSync(file.path);
          console.log(`🗑️ Backup antigo removido: ${file.name}`);
        } catch (error) {
          console.log(`⚠️ Erro ao remover backup antigo ${file.name}: ${error.message}`);
        }
      }
      
      if (toDelete.length > 0) {
        console.log(`🧹 ${toDelete.length} backups antigos removidos`);
      }
      
    } catch (error) {
      console.log('⚠️ Erro ao limpar backups antigos:', error.message);
    }
  }

  // Verificar se está bloqueado
  async checkBlocked() {
    return new Promise((resolve) => {
      try {
        const postData = JSON.stringify({ hardwareId: this.hardwareId });
        const options = {
          hostname: 'localhost',
          port: 3000,
          path: '/api/check-blocked',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          },
          timeout: 2000
        };
        
        const req = require('http').request(options, (res) => {
          let responseData = '';
          res.on('data', (chunk) => { responseData += chunk; });
          res.on('end', () => {
            try {
              const result = JSON.parse(responseData);
              resolve(result);
            } catch (error) {
              resolve({ blocked: false });
            }
          });
        });
        
        req.on('error', (error) => {
          resolve({ blocked: false });
        });
        
        req.on('timeout', () => {
          req.destroy();
          resolve({ blocked: false });
        });
        
        req.setTimeout(2000);
        req.write(postData);
        req.end();
      } catch (error) {
        resolve({ blocked: false });
      }
    });
  }
}

module.exports = SimpleRemoteControl;
