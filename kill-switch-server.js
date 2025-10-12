const express = require('express');
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

// Página de controle simples
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Controle Meu Filho</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .status { padding: 20px; border-radius: 8px; margin: 20px 0; }
            .active { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
            .inactive { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
            button { padding: 12px 24px; margin: 10px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
            .activate { background: #28a745; color: white; }
            .deactivate { background: #dc3545; color: white; }
            .info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; padding: 15px; border-radius: 4px; }
        </style>
    </head>
    <body>
        <h1>🎮 Controle Meu Filho</h1>
        
        <div id="status" class="status">
            <h3>Status Atual: <span id="statusText">Carregando...</span></h3>
            <p id="statusMessage">Verificando status...</p>
            <p><small>Última atualização: <span id="lastUpdate">-</span></small></p>
        </div>
        
        <div class="info">
            <h4>📋 Como usar:</h4>
            <ul>
                <li><strong>Verde:</strong> App funcionando normalmente</li>
                <li><strong>Vermelho:</strong> App desativado - todas as instâncias serão encerradas</li>
                <li><strong>Ativar:</strong> Permite que o app funcione novamente</li>
                <li><strong>Desativar:</strong> Encerra TODAS as instâncias do app</li>
            </ul>
        </div>
        
        <div>
            <button class="activate" onclick="activateApp()">✅ ATIVAR APP</button>
            <button class="deactivate" onclick="deactivateApp()">❌ DESATIVAR APP</button>
        </div>
        
        <script>
            async function checkStatus() {
                try {
                    const response = await fetch('/api/status');
                    const data = await response.json();
                    
                    const statusDiv = document.getElementById('status');
                    const statusText = document.getElementById('statusText');
                    const statusMessage = document.getElementById('statusMessage');
                    const lastUpdate = document.getElementById('lastUpdate');
                    
                    if (data.active) {
                        statusDiv.className = 'status active';
                        statusText.textContent = 'ATIVO';
                        statusMessage.textContent = data.message;
                    } else {
                        statusDiv.className = 'status inactive';
                        statusText.textContent = 'DESATIVADO';
                        statusMessage.textContent = data.message;
                    }
                    
                    lastUpdate.textContent = new Date(data.timestamp).toLocaleString('pt-BR');
                } catch (error) {
                    console.error('Erro ao verificar status:', error);
                }
            }
            
            async function activateApp() {
                try {
                    const response = await fetch('/api/activate', { method: 'POST' });
                    const data = await response.json();
                    alert(data.message);
                    checkStatus();
                } catch (error) {
                    alert('Erro ao ativar app: ' + error.message);
                }
            }
            
            async function deactivateApp() {
                if (confirm('⚠️ ATENÇÃO: Isso irá desativar TODAS as instâncias do app!\n\nTem certeza?')) {
                    try {
                        const response = await fetch('/api/deactivate', { method: 'POST' });
                        const data = await response.json();
                        alert(data.message);
                        checkStatus();
                    } catch (error) {
                        alert('Erro ao desativar app: ' + error.message);
                    }
                }
            }
            
            // Verificar status a cada 5 segundos
            checkStatus();
            setInterval(checkStatus, 5000);
        </script>
    </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`🚀 Servidor de controle rodando na porta ${port}`);
  console.log(`📊 Status inicial: ${appStatus.active ? 'ATIVO' : 'DESATIVADO'}`);
});
