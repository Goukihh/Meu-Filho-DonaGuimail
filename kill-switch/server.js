const express = require('express');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Status do app (true = ativo, false = desativado)
let appStatus = {
  active: true,
  message: "App funcionando normalmente",
  lastUpdate: new Date().toISOString()
};

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Endpoint para verificar status do app
app.get('/api/status', (req, res) => {
  console.log(`📊 Verificação de status: ${appStatus.active ? 'ATIVO' : 'DESATIVADO'}`);
  res.json({
    active: appStatus.active,
    message: appStatus.message,
    timestamp: new Date().toISOString()
  });
});

// Endpoint para ativar o app
app.post('/api/activate', (req, res) => {
  appStatus.active = true;
  appStatus.message = "App reativado pelo desenvolvedor";
  appStatus.lastUpdate = new Date().toISOString();
  
  console.log('✅ App ATIVADO remotamente');
  res.json({ success: true, message: "App ativado com sucesso" });
});

// Endpoint para desativar o app
app.post('/api/deactivate', (req, res) => {
  appStatus.active = false;
  appStatus.message = "App desativado pelo desenvolvedor";
  appStatus.lastUpdate = new Date().toISOString();
  
  console.log('❌ App DESATIVADO remotamente - Todas as instâncias serão encerradas');
  res.json({ success: true, message: "App desativado com sucesso" });
});

// Página de controle com visual Pterodactyl
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 Servidor de controle rodando na porta ${port}`);
  console.log(`📊 Status inicial: ${appStatus.active ? 'ATIVO' : 'DESATIVADO'}`);
});

