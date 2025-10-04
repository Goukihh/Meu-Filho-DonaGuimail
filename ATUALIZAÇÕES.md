# 🔄 Sistema de Atualizações Automáticas

## 📦 Como Funciona

O aplicativo agora possui um sistema de atualização automática que verifica o GitHub por novas versões e as instala automaticamente.

## 🚀 Para o Desenvolvedor (Você)

### **Publicar Nova Versão:**

1. **Atualizar versão** no `package.json`:
   ```json
   "version": "1.1.0"
   ```

2. **Executar script de publicação**:
   ```bash
   publish-release.bat
   ```

3. **Release criada automaticamente** no GitHub com o instalador

### **Comandos Disponíveis:**

```bash
# Criar release e publicar no GitHub
npm run build:release

# Criar instalador local (sem publicar)
npm run build:single
```

## 👥 Para os Usuários

### **Atualização Automática:**
- ✅ **Verificação automática**: A cada inicialização
- ✅ **Download automático**: Atualizações baixadas em background
- ✅ **Instalação automática**: Aplicativo reinicia com nova versão
- ✅ **Dados preservados**: Contas e configurações mantidas

### **Como Funciona:**
1. **Usuário abre** o aplicativo
2. **Sistema verifica** GitHub por atualizações
3. **Se houver atualização**: Download automático
4. **Aplicativo reinicia** com nova versão
5. **Dados preservados**: Tudo mantido

## 🔧 Configuração Técnica

### **Auto-Updater:**
```javascript
// Verificação automática
autoUpdater.checkForUpdatesAndNotify();

// Eventos de log
autoUpdater.on('update-available', (info) => {
  console.log('📦 Atualização disponível:', info.version);
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('✅ Atualização baixada:', info.version);
  autoUpdater.quitAndInstall();
});
```

### **Configuração GitHub:**
```json
"publish": {
  "provider": "github",
  "owner": "Goukihh",
  "repo": "Meu-Filho-DonaGuimail"
}
```

## 📋 Processo de Atualização

### **1. Desenvolvedor:**
- Atualiza código
- Muda versão no `package.json`
- Executa `publish-release.bat`
- Release criada no GitHub

### **2. Usuário:**
- Abre aplicativo
- Sistema verifica GitHub
- Download automático (se houver)
- Instalação automática
- Dados preservados

## 🎯 Vantagens

### **✅ Para Desenvolvedor:**
- **Publicação automática**: Um comando cria release
- **Distribuição fácil**: GitHub gerencia tudo
- **Versionamento**: Controle de versões automático
- **Logs detalhados**: Debug de atualizações

### **✅ Para Usuário:**
- **Atualizações automáticas**: Sem intervenção manual
- **Dados preservados**: Contas mantidas
- **Experiência fluida**: Transparente
- **Sempre atualizado**: Última versão

## 🚨 Importante

### **Dados Preservados:**
- ✅ **Contas do Discord**: Mantidas
- ✅ **Configurações**: Preservadas
- ✅ **Cache**: Mantido
- ✅ **Sessões**: Preservadas

### **Requisitos:**
- ✅ **Conexão com internet**: Para verificar atualizações
- ✅ **GitHub acessível**: Para download
- ✅ **Permissões**: Para instalar atualizações

## 🔄 Fluxo Completo

```
Desenvolvedor → Atualiza código → Publica release → GitHub
     ↓
Usuário abre app → Verifica GitHub → Download → Instala → Dados preservados
```

**O sistema de atualizações automáticas está configurado e funcionando!** 🎉✨
