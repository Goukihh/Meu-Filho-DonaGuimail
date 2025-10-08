let accounts = [];
let currentContextMenuAccountId = null;
let modalMode = 'add'; // 'add' ou 'edit'
let editingAccountId = null;

// Sistema de paginação responsivo
let currentPage = 0;
let ACCOUNTS_PER_PAGE = 20; // Será ajustado dinamicamente baseado na resolução

// Cache de performance
const avatarCache = new Map();
const sessionCache = new Map();
const imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            const accountId = img.dataset.accountId;
            const account = accounts.find(acc => acc.id === accountId);
            
            if (account && account.avatar && !avatarCache.has(accountId)) {
                // Carregar avatar apenas quando visível
                img.src = account.avatar;
                avatarCache.set(accountId, account.avatar);
            }
        }
    });
}, { rootMargin: '50px' });

// Elementos DOM
const avatarTabsContainer = document.getElementById('avatar-tabs');
const addAccountBtn = document.getElementById('add-account-btn');
const addAccountModal = document.getElementById('add-account-modal');
const accountNameInput = document.getElementById('account-name');
const confirmAddBtn = document.getElementById('confirm-add-btn');
const cancelAddBtn = document.getElementById('cancel-add-btn');
const closeModalBtn = document.querySelector('.close');
const contextMenu = document.getElementById('context-menu');

// Elementos de verificação de atualizações
const checkUpdatesBtn = document.getElementById('check-updates-btn');
const updateTab = document.getElementById('update-tab');
const closeUpdateTab = document.getElementById('close-update-tab');
const cancelUpdateTabBtn = document.getElementById('cancel-update-tab-btn');
const downloadUpdateTabBtn = document.getElementById('download-update-tab-btn');

// Elementos de paginação
const prevPageBtn = document.getElementById('prev-page-btn');
const nextPageBtn = document.getElementById('next-page-btn');

// Inicializar controles da barra de título
function initTitleBar() {
    const minimizeBtn = document.getElementById('minimize-btn');
    const maximizeBtn = document.getElementById('maximize-btn');
    const closeBtn = document.getElementById('close-btn');

    if (minimizeBtn) {
        minimizeBtn.addEventListener('click', async () => {
            await window.electron.window.minimize();
        });
    }

    if (maximizeBtn) {
        maximizeBtn.addEventListener('click', async () => {
            await window.electron.window.maximize();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', async () => {
            await window.electron.window.close();
        });
    }

    // Atualizar ícone do botão maximizar baseado no estado da janela
    const updateMaximizeIcon = async () => {
        if (maximizeBtn) {
            const isMaximized = await window.electron.window.isMaximized();
            const svg = maximizeBtn.querySelector('svg');
            if (svg) {
                if (isMaximized) {
                    // Ícone de restaurar (dois quadrados sobrepostos)
                    svg.innerHTML = '<rect x="2" y="2" width="4" height="4" stroke="currentColor" stroke-width="1" fill="none"/><rect x="4" y="4" width="4" height="4" stroke="currentColor" stroke-width="1" fill="none"/>';
                } else {
                    // Ícone de maximizar (quadrado simples)
                    svg.innerHTML = '<rect x="2" y="2" width="6" height="6" stroke="currentColor" stroke-width="1" fill="none"/>';
                }
            }
        }
    };

    // Atualizar ícone quando a janela mudar de estado
    window.addEventListener('resize', updateMaximizeIcon);
    updateMaximizeIcon();
    
    // Recalcular contas por página quando a janela for redimensionada
    let resizeTimeout;
    window.addEventListener('resize', () => {
        // Debounce para evitar recálculos excessivos
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            console.log('🔄 Janela redimensionada - recalculando layout');
            calculateAccountsPerPage();
            currentPage = 0; // Voltar para primeira página
            renderAccounts();
        }, 150);
    });
}

// Calcular número de contas por página baseado na resolução
function calculateAccountsPerPage() {
    const screenWidth = window.innerWidth;
    
    // Para 1920x1080, forçar exatamente 20 contas por página
    if (screenWidth >= 1920) {
        ACCOUNTS_PER_PAGE = 20;
        console.log(`📱 Resolução 1920x1080+ detectada - Contas por página: ${ACCOUNTS_PER_PAGE}`);
        return;
    }
    
    // Para outras resoluções, calcular dinamicamente
    let tabWidth = 75;
    let gap = 12;
    let padding = 64;
    let navArrows = 120;
    
    // Ajustes responsivos baseados na largura da tela
    if (screenWidth >= 1600) {
        tabWidth = 72;
        gap = 10;
        padding = 60;
        navArrows = 110;
    } else if (screenWidth >= 1400) {
        tabWidth = 70;
        gap = 8;
        padding = 56;
        navArrows = 100;
    } else if (screenWidth >= 1200) {
        tabWidth = 68;
        gap = 6;
        padding = 52;
        navArrows = 90;
    } else if (screenWidth >= 1000) {
        tabWidth = 65;
        gap = 5;
        padding = 48;
        navArrows = 80;
    } else {
        tabWidth = 60;
        gap = 4;
        padding = 44;
        navArrows = 70;
    }
    
    const availableWidth = screenWidth - padding - navArrows;
    const maxTabs = Math.floor(availableWidth / (tabWidth + gap));
    
    // Limitar entre 3 e 25 contas por página (máximo 25 para não sobrecarregar)
    ACCOUNTS_PER_PAGE = Math.max(3, Math.min(25, maxTabs));
    
    console.log(`📱 Resolução: ${screenWidth}px - Largura disponível: ${availableWidth}px - Largura da aba: ${tabWidth}px - Gap: ${gap}px - Contas por página: ${ACCOUNTS_PER_PAGE}`);
}

// ========================================
// FUNCIONALIDADES DE DRAG AND DROP
// ========================================

// Variáveis globais para drag and drop
let draggedElement = null;
let dragStartIndex = -1;

// Configurar drag and drop para uma aba
function setupDragAndDrop(tab) {
    // Evento de início do drag
    tab.addEventListener('dragstart', (e) => {
        draggedElement = tab;
        dragStartIndex = Array.from(avatarTabsContainer.children).indexOf(tab);
        tab.classList.add('dragging');
        
        // Som de início do drag
        if (window.audioManager) {
            window.audioManager.playClick();
        }
        
        console.log(`🔄 Iniciando drag da conta: ${tab.dataset.accountId}`);
    });
    
    // Evento de fim do drag
    tab.addEventListener('dragend', (e) => {
        tab.classList.remove('dragging');
        
        // Remover todas as classes de drag
        document.querySelectorAll('.avatar-tab').forEach(t => {
            t.classList.remove('drag-over', 'drag-placeholder');
        });
        
        draggedElement = null;
        dragStartIndex = -1;
        
        console.log(`✅ Drag finalizado`);
    });
    
    // Evento quando entra em uma área de drop
    tab.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (tab !== draggedElement) {
            tab.classList.add('drag-over');
        }
    });
    
    // Evento quando sai de uma área de drop
    tab.addEventListener('dragleave', (e) => {
        if (!tab.contains(e.relatedTarget)) {
            tab.classList.remove('drag-over');
        }
    });
    
    // Evento de drag sobre uma área de drop
    tab.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (tab !== draggedElement) {
            tab.classList.add('drag-over');
        }
    });
    
    // Evento de drop
    tab.addEventListener('drop', async (e) => {
        e.preventDefault();
        tab.classList.remove('drag-over');
        
        if (draggedElement && draggedElement !== tab) {
            const dropIndex = Array.from(avatarTabsContainer.children).indexOf(tab);
            
            console.log(`🎯 Drop realizado: de ${dragStartIndex} para ${dropIndex}`);
            
            // Reordenar contas no array
            await reorderAccounts(dragStartIndex, dropIndex);
            
            // Som de sucesso
            if (window.audioManager) {
                window.audioManager.playSuccess();
            }
        }
    });
}

// Reordenar contas
async function reorderAccounts(fromIndex, toIndex) {
    try {
        console.log(`🔄 Reordenando contas: ${fromIndex} → ${toIndex}`);
        
        // Calcular índices reais no array de contas
        const startIndex = currentPage * ACCOUNTS_PER_PAGE;
        const realFromIndex = startIndex + fromIndex;
        const realToIndex = startIndex + toIndex;
        
        // Verificar se os índices são válidos
        if (realFromIndex < 0 || realFromIndex >= accounts.length || 
            realToIndex < 0 || realToIndex >= accounts.length) {
            console.error('❌ Índices inválidos para reordenação');
            return;
        }
        
        // Mover conta no array
        const [movedAccount] = accounts.splice(realFromIndex, 1);
        accounts.splice(realToIndex, 0, movedAccount);
        
        // Salvar nova ordem no backend
        const result = await window.electron.invoke('reorder-accounts', {
            fromIndex: realFromIndex,
            toIndex: realToIndex
        });
        
        if (result.success) {
            console.log('✅ Contas reordenadas com sucesso');
            // Re-renderizar apenas a página atual
            renderAccounts();
        } else {
            console.error('❌ Erro ao reordenar contas:', result.message);
            showNotification('Erro ao reordenar contas', 'error');
        }
    } catch (error) {
        console.error('❌ Erro na reordenação:', error);
        showNotification('Erro ao reordenar contas', 'error');
    }
}

// Inicializar
async function init() {
    console.log('🚀 Iniciando aplicação...');
    
    // Calcular contas por página baseado na resolução
    calculateAccountsPerPage();
    
    // Inicializar barra de título personalizada
    initTitleBar();
    
    // Carregar contas primeiro (sequencial)
    console.log('📖 Carregando contas...');
    accounts = await window.electron.invoke('get-accounts');
    console.log('📋 Contas carregadas:', accounts.length);
    
    // Carregar fundo personalizado
    await loadCustomBackground();
    
    // Carregar cores personalizadas
    await loadCustomColors();
    
    // Tela de carregamento falsa - fade out elegante após 3 segundos
    setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
            console.log('✅ Tela de carregamento removida');
            // Som de inicialização elegante
            if (window.audioManager) {
                window.audioManager.playSuccess();
            }
        }
        console.log('🎨 Renderizando contas após loading...');
        // Garantir que as contas sejam exibidas após o loading terminar
        renderAccounts();
        console.log('✅ Contas renderizadas com sucesso');
    }, 3000);
    
    // Listener para remover loading quando view carregar
    window.electron.on('view-loaded', () => {
        console.log('✅ BrowserView carregada - removendo loading');
        const loadingTabs = document.querySelectorAll('.avatar-tab.loading');
        loadingTabs.forEach(tab => tab.classList.remove('loading'));
    });
}


// Renderizar contas com paginação
function renderAccounts() {
  try {
    console.log('🎨 Função renderAccounts iniciada');
    console.log('📋 Contas para renderizar:', accounts.length);
    console.log('📄 Página atual:', currentPage);
    
    if (!avatarTabsContainer) {
      console.error('❌ Container de abas não encontrado');
      return;
    }
    
    // Usar DocumentFragment para melhor performance
    const fragment = document.createDocumentFragment();
    
    // Limpar área antes de adicionar novas abas
    avatarTabsContainer.innerHTML = '';
    console.log('🧹 Container limpo');
        
        if (accounts.length === 0) {
            console.log('⚠️ Nenhuma conta para renderizar');
            updateNavigationButtons();
            return;
        }
        
        // Verificar se precisamos recalcular o número de contas por página
        if (accounts.length > ACCOUNTS_PER_PAGE * 2) {
            console.log('🔄 Muitas contas detectadas - recalculando layout');
            calculateAccountsPerPage();
        }
        
        // Calcular índices da página atual
        const startIndex = currentPage * ACCOUNTS_PER_PAGE;
        const endIndex = Math.min(startIndex + ACCOUNTS_PER_PAGE, accounts.length);
        const accountsToShow = accounts.slice(startIndex, endIndex);
        
        console.log(`📊 Mostrando contas ${startIndex + 1}-${endIndex} de ${accounts.length}`);
        
        // Atualizar estado dos botões de navegação
        updateNavigationButtons();
        
        accountsToShow.forEach((account, index) => {
            console.log(`🔧 Criando aba ${index + 1}/${accountsToShow.length} para: ${account.name}`);
            const tabElement = createAccountTab(account);
            if (tabElement) {
                fragment.appendChild(tabElement);
                console.log(`✅ Aba criada para: ${account.name}`);
            } else {
                console.error(`❌ Falha ao criar aba para: ${account.name}`);
            }
        });
        
        // Adicionar todas as abas de uma vez para melhor performance
        avatarTabsContainer.appendChild(fragment);
        
        console.log(`✅ Renderização concluída: ${avatarTabsContainer.children.length} abas criadas`);
    } catch (error) {
        console.error('❌ Erro na renderização de contas:', error);
    }
}


// Atualizar estado dos botões de navegação
function updateNavigationButtons() {
    const totalPages = Math.ceil(accounts.length / ACCOUNTS_PER_PAGE);
    const startIndex = currentPage * ACCOUNTS_PER_PAGE;
    const endIndex = Math.min(startIndex + ACCOUNTS_PER_PAGE, accounts.length);
    
    if (prevPageBtn) {
        prevPageBtn.disabled = currentPage === 0;
        prevPageBtn.title = currentPage === 0 ? 'Primeira página' : `Página anterior (${currentPage}/${totalPages - 1})`;
        console.log(`⬅️ Botão anterior: ${prevPageBtn.disabled ? 'desabilitado' : 'habilitado'}`);
    }
    
    if (nextPageBtn) {
        nextPageBtn.disabled = currentPage >= totalPages - 1;
        nextPageBtn.title = currentPage >= totalPages - 1 ? 'Última página' : `Próxima página (${currentPage + 2}/${totalPages})`;
        console.log(`➡️ Botão próximo: ${nextPageBtn.disabled ? 'desabilitado' : 'habilitado'}`);
    }
    
    // Log informativo sobre a paginação
    console.log(`📄 Página ${currentPage + 1}/${totalPages} - Mostrando contas ${startIndex + 1}-${endIndex} de ${accounts.length}`);
}

// Navegar para página anterior
function goToPreviousPage() {
    if (currentPage > 0) {
        currentPage--;
        console.log(`⬅️ Navegando para página ${currentPage}`);
        
        // Som de transição
        if (window.audioManager) {
            window.audioManager.playTransition();
        }
        
        renderAccounts();
    }
}

// Navegar para próxima página
function goToNextPage() {
    const totalPages = Math.ceil(accounts.length / ACCOUNTS_PER_PAGE);
    if (currentPage < totalPages - 1) {
        currentPage++;
        console.log(`➡️ Navegando para página ${currentPage}`);
        
        // Som de transição
        if (window.audioManager) {
            window.audioManager.playTransition();
        }
        
        renderAccounts();
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
        tab.draggable = true; // Habilitar drag and drop
    
        // Círculo do avatar
        const avatarCircle = document.createElement('div');
        avatarCircle.className = 'avatar-circle';
        
        if (account.profilePicture) {
            // Usar cache se disponível
            if (avatarCache.has(account.id)) {
                avatarCircle.style.backgroundImage = `url(${avatarCache.get(account.id)})`;
                avatarCircle.style.backgroundSize = 'cover';
                avatarCircle.style.backgroundPosition = 'center';
                avatarCircle.style.backgroundRepeat = 'no-repeat';
            } else {
                // Lazy loading com Intersection Observer
                const img = new Image();
                img.dataset.accountId = account.id;
                img.onload = () => {
                    avatarCircle.style.backgroundImage = `url(${account.profilePicture})`;
                    avatarCircle.style.backgroundSize = 'cover';
                    avatarCircle.style.backgroundPosition = 'center';
                    avatarCircle.style.backgroundRepeat = 'no-repeat';
                    avatarCache.set(account.id, account.profilePicture);
                };
                img.src = account.profilePicture;
                imageObserver.observe(img);
            }
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
        tab.addEventListener('click', () => {
            // Som de transição elegante
            if (window.audioManager) {
                window.audioManager.playTransition();
            }
            
            // Adicionar classe loading
            tab.classList.add('loading');
            
            handleAccountClick(account.id);
        });
        tab.addEventListener('contextmenu', (e) => handleAccountContextMenu(e, account.id));
        
        // Som de hover elegante
        tab.addEventListener('mouseenter', () => {
            if (window.audioManager) {
                window.audioManager.playHover();
            }
        });
        
        // Event listeners para drag and drop
        setupDragAndDrop(tab);
        
        console.log(`✅ Aba criada com sucesso para: ${account.name}`);
        return tab;
    } catch (error) {
        console.error(`❌ Erro ao criar aba para ${account.name}:`, error);
        return null;
    }
}

// Manipular clique em conta
async function handleAccountClick(accountId) {
  try {
    // Atualizar estado ativo
    accounts = await window.electron.invoke('set-active-account', accountId);
    renderAccounts();
    
    // Trocar para a BrowserView da conta
    await window.electron.invoke('switch-account', accountId);
  } catch (error) {
    console.error('❌ Erro ao trocar conta:', error);
    // Mostrar notificação de erro sem quebrar o app
    showNotification('Erro ao trocar conta. Tente novamente.', 'error');
  }
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
    
    // Som de clique elegante
    if (window.audioManager) {
        window.audioManager.playClick();
    }
    
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
    // Som de clique elegante
    if (window.audioManager) {
        window.audioManager.playClick();
    }
    
    const accountName = accountNameInput.value.trim();
    if (!accountName) {
        alert('Por favor, insira um nome para a conta.');
        return;
    }
    
    if (modalMode === 'add') {
        // Modo adicionar - criar nova conta
        console.log(`➕ Criando nova conta: ${accountName}`);
        accounts = await window.electron.invoke('add-account', { name: accountName });
        
        // Som de sucesso elegante
        if (window.audioManager) {
            window.audioManager.playSuccess();
        }
        
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
    try {
        console.log(`🔧 Botão de adicionar conta clicado`);
        const accountName = addAccountInput.value.trim();
        console.log(`➕ Nome digitado: "${accountName}"`);

        if (!accountName) {
            showNotification('Por favor, insira um nome para a conta.', 'error');
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
        showNotification('Conta adicionada com sucesso!', 'success');
        console.log(`✅ Nova conta criada com sucesso, BrowserView será restaurada`);
    } catch (error) {
        console.error('❌ Erro ao adicionar conta:', error);
        showNotification('Erro ao adicionar conta. Tente novamente.', 'error');
    }
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

// Função para verificar atualizações
async function checkForUpdates() {
    try {
        console.log('🔍 Verificando atualizações...');
        
        // Fechar BrowserView para evitar sobreposição
        console.log('🔍 Fechando BrowserView para verificação de atualizações');
        window.electron.send('close-browser-view-for-add');
        
        // Mostrar aba de verificação
        updateTab.classList.add('show');
        showCheckingState();
        
        const updateInfo = await window.electron.invoke('check-updates');
        
        if (updateInfo.error) {
            console.error('❌ Erro ao verificar atualizações:', updateInfo.error);
            showErrorState(updateInfo.error);
            return;
        }
        
        if (updateInfo.hasUpdate) {
            console.log(`📦 Atualização disponível: ${updateInfo.latestVersion}`);
            showUpdateState(updateInfo);
        } else {
            console.log('✅ Aplicativo atualizado');
            showNoUpdateState();
        }
    } catch (error) {
        console.error('❌ Erro ao verificar atualizações:', error);
        showErrorState(error.message);
    }
}

// Mostrar estado de verificação
function showCheckingState() {
    document.getElementById('update-checking').style.display = 'block';
    document.getElementById('update-info').style.display = 'none';
    document.getElementById('no-update-info').style.display = 'none';
    document.getElementById('error-info').style.display = 'none';
    document.getElementById('download-update-tab-btn').style.display = 'none';
}

// Mostrar estado de atualização disponível
function showUpdateState(updateInfo) {
    document.getElementById('current-version').textContent = updateInfo.currentVersion;
    document.getElementById('latest-version').textContent = updateInfo.latestVersion;
    document.getElementById('release-notes').textContent = updateInfo.releaseNotes || 'Nenhuma informação disponível.';
    
    document.getElementById('update-checking').style.display = 'none';
    document.getElementById('update-info').style.display = 'block';
    document.getElementById('no-update-info').style.display = 'none';
    document.getElementById('error-info').style.display = 'none';
    document.getElementById('download-update-tab-btn').style.display = 'inline-block';
    
    downloadUpdateTabBtn.dataset.downloadUrl = updateInfo.downloadUrl;
}

// Mostrar estado de nenhuma atualização
function showNoUpdateState() {
    document.getElementById('update-checking').style.display = 'none';
    document.getElementById('update-info').style.display = 'none';
    document.getElementById('no-update-info').style.display = 'block';
    document.getElementById('error-info').style.display = 'none';
    document.getElementById('download-update-tab-btn').style.display = 'none';
}

// Mostrar estado de erro
function showErrorState(errorMessage) {
    document.getElementById('error-message').textContent = errorMessage;
    
    document.getElementById('update-checking').style.display = 'none';
    document.getElementById('update-info').style.display = 'none';
    document.getElementById('no-update-info').style.display = 'none';
    document.getElementById('error-info').style.display = 'block';
    document.getElementById('download-update-tab-btn').style.display = 'none';
}

    // Event listeners para navegação
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', goToPreviousPage);
        console.log('⬅️ Event listener do botão anterior adicionado');
    }
    
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', goToNextPage);
        console.log('➡️ Event listener do botão próximo adicionado');
    }

// Event listeners para verificação de atualizações
if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', checkForUpdates);
    console.log('🔄 Event listener do botão de verificação de atualizações adicionado');
}

// ========================================
// FUNCIONALIDADES DE IMPORTAR/EXPORTAR CONTAS
// ========================================

// Elementos para importar/exportar
const exportAccountsBtn = document.getElementById('export-accounts-btn');
const importAccountsBtn = document.getElementById('import-accounts-btn');

// Elementos das abas
const exportTab = document.getElementById('export-tab');
const importTab = document.getElementById('import-tab');
const closeExportTab = document.getElementById('close-export-tab');
const closeImportTab = document.getElementById('close-import-tab');
const cancelExportTabBtn = document.getElementById('cancel-export-tab-btn');
const cancelImportTabBtn = document.getElementById('cancel-import-tab-btn');

// Exportar contas
async function exportAccounts() {
    try {
        console.log('📤 Iniciando exportação de contas...');
        
        // Fechar BrowserView para evitar sobreposição
        console.log('📤 Fechando BrowserView para exportação');
        window.electron.send('close-browser-view-for-add');
        
        // Mostrar aba de exportação
        exportTab.classList.add('show');
        showExportProcessing();
        
        const result = await window.electron.invoke('export-accounts');
        
        if (result.success) {
            console.log('✅ Exportação bem-sucedida:', result.message);
            showExportSuccess(result.message);
        } else {
            console.log('❌ Exportação falhou:', result.message);
            showExportError(result.message);
        }
    } catch (error) {
        console.error('❌ Erro ao exportar contas:', error);
        showExportError('Erro ao exportar contas');
    }
}

// Importar contas
async function importAccounts() {
    try {
        console.log('📥 Iniciando importação de contas...');
        
        // Fechar BrowserView para evitar sobreposição
        console.log('📥 Fechando BrowserView para importação');
        window.electron.send('close-browser-view-for-add');
        
        // Mostrar aba de importação
        importTab.classList.add('show');
        showImportSelecting();
        
        const result = await window.electron.invoke('import-accounts');
        
        if (result.success) {
            console.log('✅ Importação bem-sucedida:', result.message);
            showImportSuccess(result.message);
            // Recarregar a página após 2 segundos
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            console.log('❌ Importação falhou:', result.message);
            showImportError(result.message);
        }
    } catch (error) {
        console.error('❌ Erro ao importar contas:', error);
        showImportError('Erro ao importar contas');
    }
}

// Funções para mostrar estados das abas
function showExportProcessing() {
    document.getElementById('export-processing').style.display = 'block';
    document.getElementById('export-success').style.display = 'none';
    document.getElementById('export-error').style.display = 'none';
}

function showExportSuccess(message) {
    document.getElementById('export-success-message').textContent = message;
    document.getElementById('export-processing').style.display = 'none';
    document.getElementById('export-success').style.display = 'block';
    document.getElementById('export-error').style.display = 'none';
}

function showExportError(message) {
    document.getElementById('export-error-message').textContent = message;
    document.getElementById('export-processing').style.display = 'none';
    document.getElementById('export-success').style.display = 'none';
    document.getElementById('export-error').style.display = 'block';
}

function showImportSelecting() {
    document.getElementById('import-selecting').style.display = 'block';
    document.getElementById('import-success').style.display = 'none';
    document.getElementById('import-error').style.display = 'none';
}

function showImportSuccess(message) {
    document.getElementById('import-success-message').textContent = message;
    document.getElementById('import-selecting').style.display = 'none';
    document.getElementById('import-success').style.display = 'block';
    document.getElementById('import-error').style.display = 'none';
}

function showImportError(message) {
    document.getElementById('import-error-message').textContent = message;
    document.getElementById('import-selecting').style.display = 'none';
    document.getElementById('import-success').style.display = 'none';
    document.getElementById('import-error').style.display = 'block';
}

// Função para mostrar notificações
function showNotification(message, type = 'info') {
    // Criar elemento de notificação
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Estilos da notificação
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 6px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transform: translateX(100%);
        transition: transform 0.3s ease;
    `;
    
    // Cores baseadas no tipo
    if (type === 'success') {
        notification.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
    } else if (type === 'error') {
        notification.style.background = 'linear-gradient(135deg, #f44336, #d32f2f)';
    } else {
        notification.style.background = 'linear-gradient(135deg, #2196F3, #1976D2)';
    }
    
    // Adicionar ao DOM
    document.body.appendChild(notification);
    
    // Animar entrada
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Remover após 3 segundos
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Event listeners para importar/exportar (agora no modal de configurações)
if (exportAccountsBtn) {
    exportAccountsBtn.addEventListener('click', exportAccounts);
    console.log('📤 Event listener do botão de exportar adicionado');
}

if (importAccountsBtn) {
    importAccountsBtn.addEventListener('click', importAccounts);
    console.log('📥 Event listener do botão de importar adicionado');
}

// ========================================
// FUNCIONALIDADES DE CONFIGURAÇÕES DE FUNDO
// ========================================

// Elementos do modal de configurações
const settingsBtn = document.getElementById('settings-btn');
const backgroundSettingsModal = document.getElementById('background-settings-modal');
const closeBackgroundSettings = document.getElementById('close-background-settings');
const imageUploadInput = document.getElementById('image-upload-input');
const backgroundPreview = document.getElementById('background-preview');
const noPreview = document.getElementById('no-preview');
const saveBackgroundBtn = document.getElementById('save-background-btn');
// restoreBackgroundBtn removido - agora usamos apenas resetColorsBtn

// Elementos do seletor de cores
const primaryColorPicker = document.getElementById('primary-color-picker');
const resetColorsBtn = document.getElementById('reset-colors-btn');
const applyColorsBtn = document.getElementById('apply-colors-btn');

// Abrir modal de configurações
if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
        // Fechar BrowserView para evitar sobreposição
        window.electron.send('close-browser-view-for-add');
        
        // Mostrar modal
        backgroundSettingsModal.classList.add('show');
        console.log('⚙️ Modal de configurações aberto');
    });
}

// Fechar modal de configurações
if (closeBackgroundSettings) {
    closeBackgroundSettings.addEventListener('click', () => {
        backgroundSettingsModal.classList.remove('show');
        window.electron.send('context-menu-closed'); // Restaurar BrowserView
        console.log('⚙️ Modal de configurações fechado');
    });
}

// Fechar modal ao clicar fora
if (backgroundSettingsModal) {
    backgroundSettingsModal.addEventListener('click', (e) => {
        if (e.target === backgroundSettingsModal) {
            backgroundSettingsModal.classList.remove('show');
            window.electron.send('context-menu-closed'); // Restaurar BrowserView
        }
    });
}

// Preview da imagem selecionada
if (imageUploadInput) {
    imageUploadInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                backgroundPreview.src = e.target.result;
                backgroundPreview.style.display = 'block';
                noPreview.style.display = 'none';
                console.log('🖼️ Preview da imagem atualizado');
            };
            reader.readAsDataURL(file);
        }
    });
}

// Salvar fundo personalizado
if (saveBackgroundBtn) {
    saveBackgroundBtn.addEventListener('click', async () => {
        const file = imageUploadInput.files[0];
        if (file) {
            try {
                // Converter File para caminho (simulação)
                const imagePath = file.path || file.name;
                await setCustomBackground(imagePath);
                backgroundSettingsModal.classList.remove('show');
                window.electron.send('context-menu-closed'); // Restaurar BrowserView
            } catch (error) {
                console.error('❌ Erro ao salvar fundo:', error);
                showNotification('Erro ao salvar fundo personalizado', 'error');
            }
        } else {
            // Se não há imagem, apenas fechar o modal (permitir salvar apenas cores)
            backgroundSettingsModal.classList.remove('show');
            window.electron.send('context-menu-closed'); // Restaurar BrowserView
        }
    });
}

// Botão de restaurar fundo removido - agora usamos apenas o botão "Restaurar Padrão Gragas"

// Event listeners para fechar abas
if (closeExportTab) {
    closeExportTab.addEventListener('click', () => {
        exportTab.classList.remove('show');
        window.electron.send('context-menu-closed'); // Restaurar BrowserView
    });
}

if (closeImportTab) {
    closeImportTab.addEventListener('click', () => {
        importTab.classList.remove('show');
        window.electron.send('context-menu-closed'); // Restaurar BrowserView
    });
}

if (cancelExportTabBtn) {
    cancelExportTabBtn.addEventListener('click', () => {
        exportTab.classList.remove('show');
        window.electron.send('context-menu-closed'); // Restaurar BrowserView
    });
}

if (cancelImportTabBtn) {
    cancelImportTabBtn.addEventListener('click', () => {
        importTab.classList.remove('show');
        window.electron.send('context-menu-closed'); // Restaurar BrowserView
    });
}

// Fechar abas ao clicar fora
if (exportTab) {
    exportTab.addEventListener('click', (e) => {
        if (e.target === exportTab) {
            exportTab.classList.remove('show');
            window.electron.send('context-menu-closed'); // Restaurar BrowserView
        }
    });
}

if (importTab) {
    importTab.addEventListener('click', (e) => {
        if (e.target === importTab) {
            importTab.classList.remove('show');
            window.electron.send('context-menu-closed'); // Restaurar BrowserView
        }
    });
}

// ========================================
// FUNCIONALIDADES DE FUNDO PERSONALIZADO
// ========================================

// Carregar fundo personalizado na inicialização
async function loadCustomBackground() {
    try {
        const backgroundPath = await window.electron.invoke('get-background-setting');
        if (backgroundPath) {
            applyCustomBackground(backgroundPath);
            console.log('🎨 Fundo personalizado carregado:', backgroundPath);
        } else {
            restoreDefaultBackground();
            console.log('🎨 Usando fundo padrão do Gragas');
        }
    } catch (error) {
        console.error('❌ Erro ao carregar fundo personalizado:', error);
        restoreDefaultBackground();
    }
}

// Aplicar fundo personalizado (lógica simples)
function applyCustomBackground(imagePath) {
    const backgroundLayer = document.getElementById('background-layer');
    if (backgroundLayer) {
        // Normalizar caminho do arquivo para Windows (trocar \ por /)
        const normalizedPath = imagePath.replace(/\\/g, '/');
        
        backgroundLayer.style.backgroundImage = `url('file://${normalizedPath}')`;
        console.log('🎨 Fundo personalizado aplicado:', normalizedPath);
    }
}

// Restaurar fundo padrão (lógica simples)
function restoreDefaultBackground() {
    const backgroundLayer = document.getElementById('background-layer');
    if (backgroundLayer) {
        backgroundLayer.style.backgroundImage = '';
        console.log('🎨 Fundo padrão restaurado');
    }
}

// Função para definir novo fundo
async function setCustomBackground(imagePath) {
    try {
        const result = await window.electron.invoke('set-background-image', imagePath);
        if (result.success) {
            applyCustomBackground(imagePath);
            showNotification(result.message, 'success');
        } else {
            showNotification(result.message, 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao definir fundo personalizado:', error);
        showNotification('Erro ao definir fundo personalizado', 'error');
    }
}

// Função para restaurar fundo padrão
async function restoreDefaultBackgroundAction() {
    try {
        const result = await window.electron.invoke('restore-default-background');
        if (result.success) {
            restoreDefaultBackground();
            showNotification(result.message, 'success');
        } else {
            showNotification(result.message, 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao restaurar fundo padrão:', error);
        showNotification('Erro ao restaurar fundo padrão', 'error');
    }
}

// ========================================
// FUNCIONALIDADES DE PERSONALIZAÇÃO DE CORES
// ========================================

// Carregar cor personalizada na inicialização
async function loadCustomColors() {
    try {
        const customColor = await window.electron.invoke('get-custom-color');
        if (customColor) {
            applyCustomColor(customColor);
            if (primaryColorPicker) primaryColorPicker.value = customColor;
            console.log('🎨 Cor personalizada carregada:', customColor);
        } else {
            console.log('🎨 Usando cor padrão do Gragas');
        }
    } catch (error) {
        console.error('❌ Erro ao carregar cor personalizada:', error);
    }
}

// Aplicar cor personalizada
function applyCustomColor(color) {
    // Atualizar variáveis CSS
    document.documentElement.style.setProperty('--gragas-orange', color);
    document.documentElement.style.setProperty('--sunset-gradient', `linear-gradient(135deg, ${color}, ${darkenColor(color, 20)})`);
    
    // Aplicar cor no cabeçalho (barra de título personalizada)
    const customTitleBar = document.querySelector('.custom-title-bar');
    if (customTitleBar) {
        customTitleBar.style.background = `linear-gradient(135deg, ${darkenColor(color, 30)} 0%, ${darkenColor(color, 15)} 50%, ${color} 100%)`;
        customTitleBar.style.borderBottomColor = color;
    }
    
    console.log('🎨 Cor personalizada aplicada:', color);
}

// Escurecer cor para gradiente
function darkenColor(color, percent) {
    const num = parseInt(color.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

// Salvar cor personalizada
async function saveCustomColor(color) {
    try {
        const result = await window.electron.invoke('set-custom-color', color);
        if (result.success) {
            applyCustomColor(color);
            showNotification('Cor personalizada salva com sucesso!', 'success');
        } else {
            showNotification(result.message, 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao salvar cor personalizada:', error);
        showNotification('Erro ao salvar cor personalizada', 'error');
    }
}

// Restaurar cor padrão
async function resetCustomColor() {
    try {
        const result = await window.electron.invoke('reset-custom-color');
        if (result.success) {
            // Restaurar cor padrão
            const defaultColor = '#FF6B35';
            applyCustomColor(defaultColor);
            if (primaryColorPicker) primaryColorPicker.value = defaultColor;
            showNotification('Cor padrão restaurada!', 'success');
        } else {
            showNotification(result.message, 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao restaurar cor padrão:', error);
        showNotification('Erro ao restaurar cor padrão', 'error');
    }
}

// Restaurar tudo para o padrão (cores + fundo)
async function resetAllToDefault() {
    try {
        // Restaurar cor padrão
        const colorResult = await window.electron.invoke('reset-custom-color');
        if (colorResult.success) {
            const defaultColor = '#FF6B35';
            applyCustomColor(defaultColor);
            if (primaryColorPicker) primaryColorPicker.value = defaultColor;
        }
        
        // Restaurar fundo padrão
        const backgroundResult = await window.electron.invoke('restore-default-background');
        if (backgroundResult.success) {
            restoreDefaultBackground();
        }
        
        // Limpar seleção de imagem
        if (imageUploadInput) {
            imageUploadInput.value = '';
        }
        
        // Esconder preview de imagem
        if (backgroundPreview) {
            backgroundPreview.style.display = 'none';
            backgroundPreview.src = '';
        }
        if (noPreview) {
            noPreview.style.display = 'block';
        }
        
        showNotification('Tudo restaurado para o padrão Gragas!', 'success');
    } catch (error) {
        console.error('❌ Erro ao restaurar tudo:', error);
        showNotification('Erro ao restaurar configurações', 'error');
    }
}

// Event listeners para personalização de cores
if (primaryColorPicker) {
    primaryColorPicker.addEventListener('input', (e) => {
        const color = e.target.value;
        applyCustomColor(color);
        console.log('🎨 Cor selecionada:', color);
    });
}

// Limpeza suave de memória (apenas cache, SEM tocar em contas)
function cleanupMemory() {
  try {
    // Limpar apenas cache de avatares muito antigos (manter últimos 200)
    if (avatarCache && avatarCache.size > 200) {
      const entries = Array.from(avatarCache.entries());
      const toRemove = entries.slice(0, entries.length - 200);
      toRemove.forEach(([key]) => avatarCache.delete(key));
      console.log('🧹 Cache de avatares antigos limpo');
    }
    
    // Limpar apenas observadores de imagens realmente órfãs
    const observedImages = document.querySelectorAll('img[data-account-id]');
    observedImages.forEach(img => {
      if (!img.isConnected) {
        imageObserver.unobserve(img);
      }
    });
    
    // NÃO REMOVER ELEMENTOS - manter tudo funcionando
    
    console.log('✅ Limpeza suave do renderer concluída');
  } catch (error) {
    console.error('❌ Erro na limpeza de memória do renderer:', error);
  }
}

// Executar limpeza suave a cada 15 minutos (muito menos frequente)
setInterval(cleanupMemory, 15 * 60 * 1000);

if (applyColorsBtn) {
    applyColorsBtn.addEventListener('click', async () => {
        if (primaryColorPicker) {
            const color = primaryColorPicker.value;
            await saveCustomColor(color);
        }
    });
}

if (resetColorsBtn) {
    resetColorsBtn.addEventListener('click', async () => {
        await resetAllToDefault();
    });
}
    
    if (closeUpdateTab) {
        closeUpdateTab.addEventListener('click', () => {
            updateTab.classList.remove('show');
            // Restaurar BrowserView após fechar aba de atualização
            window.electron.send('context-menu-closed');
        });
    }
    
    if (cancelUpdateTabBtn) {
        cancelUpdateTabBtn.addEventListener('click', () => {
            updateTab.classList.remove('show');
            // Restaurar BrowserView após fechar aba de atualização
            window.electron.send('context-menu-closed');
        });
    }
    
    if (downloadUpdateTabBtn) {
        downloadUpdateTabBtn.addEventListener('click', () => {
            const downloadUrl = downloadUpdateTabBtn.dataset.downloadUrl;
            if (downloadUrl) {
                window.electron.invoke('open-download-page', downloadUrl);
            }
            updateTab.classList.remove('show');
            // Restaurar BrowserView após fechar aba de atualização
            window.electron.send('context-menu-closed');
        });
    }
    
    // Fechar aba de atualização ao clicar fora
    if (updateTab) {
        updateTab.addEventListener('click', (e) => {
            if (e.target === updateTab) {
                updateTab.classList.remove('show');
                // Restaurar BrowserView após fechar aba de atualização
                window.electron.send('context-menu-closed');
            }
        });
    }

    // Inicializar aplicativo
    init();
