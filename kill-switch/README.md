# 🔒 Kill Switch - Meu Filho

Servidor de controle remoto para o app "Meu Filho".

## 🚀 Deploy no Railway

1. Acesse [railway.app](https://railway.app)
2. Clique "Login with GitHub"
3. Clique "New Project"
4. Clique "Deploy from GitHub repo"
5. Selecione este repositório
6. Railway fará deploy automático!

## 📝 Configuração

Após o deploy, você receberá uma URL como:
`https://meu-filho-kill-switch-production.up.railway.app`

Use esta URL no arquivo `src/main.js` linha 642:
```javascript
const KILL_SWITCH_URL = 'https://SUA-URL-AQUI.up.railway.app/api/status';
```

## 🎮 Como usar

1. Acesse a URL do seu servidor
2. Clique "DESATIVAR APP" para encerrar todas as instâncias
3. Clique "ATIVAR APP" para permitir funcionamento

## 🔧 Estrutura

- `server.js` - Servidor Express
- `package.json` - Dependências
- `README.md` - Este arquivo

