# 🔒 Sistema de Kill Switch - Meu Filho

## 📋 **O que é?**

Sistema de controle remoto que permite **desativar instantaneamente** todas as instâncias do app "Meu Filho" em qualquer lugar do mundo.

## 🚀 **Como usar:**

### **1. Hospedar o Servidor (GRATUITO)**

#### **Opção A: Railway (Recomendado)**
1. Acesse [railway.app](https://railway.app)
2. Conecte sua conta GitHub
3. Crie novo projeto
4. Faça upload dos arquivos:
   - `kill-switch-server.js`
   - `kill-switch-package.json` (renomeie para `package.json`)
5. Deploy automático!

#### **Opção B: Render**
1. Acesse [render.com](https://render.com)
2. Conecte GitHub
3. Crie novo Web Service
4. Use os mesmos arquivos
5. Deploy!

### **2. Configurar URL no App**

No arquivo `src/main.js`, linha 642, altere:
```javascript
const KILL_SWITCH_URL = 'https://SEU-SERVIDOR.onrender.com/api/status';
```

### **3. Usar o Controle**

1. **Acesse seu servidor** (ex: `https://meu-filho-kill-switch.onrender.com`)
2. **Interface simples** com botões:
   - ✅ **ATIVAR APP** - Permite funcionamento
   - ❌ **DESATIVAR APP** - Encerra TODAS as instâncias

## ⚡ **Como funciona:**

1. **App verifica** o servidor a cada 30 minutos
2. **Se servidor retornar "disabled"** → App se fecha automaticamente
3. **Usuário vê mensagem** explicando o motivo
4. **Controle total** do desenvolvedor

## 🔧 **Recursos:**

- ✅ **Controle instantâneo** - Desativa em segundos
- ✅ **Interface web simples** - Fácil de usar
- ✅ **Gratuito** - Railway/Render são gratuitos
- ✅ **Seguro** - Apenas você tem acesso
- ✅ **Funciona offline** - Se servidor cair, app continua

## 📱 **Para o usuário:**

- **App funciona normalmente** quando ativo
- **Mensagem clara** quando desativado
- **Nenhum dado perdido** - apenas encerra
- **Pode reativar** quando você quiser

## 🛡️ **Segurança:**

- **Apenas você** tem acesso ao controle
- **URL secreta** - não compartilhe
- **Verificação automática** - funciona sempre
- **Sem dados coletados** - apenas controle

## 🎯 **Casos de uso:**

- **Desativar versão antiga** quando lançar nova
- **Problemas de segurança** - desativar rapidamente  
- **Controle de licença** - ativar/desativar usuários
- **Manutenção** - desativar temporariamente

## 📞 **Suporte:**

Se precisar de ajuda:
1. Verifique se o servidor está online
2. Confirme se a URL está correta
3. Teste os botões de ativar/desativar
4. Verifique os logs do servidor

---

**🎉 Pronto! Agora você tem controle total sobre seu app!**
