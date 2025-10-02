const { ipcRenderer } = require('electron');

let accounts = [];
let currentContextMenuAccountId = null;

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
    accounts = await ipcRenderer.invoke('get-accounts');
    renderAccounts();
    
    // Trocar para a conta ativa
    const activeAccount = accounts.find(acc => acc.active);
    if (activeAccount) {
        await ipcRenderer.invoke('switch-account', activeAccount.id);
    }
}

// Renderizar contas
function renderAccounts() {
    avatarTabsContainer.innerHTML = '';
    
    accounts.forEach(account => {
        const tabElement = createAccountTab(account);
        avatarTabsContainer.appendChild(tabElement);
    });
}

// Criar elemento de aba de conta
function createAccountTab(account) {
    const tab = document.createElement('div');
    tab.className = `avatar-tab ${account.active ? 'active' : ''}`;
    tab.dataset.accountId = account.id;
    
    const avatarWrapper = document.createElement('div');
    avatarWrapper.className = 'avatar-wrapper';
    
    if (account.profilePicture) {
        const avatarImg = document.createElement('img');
        avatarImg.className = 'avatar-img';
        avatarImg.src = account.profilePicture;
        avatarWrapper.appendChild(avatarImg);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'avatar-placeholder';
        placeholder.textContent = account.name.charAt(0).toUpperCase();
        avatarWrapper.appendChild(placeholder);
    }
    
    const status = document.createElement('div');
    status.className = 'avatar-status';
    
    const name = document.createElement('div');
    name.className = 'avatar-name';
    name.textContent = account.name;
    
    tab.appendChild(avatarWrapper);
    tab.appendChild(status);
    tab.appendChild(name);
    
    // Event listeners
    tab.addEventListener('click', () => handleAccountClick(account.id));
    tab.addEventListener('contextmenu', (e) => handleAccountContextMenu(e, account.id));
    
    return tab;
}

// Manipular clique em conta
async function handleAccountClick(accountId) {
    // Atualizar estado ativo
    accounts = await ipcRenderer.invoke('set-active-account', accountId);
    renderAccounts();
    
    // Trocar para a BrowserView da conta
    await ipcRenderer.invoke('switch-account', accountId);
}

// Manipular menu de contexto
function handleAccountContextMenu(e, accountId) {
    e.preventDefault();
    currentContextMenuAccountId = accountId;
    
    // Posicionar menu de contexto
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.classList.add('show');
}

// Adicionar conta
addAccountBtn.addEventListener('click', () => {
    addAccountModal.classList.add('show');
    accountNameInput.value = '';
    accountNameInput.focus();
    ipcRenderer.send('hide-browser-view');
});

// Confirmar adição de conta
confirmAddBtn.addEventListener('click', async () => {
    const accountName = accountNameInput.value.trim();
    if (!accountName) {
        alert('Por favor, insira um nome para a conta.');
        return;
    }
    
    accounts = await ipcRenderer.invoke('add-account', { name: accountName });
    renderAccounts();
    addAccountModal.classList.remove('show');
    ipcRenderer.send('show-browser-view');
});

// Cancelar adição de conta
cancelAddBtn.addEventListener('click', () => {
    addAccountModal.classList.remove('show');
    ipcRenderer.send('show-browser-view');
});

closeModalBtn.addEventListener('click', () => {
    addAccountModal.classList.remove('show');
    ipcRenderer.send('show-browser-view');
});

// Fechar modal ao clicar fora
addAccountModal.addEventListener('click', (e) => {
    if (e.target === addAccountModal) {
        addAccountModal.classList.remove('show');
        ipcRenderer.send('show-browser-view');
    }
});

// Permitir Enter para confirmar
accountNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        confirmAddBtn.click();
    }
});

// Menu de contexto - ações
contextMenu.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action || !currentContextMenuAccountId) return;
    
    const accountId = currentContextMenuAccountId;
    
    switch (action) {
        case 'rename':
            const newName = prompt('Novo nome da conta:');
            if (newName && newName.trim()) {
                accounts = await ipcRenderer.invoke('update-account', accountId, { name: newName.trim() });
                renderAccounts();
            }
            break;
        
        case 'clear-session':
            if (confirm('Tem certeza que deseja limpar os dados da sessão? Você precisará fazer login novamente.')) {
                await ipcRenderer.invoke('clear-session', accountId);
            }
            break;
        
        case 'reload':
            await ipcRenderer.invoke('reload-account', accountId);
            break;
        
        case 'remove':
            if (confirm('Tem certeza que deseja remover esta conta?')) {
                accounts = await ipcRenderer.invoke('remove-account', accountId);
                renderAccounts();
                
                // Se havia apenas uma conta ou a conta ativa foi removida, trocar para outra
                if (accounts.length > 0) {
                    const firstAccount = accounts[0];
                    await handleAccountClick(firstAccount.id);
                }
            }
            break;
    }
    
    contextMenu.classList.remove('show');
    currentContextMenuAccountId = null;
});

// Fechar menu de contexto ao clicar fora
document.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
        contextMenu.classList.remove('show');
    }
});

// Listeners para eventos do main process
ipcRenderer.on('account-ready', (event, accountId) => {
    updateAccountStatus(accountId, 'ready');
});

ipcRenderer.on('account-loaded', (event, accountId) => {
    updateAccountStatus(accountId, 'loaded');
});

ipcRenderer.on('account-loading', (event, accountId) => {
    updateAccountStatus(accountId, 'loading');
});

ipcRenderer.on('account-error', (event, accountId, error) => {
    updateAccountStatus(accountId, 'error');
    console.error(`Erro na conta ${accountId}:`, error);
});

ipcRenderer.on('profile-picture-updated', (event, accountId, profilePictureUrl) => {
    const account = accounts.find(acc => acc.id === accountId);
    if (account) {
        account.profilePicture = profilePictureUrl;
        renderAccounts();
    }
});

// Atualizar status visual da conta
function updateAccountStatus(accountId, status) {
    const tab = document.querySelector(`[data-account-id="${accountId}"]`);
    if (!tab) return;
    
    const statusElement = tab.querySelector('.avatar-status');
    if (!statusElement) return;
    
    statusElement.classList.remove('loading', 'error');
    
    if (status === 'loading') {
        statusElement.classList.add('loading');
    } else if (status === 'error') {
        statusElement.classList.add('error');
    }
}

// Inicializar aplicativo
init();
