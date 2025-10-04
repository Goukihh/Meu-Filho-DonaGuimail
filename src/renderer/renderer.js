let accounts = [];
let currentContextMenuAccountId = null;
let modalMode = 'add'; // 'add' ou 'edit'
let editingAccountId = null;

// Elementos DOM
const avatarTabsContainer = document.getElementById('avatar-tabs');
const addAccountBtn = document.getElementById('add-account-btn');
const addAccountModal = document.getElementById('add-account-modal');
const accountNameInput = document.getElementById('account-name');
const confirmAddBtn = document.getElementById('confirm-add-btn');
const cancelAddBtn = document.getElementById('cancel-add-btn');
const closeModalBtn = document.querySelector('.close');
const contextMenu = document.getElementById('context-menu');

// Inicializar
async function init() {
    console.log('🚀 Iniciando aplicação...');
    
    // Carregar contas primeiro (sequencial)
    console.log('📖 Carregando contas...');
    accounts = await window.electron.invoke('get-accounts');
    console.log('📋 Contas carregadas:', accounts.length);
    
    // Tela de carregamento falsa - fade out elegante após 3 segundos
    setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
            console.log('✅ Tela de carregamento removida');
        }
        console.log('🎨 Renderizando contas após loading...');
        // Garantir que as contas sejam exibidas após o loading terminar
        renderAccounts();
        console.log('✅ Contas renderizadas com sucesso');
    }, 3000);
    
    // Trocar para a conta ativa
    const activeAccount = accounts.find(acc => acc.active);
    if (activeAccount) {
        await window.electron.invoke('switch-account', activeAccount.id);
    }
}

// Renderizar contas
function renderAccounts() {
    try {
        console.log('🎨 Função renderAccounts iniciada');
        console.log('📋 Contas para renderizar:', accounts.length);
        
        if (!avatarTabsContainer) {
            console.error('❌ Container de abas não encontrado');
            return;
        }
        
        // Limpar área antes de adicionar novas abas
        avatarTabsContainer.innerHTML = '';
        console.log('🧹 Container limpo');
        
        if (accounts.length === 0) {
            console.log('⚠️ Nenhuma conta para renderizar');
            return;
        }
        
        accounts.forEach((account, index) => {
            console.log(`🔧 Criando aba ${index + 1}/${accounts.length} para: ${account.name}`);
            const tabElement = createAccountTab(account);
            if (tabElement) {
                avatarTabsContainer.appendChild(tabElement);
                console.log(`✅ Aba criada para: ${account.name}`);
            } else {
                console.error(`❌ Falha ao criar aba para: ${account.name}`);
            }
        });
        
        console.log(`✅ Renderização concluída: ${avatarTabsContainer.children.length} abas criadas`);
    } catch (error) {
        console.error('❌ Erro na renderização de contas:', error);
    }
}

// Criar elemento de aba de conta
function createAccountTab(account) {
    try {
        console.log(`🔧 Criando aba para: ${account.name} (ID: ${account.id})`);
        
        if (!account || !account.id || !account.name) {
            console.error('❌ Dados da conta inválidos:', account);
            return null;
        }
        
        const tab = document.createElement('div');
        tab.className = `avatar-tab ${account.active ? 'active' : ''}`;
        tab.dataset.accountId = account.id;
    
        // Círculo do avatar
        const avatarCircle = document.createElement('div');
        avatarCircle.className = 'avatar-circle';
        
        if (account.profilePicture) {
            // Adicionar cache para melhor performance
            const img = new Image();
            img.onload = () => {
                avatarCircle.style.backgroundImage = `url(${account.profilePicture})`;
                avatarCircle.style.backgroundSize = 'cover';
                avatarCircle.style.backgroundPosition = 'center';
                avatarCircle.style.backgroundRepeat = 'no-repeat';
            };
            img.src = account.profilePicture;
        } else {
            // Placeholder com primeira letra do nome
            avatarCircle.textContent = account.name.charAt(0).toUpperCase();
            avatarCircle.style.display = 'flex';
            avatarCircle.style.alignItems = 'center';
            avatarCircle.style.justifyContent = 'center';
            avatarCircle.style.color = '#ffffff';
            avatarCircle.style.fontWeight = '600';
            avatarCircle.style.fontSize = '18px';
        }
        
        // Nome da conta
        const accountName = document.createElement('div');
        accountName.className = 'account-name';
        accountName.textContent = account.name;
        
        // Indicador de status
        const statusIndicator = document.createElement('div');
        statusIndicator.className = 'status-indicator';
    
        // Montar estrutura
        tab.appendChild(avatarCircle);
        tab.appendChild(accountName);
        tab.appendChild(statusIndicator);
        
        // Event listeners
        tab.addEventListener('click', () => handleAccountClick(account.id));
        tab.addEventListener('contextmenu', (e) => handleAccountContextMenu(e, account.id));
        
        console.log(`✅ Aba criada com sucesso para: ${account.name}`);
        return tab;
    } catch (error) {
        console.error(`❌ Erro ao criar aba para ${account.name}:`, error);
        return null;
    }
}

// Manipular clique em conta
async function handleAccountClick(accountId) {
    // Atualizar estado ativo
    accounts = await window.electron.invoke('set-active-account', accountId);
    renderAccounts();
    
    // Trocar para a BrowserView da conta
    await window.electron.invoke('switch-account', accountId);
}

// Manipular menu de contexto
function handleAccountContextMenu(e, accountId) {
    e.preventDefault();
    currentContextMenuAccountId = accountId;
    
    // Comunicar com o processo principal para esconder a BrowserView
    window.electron.send('context-menu-open');
    
    // Posicionar menu de contexto
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.classList.add('show');
}

// Adicionar conta
addAccountBtn.addEventListener('click', () => {
    console.log(`➕ Iniciando adição de nova conta`);
    
    // FECHAR COMPLETAMENTE a BrowserView para evitar sobreposição
    console.log(`➕ Fechando BrowserView para adição de nova conta`);
    window.electron.send('close-browser-view-for-add');
    
    // Usar aba dedicada para adicionar conta
    const addAccountTab = document.getElementById('add-account-tab');
    const addAccountInput = document.getElementById('add-account-name');
    
    if (!addAccountTab) {
        console.error(`❌ Aba de adicionar conta não encontrada`);
        return;
    }
    
    if (!addAccountInput) {
        console.error(`❌ Input de adicionar conta não encontrado`);
        return;
    }
    
    addAccountTab.classList.add('show');
    addAccountInput.value = '';
    addAccountInput.focus();
    console.log(`➕ Aba de adicionar conta exibida`);
});

// Confirmar ação do modal
confirmAddBtn.addEventListener('click', async () => {
    const accountName = accountNameInput.value.trim();
    if (!accountName) {
        alert('Por favor, insira um nome para a conta.');
        return;
    }
    
    if (modalMode === 'add') {
        // Modo adicionar - criar nova conta
        console.log(`➕ Criando nova conta: ${accountName}`);
        accounts = await window.electron.invoke('add-account', { name: accountName });
        renderAccounts();
        addAccountModal.classList.remove('show');
        window.electron.send('show-browser-view');
        console.log(`✅ Nova conta criada com sucesso`);
    } else if (modalMode === 'edit') {
        // Modo editar - renomear conta existente
        console.log(`📝 Renomeando conta ${editingAccountId} para: ${accountName}`);
        window.electron.send('execute-rename', { accountId: editingAccountId, newName: accountName });
        addAccountModal.classList.remove('show');
        // Restaurar BrowserView após fechar modal de renomeação
        window.electron.send('context-menu-closed');
        console.log(`✅ Renomeação concluída, BrowserView será restaurada`);
    }
});

// Cancelar ação do modal
cancelAddBtn.addEventListener('click', () => {
    console.log(`❌ Cancelando ação do modal (modo: ${modalMode})`);
    addAccountModal.classList.remove('show');
    if (modalMode === 'add') {
        window.electron.send('show-browser-view');
        console.log(`✅ Cancelamento de adição - BrowserView restaurada`);
    } else if (modalMode === 'edit') {
        // Restaurar BrowserView após cancelar renomeação
        window.electron.send('context-menu-closed');
        console.log(`✅ Cancelamento de renomeação - BrowserView será restaurada`);
    }
});

closeModalBtn.addEventListener('click', () => {
    console.log(`❌ Fechando modal (X) - modo: ${modalMode}`);
    addAccountModal.classList.remove('show');
    if (modalMode === 'add') {
        window.electron.send('show-browser-view');
        console.log(`✅ Modal fechado (X) - BrowserView restaurada`);
    } else if (modalMode === 'edit') {
        // Restaurar BrowserView após fechar renomeação
        window.electron.send('context-menu-closed');
        console.log(`✅ Modal fechado (X) - BrowserView será restaurada`);
    }
    // Restaurar modal para adicionar conta
    restoreAddAccountModal();
});

// Fechar modal ao clicar fora
addAccountModal.addEventListener('click', (e) => {
    if (e.target === addAccountModal) {
        console.log(`❌ Fechando modal (clicar fora) - modo: ${modalMode}`);
        addAccountModal.classList.remove('show');
        if (modalMode === 'add') {
            window.electron.send('show-browser-view');
            console.log(`✅ Modal fechado (fora) - BrowserView restaurada`);
        } else if (modalMode === 'edit') {
            // Restaurar BrowserView após fechar renomeação
            window.electron.send('context-menu-closed');
            console.log(`✅ Modal fechado (fora) - BrowserView será restaurada`);
        }
    }
});

// Permitir Enter para confirmar
accountNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        confirmAddBtn.click();
    }
});

// Event listeners para aba de renomeação
const renameTab = document.getElementById('rename-tab');
const renameInput = document.getElementById('rename-account-name');
const confirmRenameBtn = document.getElementById('confirm-rename-btn');
const cancelRenameBtn = document.getElementById('cancel-rename-btn');
const closeRenameBtn = document.getElementById('close-rename-tab');

// Confirmar renomeação
confirmRenameBtn.addEventListener('click', () => {
    console.log(`🔧 Botão de renomear clicado`);
    const newName = renameInput.value.trim();
    console.log(`📝 Nome digitado: "${newName}"`);
    console.log(`📝 ID da conta: ${editingAccountId}`);
    
    if (!newName) {
        alert('Por favor, insira um nome para a conta.');
        return;
    }
    
    if (!editingAccountId) {
        console.error(`❌ ID da conta não encontrado: ${editingAccountId}`);
        alert('Erro: ID da conta não encontrado.');
        return;
    }
    
    console.log(`📝 Enviando renomeação: conta ${editingAccountId} para: ${newName}`);
    window.electron.send('execute-rename', { 
        accountId: editingAccountId, 
        newName: newName
    });
    renameTab.classList.remove('show');
    // Restaurar BrowserView após fechar aba de renomeação
    window.electron.send('context-menu-closed');
    console.log(`✅ Renomeação concluída, BrowserView será restaurada`);
});

// Cancelar renomeação
cancelRenameBtn.addEventListener('click', () => {
    console.log(`❌ Cancelando renomeação`);
    renameTab.classList.remove('show');
    // Restaurar BrowserView após cancelar renomeação
    window.electron.send('context-menu-closed');
    console.log(`✅ Cancelamento de renomeação - BrowserView será restaurada`);
});

// Fechar aba de renomeação (X)
closeRenameBtn.addEventListener('click', () => {
    console.log(`❌ Fechando aba de renomeação (X)`);
    renameTab.classList.remove('show');
    // Restaurar BrowserView após fechar renomeação
    window.electron.send('context-menu-closed');
    console.log(`✅ Aba de renomeação fechada (X) - BrowserView será restaurada`);
});

// Fechar aba de renomeação ao clicar fora
renameTab.addEventListener('click', (e) => {
    if (e.target === renameTab) {
        console.log(`❌ Fechando aba de renomeação (clicar fora)`);
        renameTab.classList.remove('show');
        // Restaurar BrowserView após fechar renomeação
        window.electron.send('context-menu-closed');
        console.log(`✅ Aba de renomeação fechada (fora) - BrowserView será restaurada`);
    }
});

// Permitir Enter para confirmar renomeação
renameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        console.log(`⌨️ Enter pressionado para confirmar renomeação`);
        confirmRenameBtn.click();
    }
});

// Event listeners para aba de adicionar conta
const addAccountTab = document.getElementById('add-account-tab');
const addAccountInput = document.getElementById('add-account-name');
const confirmAddAccountBtn = document.getElementById('confirm-add-account-btn');
const cancelAddAccountBtn = document.getElementById('cancel-add-account-btn');
const closeAddAccountBtn = document.getElementById('close-add-account-tab');

// Confirmar adição de conta
confirmAddAccountBtn.addEventListener('click', async () => {
    console.log(`🔧 Botão de adicionar conta clicado`);
    const accountName = addAccountInput.value.trim();
    console.log(`➕ Nome digitado: "${accountName}"`);

    if (!accountName) {
        alert('Por favor, insira um nome para a conta.');
        return;
    }

    console.log(`➕ Enviando adição de conta: ${accountName}`);
    accounts = await window.electron.invoke('add-account', { 
        name: accountName
    });
    renderAccounts();
    addAccountTab.classList.remove('show');
    // Restaurar BrowserView após fechar aba de adicionar conta
    window.electron.send('context-menu-closed');
    console.log(`✅ Nova conta criada com sucesso, BrowserView será restaurada`);
});

// Cancelar adição de conta
cancelAddAccountBtn.addEventListener('click', () => {
    console.log(`❌ Cancelando adição de conta`);
    addAccountTab.classList.remove('show');
    // Restaurar BrowserView após cancelar adição de conta
    window.electron.send('context-menu-closed');
    console.log(`✅ Cancelamento de adição de conta, BrowserView será restaurada`);
});

// Fechar aba de adicionar conta (X)
closeAddAccountBtn.addEventListener('click', () => {
    console.log(`❌ Fechando aba de adicionar conta (X)`);
    addAccountTab.classList.remove('show');
    // Restaurar BrowserView após fechar aba de adicionar conta
    window.electron.send('context-menu-closed');
    console.log(`✅ Aba de adicionar conta fechada (X), BrowserView será restaurada`);
});

// Fechar aba de adicionar conta ao clicar fora
addAccountTab.addEventListener('click', (e) => {
    if (e.target === addAccountTab) {
        console.log(`❌ Fechando aba de adicionar conta (clicar fora)`);
        addAccountTab.classList.remove('show');
        // Restaurar BrowserView após fechar aba de adicionar conta
        window.electron.send('context-menu-closed');
        console.log(`✅ Aba de adicionar conta fechada (fora), BrowserView será restaurada`);
    }
});

// Permitir Enter para confirmar adição de conta
addAccountInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        console.log(`⌨️ Enter pressionado para confirmar adição de conta`);
        confirmAddAccountBtn.click();
    }
});

// Menu de contexto - ações
contextMenu.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action || !currentContextMenuAccountId) return;
    
    const accountId = currentContextMenuAccountId;
    
    console.log(`[Renderer] Tentando enviar a ação: ${action} para a conta ${accountId}`);
    
    // Enviar ação para o processo principal via IPC
    window.electron.send('context-menu-action', { action, accountId });
    
    contextMenu.classList.remove('show');
    currentContextMenuAccountId = null;
    
    // Comunicar com o processo principal para restaurar a BrowserView
    window.electron.send('context-menu-closed');
});

// Fechar menu de contexto ao clicar fora
document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
        contextMenu.classList.remove('show');
        // Comunicar com o processo principal para restaurar a BrowserView
        window.electron.send('context-menu-closed');
    }
});

// Listeners para eventos do main process
window.electron.on('profile-picture-updated', (accountId, profilePictureUrl) => {
    const account = accounts.find(acc => acc.id === accountId);
    if (account) {
        account.profilePicture = profilePictureUrl;
        renderAccounts();
    }
});

window.electron.on('accounts-updated', async () => {
    accounts = await window.electron.invoke('get-accounts');
    renderAccounts();
});

// Listener para atualização de foto de perfil
window.electron.on('profile-picture-updated', (accountId, avatarUrl) => {
    console.log(`🖼️ Foto de perfil atualizada para ${accountId}: ${avatarUrl}`);
    // Re-renderizar contas para mostrar nova foto
    renderAccounts();
});

// Listener para solicitar renomeação
window.electron.on('prompt-for-rename', (accountId) => {
    console.log(`📝 Iniciando renomeação para conta ${accountId}`);
    editingAccountId = accountId;
    console.log(`📝 ID da conta definido: ${editingAccountId}`);
    
    // Usar aba dedicada para renomeação
    const renameTab = document.getElementById('rename-tab');
    const renameInput = document.getElementById('rename-account-name');
    
    if (!renameTab) {
        console.error(`❌ Aba de renomeação não encontrada`);
        return;
    }
    
    if (!renameInput) {
        console.error(`❌ Input de renomeação não encontrado`);
        return;
    }
    
    renameTab.classList.add('show');
    renameInput.value = '';
    renameInput.focus();
    console.log(`📝 Aba de renomeação exibida para conta ${accountId}`);
});

// Função para configurar modal para adicionar
function setupModalForAdd() {
    const modalHeader = addAccountModal.querySelector('.modal-header h2');
    const modalLabel = addAccountModal.querySelector('.modal-body label');
    const modalInput = document.getElementById('account-name');
    const confirmBtn = document.getElementById('confirm-add-btn');
    
    // Configurar textos para adicionar
    modalHeader.textContent = 'Adicionar Nova Conta';
    modalLabel.textContent = 'Nome da Conta:';
    modalInput.placeholder = 'Ex: Conta Principal';
    confirmBtn.textContent = 'Adicionar';
}

// Função para configurar modal para editar
function setupModalForEdit() {
    const modalHeader = addAccountModal.querySelector('.modal-header h2');
    const modalLabel = addAccountModal.querySelector('.modal-body label');
    const modalInput = document.getElementById('account-name');
    const confirmBtn = document.getElementById('confirm-add-btn');
    
    // Configurar textos para editar
    modalHeader.textContent = 'Renomear Conta';
    modalLabel.textContent = 'Novo Nome da Conta:';
    modalInput.placeholder = 'Digite o novo nome...';
    confirmBtn.textContent = 'Renomear';
}

// Função para restaurar modal de adicionar conta
function restoreAddAccountModal() {
    setupModalForAdd();
}

// Inicializar aplicativo
init();
