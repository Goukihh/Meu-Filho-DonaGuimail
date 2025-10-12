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
let dragStartPage = -1;
let dragOverPage = -1;
let dragScrollInterval = null;

// Detectar drag nas bordas para mudança de página
function handleDragOverEdges(e) {
    if (!draggedElement) return;
    
    const container = document.querySelector('.avatar-tabs-container');
    const tabsArea = document.getElementById('avatar-tabs');
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    
    if (!container || !tabsArea || !prevBtn || !nextBtn) return;
    
    const containerRect = container.getBoundingClientRect();
    const tabsRect = tabsArea.getBoundingClientRect();
    const prevRect = prevBtn.getBoundingClientRect();
    const nextRect = nextBtn.getBoundingClientRect();
    
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    // Detectar se está sobre o botão anterior
    if (mouseX >= prevRect.left && mouseX <= prevRect.right && 
        mouseY >= prevRect.top && mouseY <= prevRect.bottom) {
        
        if (currentPage > 0 && dragOverPage !== currentPage - 1) {
            dragOverPage = currentPage - 1;
            console.log(`⬅️ Drag detectado no botão anterior - mudando para página ${dragOverPage}`);
            
            // Iniciar scroll automático
            startDragScroll('prev');
        }
        return;
    }
    
    // Detectar se está sobre o botão próximo
    if (mouseX >= nextRect.left && mouseX <= nextRect.right && 
        mouseY >= nextRect.top && mouseY <= nextRect.bottom) {
        
        const totalPages = Math.ceil(accounts.length / ACCOUNTS_PER_PAGE);
        if (currentPage < totalPages - 1 && dragOverPage !== currentPage + 1) {
            dragOverPage = currentPage + 1;
            console.log(`➡️ Drag detectado no botão próximo - mudando para página ${dragOverPage}`);
            
            // Iniciar scroll automático
            startDragScroll('next');
        }
        return;
    }
    
    // Se não está sobre os botões, parar scroll
    if (dragScrollInterval) {
        clearInterval(dragScrollInterval);
        dragScrollInterval = null;
        console.log('🛑 Parando scroll automático - drag saiu dos botões');
    }
}

// Iniciar scroll automático durante drag
function startDragScroll(direction) {
    if (dragScrollInterval) {
        clearInterval(dragScrollInterval);
    }
    
    dragScrollInterval = setInterval(() => {
        if (direction === 'prev' && currentPage > 0) {
            goToPreviousPage();
        } else if (direction === 'next') {
            const totalPages = Math.ceil(accounts.length / ACCOUNTS_PER_PAGE);
            if (currentPage < totalPages - 1) {
                goToNextPage();
            }
        }
    }, 500); // Mudar página a cada 500ms
}

// Configurar drag and drop para uma aba
function setupDragAndDrop(tab) {
    // Evento de início do drag
    tab.addEventListener('dragstart', (e) => {
        draggedElement = tab;
        dragStartIndex = Array.from(avatarTabsContainer.children).indexOf(tab);
        dragStartPage = currentPage;
        dragOverPage = currentPage;
        tab.classList.add('dragging');
        
        // Som de início do drag
        if (window.audioManager) {
            window.audioManager.playClick();
        }
        
        console.log(`🔄 Iniciando drag da conta: ${tab.dataset.accountId} da página ${currentPage}`);
    });
    
    // Evento de fim do drag
    tab.addEventListener('dragend', (e) => {
        tab.classList.remove('dragging');
        
        // Remover todas as classes de drag
        document.querySelectorAll('.avatar-tab').forEach(t => {
            t.classList.remove('drag-over', 'drag-placeholder');
        });
        
        // Limpar interval de scroll
        if (dragScrollInterval) {
            clearInterval(dragScrollInterval);
            dragScrollInterval = null;
        }
        
        draggedElement = null;
        dragStartIndex = -1;
        dragStartPage = -1;
        dragOverPage = -1;
        
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
        
        // Detectar drag nas bordas para mudança de página
        handleDragOverEdges(e);
    });
    
    // Evento de drop
    tab.addEventListener('drop', async (e) => {
        e.preventDefault();
        tab.classList.remove('drag-over');
        
        if (draggedElement && draggedElement !== tab) {
            const dropIndex = Array.from(avatarTabsContainer.children).indexOf(tab);
            
            // Calcular índices corretos considerando mudança de página
            const actualStartIndex = dragStartIndex + (dragStartPage * ACCOUNTS_PER_PAGE);
            const actualDropIndex = dropIndex + (currentPage * ACCOUNTS_PER_PAGE);
            
            console.log(`🎯 Drop realizado: de página ${dragStartPage} (índice ${dragStartIndex}) para página ${currentPage} (índice ${dropIndex})`);
            console.log(`📊 Índices globais: ${actualStartIndex} → ${actualDropIndex}`);
            
            // Reordenar contas no array usando índices globais
            await reorderAccounts(actualStartIndex, actualDropIndex);
            
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
        
        // Validar se há contas para reordenar
        if (!accounts || accounts.length === 0) {
            console.error('❌ Nenhuma conta disponível para reordenação');
            showNotification('Nenhuma conta disponível para reordenação', 'error');
            return;
        }
        
        // Usar índices globais diretamente (já calculados no drop)
        const realFromIndex = fromIndex;
        const realToIndex = toIndex;
        
        // Verificar se os índices são válidos
        if (realFromIndex < 0 || realFromIndex >= accounts.length || 
            realToIndex < 0 || realToIndex >= accounts.length) {
            console.error('❌ Índices inválidos para reordenação');
            showNotification('Posição inválida para reordenação', 'error');
            return;
        }
        
        // Verificar se é a mesma posição
        if (realFromIndex === realToIndex) {
            console.log('ℹ️ Conta já está na posição correta');
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
    
    // Carregar modo PC fraco
    await loadWeakPCMode();
    
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
                // Carregar imagem normalmente (sem lazy loading por enquanto)
                const img = new Image();
                img.dataset.accountId = account.id;
                img.onload = () => {
                    avatarCircle.style.backgroundImage = `url(${account.profilePicture})`;
                    avatarCircle.style.backgroundSize = 'cover';
                    avatarCircle.style.backgroundPosition = 'center';
                    avatarCircle.style.backgroundRepeat = 'no-repeat';
                    avatarCache.set(account.id, account.profilePicture);
                };
                img.onerror = () => {
                    console.log(`⚠️ Erro ao carregar avatar para ${account.name}`);
                    // Manter placeholder se falhar
                };
                img.src = account.profilePicture;
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
    // Gerenciar carregamento inteligente APENAS no modo PC fraco
    if (weakPCMode) {
      manageAccountLoading(accountId);
    }
    
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

// Confirmar ação (renomear, remover ou limpar sessão)
confirmRenameBtn.addEventListener('click', () => {
    console.log(`🔧 Botão de confirmar clicado`);
    const newName = renameInput.value.trim();
    console.log(`📝 Nome digitado: "${newName}"`);
    console.log(`📝 ID da conta: ${editingAccountId}`);
    
    if (!editingAccountId) {
        console.error(`❌ ID da conta não encontrado: ${editingAccountId}`);
        alert('Erro: ID da conta não encontrado.');
        return;
    }
    
    // Para remoção e limpeza de sessão, não precisamos do nome
    // Vamos usar um nome vazio para essas ações
    const actionName = newName || 'confirm';
    
    console.log(`📝 Enviando ação: conta ${editingAccountId} com nome: ${actionName}`);
    window.electron.send('execute-rename', { 
        accountId: editingAccountId, 
        newName: actionName
    });
    renameTab.classList.remove('show');
    // Restaurar BrowserView após fechar aba
    window.electron.send('context-menu-closed');
    console.log(`✅ Ação concluída, BrowserView será restaurada`);
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

// Elementos para aba de limpeza de sessão
const clearTab = document.getElementById('clear-session-tab');
const confirmClearBtn = document.getElementById('confirm-clear-btn');
const cancelClearBtn = document.getElementById('cancel-clear-btn');
const closeClearBtn = document.getElementById('close-clear-tab');

// Confirmar limpeza de sessão
if (confirmClearBtn) {
    confirmClearBtn.addEventListener('click', () => {
        console.log(`🔧 Botão de limpar sessão clicado`);
        console.log(`🧹 ID da conta: ${editingAccountId}`);
        
        if (!editingAccountId) {
            console.error(`❌ ID da conta não encontrado: ${editingAccountId}`);
            alert('Erro: ID da conta não encontrado.');
            return;
        }
        
        console.log(`🧹 Enviando limpeza de sessão: conta ${editingAccountId}`);
        window.electron.send('execute-clear-session', { 
            accountId: editingAccountId
        });
        clearTab.classList.remove('show');
        // Restaurar BrowserView após fechar aba de limpeza
        window.electron.send('context-menu-closed');
        console.log(`✅ Limpeza de sessão concluída, BrowserView será restaurada`);
    });
}

// Cancelar limpeza de sessão
if (cancelClearBtn) {
    cancelClearBtn.addEventListener('click', () => {
        console.log(`❌ Cancelando limpeza de sessão`);
        clearTab.classList.remove('show');
        // Restaurar BrowserView após cancelar limpeza
        window.electron.send('context-menu-closed');
        console.log(`✅ Cancelamento de limpeza de sessão - BrowserView será restaurada`);
    });
}

// Fechar aba de limpeza de sessão (X)
if (closeClearBtn) {
    closeClearBtn.addEventListener('click', () => {
        console.log(`❌ Fechando aba de limpeza de sessão (X)`);
        clearTab.classList.remove('show');
        // Restaurar BrowserView após fechar limpeza
        window.electron.send('context-menu-closed');
        console.log(`✅ Aba de limpeza de sessão fechada (X) - BrowserView será restaurada`);
    });
}

// Elementos para aba de remoção
const removeTab = document.getElementById('remove-account-tab');
const confirmRemoveBtn = document.getElementById('confirm-remove-btn');
const cancelRemoveBtn = document.getElementById('cancel-remove-btn');
const closeRemoveBtn = document.getElementById('close-remove-tab');

// Confirmar remoção
if (confirmRemoveBtn) {
    confirmRemoveBtn.addEventListener('click', () => {
        console.log(`🔧 Botão de remover clicado`);
        console.log(`🗑️ ID da conta: ${editingAccountId}`);
        
        if (!editingAccountId) {
            console.error(`❌ ID da conta não encontrado: ${editingAccountId}`);
            alert('Erro: ID da conta não encontrado.');
            return;
        }
        
        console.log(`🗑️ Enviando remoção: conta ${editingAccountId}`);
        window.electron.send('execute-remove', { 
            accountId: editingAccountId
        });
        removeTab.classList.remove('show');
        // Restaurar BrowserView após fechar aba de remoção
        window.electron.send('context-menu-closed');
        console.log(`✅ Remoção concluída, BrowserView será restaurada`);
    });
}

// Cancelar remoção
if (cancelRemoveBtn) {
    cancelRemoveBtn.addEventListener('click', () => {
        console.log(`❌ Cancelando remoção`);
        removeTab.classList.remove('show');
        // Restaurar BrowserView após cancelar remoção
        window.electron.send('context-menu-closed');
        console.log(`✅ Cancelamento de remoção - BrowserView será restaurada`);
    });
}

// Fechar aba de remoção (X)
if (closeRemoveBtn) {
    closeRemoveBtn.addEventListener('click', () => {
        console.log(`❌ Fechando aba de remoção (X)`);
        removeTab.classList.remove('show');
        // Restaurar BrowserView após fechar remoção
        window.electron.send('context-menu-closed');
        console.log(`✅ Aba de remoção fechada (X) - BrowserView será restaurada`);
    });
}

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

// Listener para solicitar renomeação (também usado para remover e limpar sessão)
window.electron.on('prompt-for-rename', (accountId) => {
    console.log(`📝 Iniciando ação para conta ${accountId}`);
    editingAccountId = accountId;
    console.log(`📝 ID da conta definido: ${editingAccountId}`);
    
    // Usar a aba de renomeação para todas as ações
    const renameTab = document.getElementById('rename-tab');
    const renameInput = document.getElementById('rename-account-name');
    const renameHeader = document.querySelector('.rename-tab-header h2');
    const renameLabel = document.querySelector('.rename-tab-body label');
    const confirmBtn = document.getElementById('confirm-rename-btn');
    
    if (!renameTab) {
        console.error(`❌ Aba de renomeação não encontrada`);
        return;
    }
    
    if (!renameInput) {
        console.error(`❌ Input de renomeação não encontrado`);
        return;
    }
    
    // Modificar o texto da aba baseado na ação
    // Por enquanto, vamos manter como renomeação
    renameHeader.textContent = 'Renomear Conta';
    renameLabel.textContent = 'Novo Nome da Conta:';
    renameInput.placeholder = 'Digite o novo nome...';
    confirmBtn.textContent = 'Renomear';
    
    renameTab.classList.add('show');
    renameInput.value = '';
    renameInput.focus();
    console.log(`📝 Aba de renomeação exibida para conta ${accountId}`);
});

// Listener para solicitar limpeza de sessão
window.electron.on('prompt-for-clear-session', (accountId) => {
    console.log(`🧹 Iniciando limpeza de sessão para conta ${accountId}`);
    editingAccountId = accountId;
    console.log(`🧹 ID da conta definido: ${editingAccountId}`);
    
    // Usar aba dedicada para limpeza de sessão
    const clearTab = document.getElementById('clear-session-tab');
    
    if (!clearTab) {
        console.error(`❌ Aba de limpeza de sessão não encontrada`);
        return;
    }
    
    clearTab.classList.add('show');
    console.log(`🧹 Aba de limpeza de sessão exibida para conta ${accountId}`);
});

// SISTEMA DE KILL SWITCH - HANDLER
window.electron.on('kill-switch-activated', (message) => {
    console.log('❌ Kill switch ativado:', message);
    
    // Mostrar notificação para o usuário
    showNotification('App desativado pelo desenvolvedor', 'error');
    
    // Mostrar modal de desativação
    showKillSwitchModal(message);
});

// Mostrar modal de kill switch
function showKillSwitchModal(message) {
    const modal = document.createElement('div');
    modal.className = 'kill-switch-modal';
    modal.innerHTML = `
        <div class="kill-switch-content">
            <div class="kill-switch-header">
                <h2>🚫 App Desativado</h2>
            </div>
            <div class="kill-switch-body">
                <p><strong>O aplicativo foi desativado pelo desenvolvedor.</strong></p>
                <p>Motivo: ${message}</p>
                <p>O aplicativo será encerrado em alguns segundos...</p>
            </div>
        </div>
    `;
    
    // Adicionar estilos
    const style = document.createElement('style');
    style.textContent = `
        .kill-switch-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        }
        .kill-switch-content {
            background: #2f3136;
            border-radius: 8px;
            padding: 30px;
            max-width: 400px;
            text-align: center;
            color: white;
        }
        .kill-switch-header h2 {
            color: #f04747;
            margin: 0 0 20px 0;
        }
        .kill-switch-body p {
            margin: 10px 0;
            line-height: 1.5;
        }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(modal);
}

// Listener para solicitar remoção
window.electron.on('prompt-for-remove', (accountId) => {
    console.log(`🗑️ Iniciando remoção para conta ${accountId}`);
    editingAccountId = accountId;
    console.log(`🗑️ ID da conta definido: ${editingAccountId}`);
    
    // Usar aba dedicada para remoção
    const removeTab = document.getElementById('remove-account-tab');
    
    if (!removeTab) {
        console.error(`❌ Aba de remoção não encontrada`);
        return;
    }
    
    removeTab.classList.add('show');
    console.log(`🗑️ Aba de remoção exibida para conta ${accountId}`);
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
        
        // Event listeners para drag and drop nos botões
        prevPageBtn.addEventListener('dragover', (e) => {
            e.preventDefault();
            handleDragOverEdges(e);
        });
        
        prevPageBtn.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (draggedElement) {
                prevPageBtn.classList.add('drag-over-nav');
            }
        });
        
        prevPageBtn.addEventListener('dragleave', (e) => {
            if (!prevPageBtn.contains(e.relatedTarget)) {
                prevPageBtn.classList.remove('drag-over-nav');
            }
        });
        
        console.log('⬅️ Event listener do botão anterior adicionado');
    }
    
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', goToNextPage);
        
        // Event listeners para drag and drop nos botões
        nextPageBtn.addEventListener('dragover', (e) => {
            e.preventDefault();
            handleDragOverEdges(e);
        });
        
        nextPageBtn.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (draggedElement) {
                nextPageBtn.classList.add('drag-over-nav');
            }
        });
        
        nextPageBtn.addEventListener('dragleave', (e) => {
            if (!nextPageBtn.contains(e.relatedTarget)) {
                nextPageBtn.classList.remove('drag-over-nav');
            }
        });
        
        console.log('➡️ Event listener do botão próximo adicionado');
    }
    
    // Event listener global para detectar drag fora da área
    document.addEventListener('dragover', (e) => {
        if (draggedElement) {
            const container = document.querySelector('.avatar-tabs-container');
            if (container && !container.contains(e.target)) {
                // Se drag está fora da área de contas, parar scroll
                if (dragScrollInterval) {
                    clearInterval(dragScrollInterval);
                    dragScrollInterval = null;
                    console.log('🛑 Parando scroll - drag fora da área de contas');
                }
            }
        }
    });

// Event listeners para verificação de atualizações
if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', checkForUpdates);
    console.log('🔄 Event listener do botão de verificação de atualizações adicionado');
}

// ========================================
// MELHORIAS DE FEEDBACK VISUAL - GRAGAS SUNSET
// ========================================

// Sistema de Toast Notifications
function showToast(message, type = 'info', duration = 3000) {
    // Remover toast existente se houver
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    // Criar novo toast
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Auto-remover após duração
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.animation = 'slideInRight 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
}

// Sistema de Loading Overlay
function showLoadingOverlay(message = 'Carregando...') {
    const existingOverlay = document.querySelector('.loading-overlay');
    if (existingOverlay) {
        existingOverlay.remove();
    }

    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
        <div style="text-align: center; color: #ffffff;">
            <div class="loading-spinner"></div>
            <div style="margin-top: 16px; font-weight: 600;">${message}</div>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

function hideLoadingOverlay() {
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
    }
}

// Sistema de Progress Bar
function showProgressBar(container, progress = 0) {
    const existingBar = container.querySelector('.progress-bar');
    if (existingBar) {
        existingBar.remove();
    }

    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-bar';
    progressContainer.innerHTML = '<div class="progress-fill" style="width: 0%"></div>';
    
    container.appendChild(progressContainer);
    
    // Animar progresso
    setTimeout(() => {
        const fill = progressContainer.querySelector('.progress-fill');
        fill.style.width = `${progress}%`;
    }, 100);
}

// Sistema de Action Feedback
function showActionFeedback(message, type = 'success') {
    const feedback = document.createElement('div');
    feedback.className = `action-feedback ${type}`;
    feedback.textContent = message;
    
    document.body.appendChild(feedback);
    
    setTimeout(() => {
        feedback.style.animation = 'actionFeedback 0.5s ease reverse';
        setTimeout(() => feedback.remove(), 500);
    }, 1500);
}

// Melhorar indicadores de status das contas
function updateAccountStatus(accountId, status) {
    const accountTab = document.querySelector(`[data-account-id="${accountId}"]`);
    if (!accountTab) return;

    const statusIndicator = accountTab.querySelector('.status-indicator');
    if (!statusIndicator) return;

    // Remover classes anteriores
    statusIndicator.classList.remove('online', 'offline', 'loading', 'error');
    
    // Adicionar nova classe
    statusIndicator.classList.add(status);
    
    // Adicionar animações específicas
    switch(status) {
        case 'online':
            statusIndicator.style.animation = 'onlinePulse 2s ease-in-out infinite';
            break;
        case 'loading':
            statusIndicator.style.animation = 'statusPulse 1.5s ease-in-out infinite';
            break;
        case 'error':
            statusIndicator.style.animation = 'errorBlink 0.5s ease-in-out infinite';
            break;
        default:
            statusIndicator.style.animation = 'none';
    }
}

// Melhorar estados de drag and drop
function enhanceDragStates() {
    const avatarTabs = document.querySelectorAll('.avatar-tab');
    
    avatarTabs.forEach(tab => {
        tab.addEventListener('dragstart', (e) => {
            tab.classList.add('dragging');
            showToast('Arraste para reordenar', 'info', 2000);
        });
        
        tab.addEventListener('dragend', (e) => {
            tab.classList.remove('dragging');
        });
        
        tab.addEventListener('dragover', (e) => {
            e.preventDefault();
            tab.classList.add('drag-over');
        });
        
        tab.addEventListener('dragleave', (e) => {
            tab.classList.remove('drag-over');
        });
        
        tab.addEventListener('drop', (e) => {
            e.preventDefault();
            tab.classList.remove('drag-over');
            showActionFeedback('Conta reordenada!', 'success');
        });
    });
}

// Sistema de feedback para ações de conta
function enhanceAccountActions() {
    // Adicionar feedback para troca de conta
    const originalSwitchAccount = switchAccount;
    window.switchAccount = function(accountId) {
        const account = accounts.find(acc => acc.id === accountId);
        if (account) {
            showToast(`Trocando para ${account.name}...`, 'info', 2000);
            updateAccountStatus(accountId, 'loading');
        }
        
        return originalSwitchAccount(accountId);
    };
    
    // Adicionar feedback para adicionar conta
    const originalAddAccount = addAccount;
    window.addAccount = function() {
        showLoadingOverlay('Adicionando nova conta...');
        return originalAddAccount();
    };
    
    // Adicionar feedback para remover conta
    const originalRemoveAccount = removeAccount;
    window.removeAccount = function(accountId) {
        const account = accounts.find(acc => acc.id === accountId);
        if (account) {
            showToast(`Removendo ${account.name}...`, 'warning', 2000);
        }
        return originalRemoveAccount(accountId);
    };
}

// Sistema de feedback para backup/restore
function enhanceBackupActions() {
    // Adicionar feedback para backup
    const originalCreateBackup = createBackup;
    window.createBackup = function() {
        showLoadingOverlay('Criando backup...');
        return originalCreateBackup().then(result => {
            hideLoadingOverlay();
            if (result.success) {
                showActionFeedback('Backup criado com sucesso!', 'success');
            } else {
                showToast('Erro ao criar backup', 'error', 4000);
            }
            return result;
        });
    };
    
    // Adicionar feedback para restore
    const originalRestoreBackup = restoreBackup;
    window.restoreBackup = function() {
        showLoadingOverlay('Restaurando backup...');
        return originalRestoreBackup().then(result => {
            hideLoadingOverlay();
            if (result.success) {
                showActionFeedback('Backup restaurado com sucesso!', 'success');
            } else {
                showToast('Erro ao restaurar backup', 'error', 4000);
            }
            return result;
        });
    };
}

// Inicializar melhorias de feedback visual
function initializeVisualFeedback() {
    console.log('🎨 Inicializando melhorias de feedback visual...');
    
    // Aplicar melhorias
    enhanceDragStates();
    enhanceAccountActions();
    enhanceBackupActions();
    
    // Adicionar feedback para atualizações
    window.addEventListener('accounts-updated', () => {
        showToast('Contas atualizadas!', 'success', 2000);
    });
    
    console.log('✅ Melhorias de feedback visual inicializadas');
}

;

// ========================================
// SISTEMA DE BACKUP
// ========================================

// Elementos para backup/restaurar
const createBackupBtn = document.getElementById('create-backup-btn');
const restoreBackupBtn = document.getElementById('restore-backup-btn');

// Elementos das abas de backup
const backupTab = document.getElementById('backup-tab');
const restoreTab = document.getElementById('restore-tab');
const closeBackupTab = document.getElementById('close-backup-tab');
const closeRestoreTab = document.getElementById('close-restore-tab');
const cancelBackupTabBtn = document.getElementById('cancel-backup-tab-btn');
const cancelRestoreTabBtn = document.getElementById('cancel-restore-tab-btn');

// Criar backup manual
async function createBackup() {
    try {
        console.log('💾 Iniciando backup manual...');
        
        // Fechar BrowserView para evitar sobreposição
        console.log('💾 Fechando BrowserView para backup');
        window.electron.send('close-browser-view-for-add');
        
        // Mostrar aba de backup
        backupTab.classList.add('show');
        showBackupProcessing();
        
        // Solicitar backup via IPC (sem diálogo nativo)
        const backupResult = await window.electron.invoke('create-backup');
        
        if (backupResult.success) {
            console.log('✅ Backup preparado:', backupResult.message);
            showBackupSuccess('Backup será executado após reiniciar o app.\nO app será fechado automaticamente.');
        } else {
            console.error('❌ Erro ao preparar backup:', backupResult.error);
            showBackupError(`Erro ao preparar backup: ${backupResult.error}`);
        }
    } catch (error) {
        console.error('❌ Erro ao criar backup:', error);
        showBackupError('Erro ao criar backup');
    }
}

// Restaurar backup
async function restoreBackup() {
    try {
        console.log('🔄 Iniciando restauração de backup ZIP...');
        
        // Fechar BrowserView para evitar sobreposição
        console.log('🔄 Fechando BrowserView para restauração');
        window.electron.send('close-browser-view-for-add');
        
        // Mostrar aba de restauração
        restoreTab.classList.add('show');
        showRestoreProcessing();
        
        // Solicitar restore via IPC (sem diálogo nativo)
        const restoreResult = await window.electron.invoke('restore-backup');
        
        if (restoreResult.success) {
            console.log('✅ Restore preparado:', restoreResult.message);
            showRestoreSuccess('Restore será executado após reiniciar o app.\nO app será fechado automaticamente.');
        } else {
            console.error('❌ Erro ao preparar restore:', restoreResult.error);
            showRestoreError(`Erro ao preparar restore: ${restoreResult.error}`);
        }
        
    } catch (error) {
        console.error('❌ Erro ao restaurar backup:', error);
        showRestoreError('Erro ao restaurar backup');
    }
}

// Preencher lista de backups
function populateBackupList(backups) {
    const backupList = document.getElementById('backup-list');
    if (!backupList) return;
    
    backupList.innerHTML = '';
    
    if (backups.length === 0) {
        backupList.innerHTML = '<p style="text-align: center; color: #b9bbbe;">Nenhum backup encontrado</p>';
        return;
    }
    
    backups.forEach((backup, index) => {
        const backupItem = document.createElement('div');
        backupItem.className = 'backup-item';
        backupItem.innerHTML = `
            <div class="backup-info">
                <h4>Backup ${index + 1}</h4>
                <p>Data: ${backup.date}</p>
                <p>Arquivo: ${backup.name}</p>
            </div>
            <button class="restore-backup-btn" data-path="${backup.path}">
                Restaurar
            </button>
        `;
        
        // Event listener para restaurar backup
        const restoreBtn = backupItem.querySelector('.restore-backup-btn');
        restoreBtn.addEventListener('click', async () => {
            try {
                showRestoreProcessing();
                const result = await window.electron.invoke('restore-backup', backup.path);
                
                if (result.success) {
                    console.log('✅ Restore preparado:', result.message);
                    showRestoreSuccess('Restore será executado após reiniciar o app.\nO app será fechado automaticamente.');
                } else {
                    console.log('❌ Restauração falhou:', result.error);
                    showRestoreError(result.error);
                }
            } catch (error) {
                console.error('❌ Erro ao restaurar backup:', error);
                showRestoreError('Erro ao restaurar backup');
            }
        });
        
        backupList.appendChild(backupItem);
    });
}

// Funções para mostrar estados das abas
function showBackupProcessing() {
    document.getElementById('backup-processing').style.display = 'block';
    document.getElementById('backup-success').style.display = 'none';
    document.getElementById('backup-error').style.display = 'none';
}

function showBackupSuccess(message) {
    document.getElementById('backup-success-message').textContent = message;
    document.getElementById('backup-processing').style.display = 'none';
    document.getElementById('backup-success').style.display = 'block';
    document.getElementById('backup-error').style.display = 'none';
}

function showBackupError(message) {
    document.getElementById('backup-error-message').textContent = message;
    document.getElementById('backup-processing').style.display = 'none';
    document.getElementById('backup-success').style.display = 'none';
    document.getElementById('backup-error').style.display = 'block';
}

function showRestoreSelecting() {
    document.getElementById('restore-selecting').style.display = 'block';
    document.getElementById('restore-success').style.display = 'none';
    document.getElementById('restore-error').style.display = 'none';
}

function showRestoreProcessing() {
    document.getElementById('restore-selecting').style.display = 'none';
    document.getElementById('restore-processing').style.display = 'block';
    document.getElementById('restore-success').style.display = 'none';
    document.getElementById('restore-error').style.display = 'none';
}

function showRestoreSuccess(message) {
    document.getElementById('restore-success-message').textContent = message;
    document.getElementById('restore-selecting').style.display = 'none';
    document.getElementById('restore-processing').style.display = 'none';
    document.getElementById('restore-success').style.display = 'block';
    document.getElementById('restore-error').style.display = 'none';
}

function showRestoreError(message) {
    document.getElementById('restore-error-message').textContent = message;
    document.getElementById('restore-selecting').style.display = 'none';
    document.getElementById('restore-processing').style.display = 'none';
    document.getElementById('restore-success').style.display = 'none';
    document.getElementById('restore-error').style.display = 'block';
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

// Event listeners para backup/restaurar
if (createBackupBtn) {
    createBackupBtn.addEventListener('click', createBackup);
    console.log('💾 Event listener do botão de backup adicionado');
}

if (restoreBackupBtn) {
    restoreBackupBtn.addEventListener('click', restoreBackup);
    console.log('🔄 Event listener do botão de restaurar adicionado');
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

// Event listeners para fechar abas de backup
if (closeBackupTab) {
    closeBackupTab.addEventListener('click', () => {
        backupTab.classList.remove('show');
        window.electron.send('context-menu-closed'); // Restaurar BrowserView
    });
}

if (closeRestoreTab) {
    closeRestoreTab.addEventListener('click', () => {
        restoreTab.classList.remove('show');
        window.electron.send('context-menu-closed'); // Restaurar BrowserView
    });
}

if (cancelBackupTabBtn) {
    cancelBackupTabBtn.addEventListener('click', () => {
        backupTab.classList.remove('show');
        window.electron.send('context-menu-closed'); // Restaurar BrowserView
    });
}

if (cancelRestoreTabBtn) {
    cancelRestoreTabBtn.addEventListener('click', () => {
        restoreTab.classList.remove('show');
        window.electron.send('context-menu-closed'); // Restaurar BrowserView
    });
}

// Fechar abas ao clicar fora
if (backupTab) {
    backupTab.addEventListener('click', (e) => {
        if (e.target === backupTab) {
            backupTab.classList.remove('show');
            window.electron.send('context-menu-closed'); // Restaurar BrowserView
        }
    });
}

if (restoreTab) {
    restoreTab.addEventListener('click', (e) => {
        if (e.target === restoreTab) {
            restoreTab.classList.remove('show');
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

// ========================================
// SISTEMA REAL DE MODO PC FRACO
// ========================================

let weakPCMode = false;
const MAX_LOADED_ACCOUNTS_WEAK_PC = 5;
let loadedAccounts = new Set(); // Contas atualmente carregadas
let accountCache = new Map(); // Cache de dados das contas
let weakPCCleanupInterval = null;

// Carregar estado do modo PC fraco
async function loadWeakPCMode() {
    try {
        const isWeakPC = await window.electron.invoke('get-weak-pc-mode');
        weakPCMode = isWeakPC;
        updateWeakPCButton();
        
        if (weakPCMode) {
            applyWeakPCOptimizations();
        } else {
            // Garantir que o modo normal está ativo
            removeWeakPCOptimizations();
        }
        
        console.log('💻 Modo PC fraco carregado:', weakPCMode);
        console.log('✅ Estado do modo PC fraco inicializado corretamente');
    } catch (error) {
        console.error('❌ Erro ao carregar modo PC fraco:', error);
        // Em caso de erro, garantir que o modo normal está ativo
        weakPCMode = false;
        removeWeakPCOptimizations();
    }
}

// Atualizar botão do modo PC fraco
function updateWeakPCButton() {
    const weakPCBtn = document.getElementById('weak-pc-btn');
    const weakPCText = document.getElementById('weak-pc-text');
    
    if (weakPCBtn && weakPCText) {
        if (weakPCMode) {
            weakPCBtn.classList.add('active');
            weakPCText.textContent = 'PC Fraco ON';
        } else {
            weakPCBtn.classList.remove('active');
            weakPCText.textContent = 'PC Fraco';
        }
    }
    
    console.log('🔘 Botão do modo PC fraco atualizado:', weakPCMode ? 'ATIVO' : 'INATIVO');
}

// Alternar modo PC fraco
async function toggleWeakPCMode() {
    try {
        weakPCMode = !weakPCMode;
        
        // Salvar estado
        await window.electron.invoke('set-weak-pc-mode', weakPCMode);
        
        // Atualizar interface
        updateWeakPCButton();
        
        // Aplicar/remover otimizações
        if (weakPCMode) {
            console.log('💻 Modo PC fraco ATIVADO');
            showNotification('Modo PC Fraco ativado - Máximo 5 contas carregadas', 'success');
            applyWeakPCOptimizations();
        } else {
            console.log('💻 Modo PC fraco DESATIVADO');
            showNotification('Modo PC Fraco desativado - Todas as contas carregadas', 'info');
            removeWeakPCOptimizations();
        }
        
        console.log('💻 Estado do modo PC fraco atualizado:', weakPCMode);
        console.log('✅ Modo PC fraco alternado com sucesso');
    } catch (error) {
        console.error('❌ Erro ao alternar modo PC fraco:', error);
        showNotification('Erro ao alternar modo PC fraco', 'error');
    }
}

// Aplicar otimizações do modo PC fraco
function applyWeakPCOptimizations() {
    console.log('⚡ Aplicando otimizações do modo PC fraco...');
    
    // Limpeza agressiva a cada 10 segundos
    if (weakPCCleanupInterval) {
        clearInterval(weakPCCleanupInterval);
    }
    
    weakPCCleanupInterval = setInterval(() => {
        aggressiveWeakPCCleanup();
    }, 10 * 1000);
    
    // Aplicar limpeza inicial
    aggressiveWeakPCCleanup();
    
    console.log('⚡ Otimizações do modo PC fraco aplicadas');
    console.log('⚠️ Modo PC fraco ativo - Máximo 5 contas carregadas');
    console.log('🔒 Limitação de contas ativada');
}

// Remover otimizações do modo PC fraco
function removeWeakPCOptimizations() {
    console.log('⚡ Removendo otimizações do modo PC fraco...');
    
    // Parar limpeza agressiva
    if (weakPCCleanupInterval) {
        clearInterval(weakPCCleanupInterval);
        weakPCCleanupInterval = null;
    }
    
    // Restaurar todas as contas
    restoreAllAccounts();
    
    console.log('⚡ Otimizações do modo PC fraco removidas');
    console.log('✅ Modo normal ativado - Todas as contas disponíveis');
    console.log('🔓 Limitação de contas removida');
}

// Limpeza agressiva para modo PC fraco
function aggressiveWeakPCCleanup() {
    try {
        // 1. Limpar cache de avatares (manter apenas 5)
        if (avatarCache && avatarCache.size > 5) {
            const entries = Array.from(avatarCache.entries());
            const toDelete = entries.slice(0, avatarCache.size - 5);
            toDelete.forEach(([key]) => avatarCache.delete(key));
        }
        
        // 2. Limpar cache de sessões (manter apenas 3)
        if (sessionCache && sessionCache.size > 3) {
            const entries = Array.from(sessionCache.entries());
            const toDelete = entries.slice(0, sessionCache.size - 3);
            toDelete.forEach(([key]) => sessionCache.delete(key));
        }
        
        // 3. Remover imagens não essenciais
        const images = document.querySelectorAll('img');
        images.forEach(img => {
            if (!img.closest('.avatar-tab') && !img.closest('.active-account')) {
                img.remove();
            }
        });
        
        // 4. Limpar elementos órfãos
        const orphanedElements = document.querySelectorAll('.orphaned');
        orphanedElements.forEach(el => el.remove());
        
        // 5. Forçar garbage collection
        if (window.gc) {
            window.gc();
        }
        
        console.log('🧹 Limpeza agressiva do modo PC fraco executada');
    } catch (error) {
        console.error('❌ Erro na limpeza agressiva:', error);
    }
}

// SISTEMA REAL DE LIMITE DE CONTAS CARREGADAS
function manageAccountLoading(accountId) {
    if (!weakPCMode) {
        // Modo normal: todas as contas carregadas
        console.log(`✅ Modo normal: Conta ${accountId} carregada sem limitações`);
        return;
    }
    
    console.log(`🔄 Gerenciando carregamento da conta ${accountId} (Modo PC Fraco)`);
    
    // Se já está carregada, não faz nada
    if (loadedAccounts.has(accountId)) {
        console.log(`✅ Conta ${accountId} já está carregada`);
        return;
    }
    
    // Se já temos 5 contas carregadas, descarrega a mais antiga
    if (loadedAccounts.size >= MAX_LOADED_ACCOUNTS_WEAK_PC) {
        const oldestAccount = Array.from(loadedAccounts)[0];
        console.log(`⚠️ Limite atingido! Descarregando conta ${oldestAccount}`);
        unloadAccount(oldestAccount);
    }
    
    // Carrega a nova conta
    loadAccount(accountId);
}

// Carregar conta (manter dados essenciais)
function loadAccount(accountId) {
    loadedAccounts.add(accountId);
    
    // Restaurar dados do cache se existir
    if (accountCache.has(accountId)) {
        const cachedData = accountCache.get(accountId);
        const accountTab = document.querySelector(`[data-account-id="${accountId}"]`);
        if (accountTab && cachedData.avatar) {
            const img = accountTab.querySelector('img');
            if (img) {
                img.src = cachedData.avatar;
                img.style.display = 'block';
            }
        }
        console.log(`💾 Restaurando dados da conta ${accountId} do cache`);
    }
    
    console.log(`📱 Conta ${accountId} carregada (${loadedAccounts.size}/${MAX_LOADED_ACCOUNTS_WEAK_PC})`);
}

// Descarregar conta (salvar dados no cache e REMOVER FOTO)
function unloadAccount(accountId) {
    if (!loadedAccounts.has(accountId)) return;
    
    console.log(`💾 Descarregando conta ${accountId}...`);
    
    // Salvar dados no cache antes de descarregar
    const accountTab = document.querySelector(`[data-account-id="${accountId}"]`);
    if (accountTab) {
        const accountData = {
            avatar: accountTab.querySelector('img')?.src,
            name: accountTab.querySelector('.account-name')?.textContent,
            timestamp: Date.now()
        };
        accountCache.set(accountId, accountData);
        
        // REMOVER A FOTO para economizar RAM
        const img = accountTab.querySelector('img');
        if (img) {
            img.style.display = 'none';
            img.src = ''; // Limpar src para liberar memória
        }
        
        // Adicionar indicador visual de descarregada
        accountTab.classList.add('unloaded');
    }
    
    // Remover da lista de carregadas
    loadedAccounts.delete(accountId);
    
    console.log(`💾 Conta ${accountId} descarregada e salva no cache`);
}

// Restaurar todas as contas (modo normal)
function restoreAllAccounts() {
    console.log('🔄 Restaurando todas as contas...');
    
    // Restaurar todas as contas do cache
    accountCache.forEach((data, accountId) => {
        const accountTab = document.querySelector(`[data-account-id="${accountId}"]`);
        if (accountTab && data.avatar) {
            const img = accountTab.querySelector('img');
            if (img) {
                img.src = data.avatar;
                img.style.display = 'block';
            }
            accountTab.classList.remove('unloaded');
        }
    });
    
    // NÃO limpar os caches - apenas remover limitações
    // Isso permite que todas as contas permaneçam carregadas no modo normal
    
    console.log('🔄 Todas as contas restauradas - Modo normal ativado');
    console.log('✅ Limitações do modo PC fraco removidas');
    console.log('🔓 Todas as contas disponíveis sem limitações');
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
    
    
    // Aplicar tema nos dialogs customizados
    applyThemeToCustomDialogs(color);
    
    console.log('🎨 Cor personalizada aplicada:', color);
}

// Aplicar tema nos dialogs customizados
function applyThemeToCustomDialogs(color) {
    // Aplicar tema na aba de remover conta
    const removeTab = document.getElementById('remove-account-tab');
    if (removeTab) {
        const confirmBtn = removeTab.querySelector('#confirm-remove-btn');
        if (confirmBtn) {
            confirmBtn.style.background = `linear-gradient(135deg, ${color}, ${darkenColor(color, 20)})`;
            confirmBtn.style.boxShadow = `0 4px 12px ${color}40`;
        }
    }
    
    // Aplicar tema na aba de limpar sessão
    const clearTab = document.getElementById('clear-session-tab');
    if (clearTab) {
        const confirmBtn = clearTab.querySelector('#confirm-clear-btn');
        if (confirmBtn) {
            confirmBtn.style.background = `linear-gradient(135deg, ${color}, ${darkenColor(color, 20)})`;
            confirmBtn.style.boxShadow = `0 4px 12px ${color}40`;
        }
    }
    
    console.log('🎨 Tema aplicado nas abas customizadas:', color);
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

// Event listener para modo PC fraco
const weakPCBtn = document.getElementById('weak-pc-btn');
if (weakPCBtn) {
    weakPCBtn.addEventListener('click', toggleWeakPCMode);
}

// Limpeza suave de memória (apenas cache, SEM tocar em contas)
function cleanupMemory() {
  try {
    // Limpar apenas cache de avatares muito antigos (manter últimos 50 para melhor performance)
    if (avatarCache && avatarCache.size > 50) {
      const entries = Array.from(avatarCache.entries());
      const toRemove = entries.slice(0, entries.length - 50);
      toRemove.forEach(([key]) => avatarCache.delete(key));
      console.log('🧹 Cache de avatares antigos limpo (mantidos últimos 50)');
    }
    
    // Limpar apenas observadores de imagens realmente órfãs
    const observedImages = document.querySelectorAll('img[data-account-id]');
    observedImages.forEach(img => {
      if (!img.isConnected) {
        imageObserver.unobserve(img);
      }
    });
    
    // Limpar cache de sessão se muito grande
    if (sessionCache && sessionCache.size > 20) {
      const entries = Array.from(sessionCache.entries());
      const toRemove = entries.slice(0, entries.length - 20);
      toRemove.forEach(([key]) => sessionCache.delete(key));
      console.log('🧹 Cache de sessão antigo limpo');
    }
    
    console.log('✅ Limpeza suave do renderer concluída');
  } catch (error) {
    console.error('❌ Erro na limpeza de memória do renderer:', error);
  }
}

// Executar limpeza suave a cada 5 minutos (mais frequente para computadores fracos)
setInterval(cleanupMemory, 5 * 60 * 1000);

// Sistema de Confirmação Customizado
let customConfirmCallback = null;

function showCustomConfirm(title, message, type = 'warning', confirmText = 'CONFIRMAR', cancelText = 'CANCELAR') {
    return new Promise((resolve) => {
        const dialog = document.getElementById('custom-confirm-dialog');
        const titleEl = dialog.querySelector('.confirm-title');
        const messageEl = dialog.querySelector('.confirm-message');
        const confirmBtn = dialog.querySelector('.confirm-confirm');
        const cancelBtn = dialog.querySelector('.confirm-cancel');
        
        // Remover classes de tipo anteriores
        dialog.classList.remove('danger', 'warning', 'info');
        
        // Aplicar tipo
        if (type !== 'warning') {
            dialog.classList.add(type);
        }
        
        // Atualizar conteúdo
        titleEl.textContent = title;
        messageEl.textContent = message;
        confirmBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;
        
        // Mostrar dialog
        dialog.classList.add('show');
        
        // Armazenar callback
        customConfirmCallback = resolve;
    });
}

function handleCustomConfirm(result) {
    if (customConfirmCallback) {
        customConfirmCallback(result);
        customConfirmCallback = null;
    }
    closeCustomConfirm();
}

function closeCustomConfirm() {
    const dialog = document.getElementById('custom-confirm-dialog');
    dialog.classList.remove('show');
    
    if (customConfirmCallback) {
        customConfirmCallback(false);
        customConfirmCallback = null;
    }
}

// Funções globais para serem chamadas pelo onclick
window.handleCustomConfirm = handleCustomConfirm;
window.closeCustomConfirm = closeCustomConfirm;

// Sistema de confirmação customizado funcional
function showCustomConfirmSync(title, message, type = 'warning', confirmText = 'CONFIRMAR', cancelText = 'CANCELAR') {
    return new Promise((resolve) => {
        const dialog = document.getElementById('custom-confirm-dialog');
        const titleEl = dialog.querySelector('.confirm-title');
        const messageEl = dialog.querySelector('.confirm-message');
        const confirmBtn = dialog.querySelector('.confirm-confirm');
        const cancelBtn = dialog.querySelector('.confirm-cancel');
        
        // Remover classes de tipo anteriores
        dialog.classList.remove('danger', 'warning', 'info');
        
        // Aplicar tipo
        if (type !== 'warning') {
            dialog.classList.add(type);
        }
        
        // Atualizar conteúdo
        titleEl.textContent = title;
        messageEl.textContent = message;
        confirmBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;
        
        // Mostrar dialog
        dialog.classList.add('show');
        
        // Configurar callbacks
        const handleConfirm = () => {
            dialog.classList.remove('show');
            resolve(true);
            cleanup();
        };
        
        const handleCancel = () => {
            dialog.classList.remove('show');
            resolve(false);
            cleanup();
        };
        
        const cleanup = () => {
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            document.removeEventListener('keydown', handleKeydown);
        };
        
        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                handleCancel();
            }
        };
        
        // Event listeners
        confirmBtn.onclick = handleConfirm;
        cancelBtn.onclick = handleCancel;
        document.addEventListener('keydown', handleKeydown);
        
        // Fechar ao clicar no X
        dialog.querySelector('.confirm-close').onclick = handleCancel;
    });
}

// Substituir confirm nativo por customizado
window.originalConfirm = window.confirm;
window.confirm = function(message) {
    return showCustomConfirmSync('Confirmar', message, 'warning', 'OK', 'Cancelar');
};

// Escutar eventos do main process para confirmação customizada
if (window.electron && window.electron.ipcRenderer) {
    window.electron.ipcRenderer.on('show-custom-confirm', async (event, data) => {
        try {
            const result = await showCustomConfirmSync(data.title, data.message, data.type, data.confirmText, data.cancelText);
            window.electron.ipcRenderer.send('custom-confirm-response', result);
        } catch (error) {
            console.error('❌ Erro no sistema customizado:', error);
            window.electron.ipcRenderer.send('custom-confirm-response', false);
        }
    });
}

// Sistema de dialogs customizados baseado no sistema de renomear
let currentDialogCallback = null;

// Inicializar dialogs customizados quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    console.log('🔧 Inicializando dialogs customizados...');
    
    // Verificar se os elementos existem
    const removeDialog = document.getElementById('remove-account-dialog');
    const clearDialog = document.getElementById('clear-session-dialog');
    
    console.log('🔧 Dialogs encontrados:', {
        remove: !!removeDialog,
        clear: !!clearDialog
    });
    
    if (removeDialog && clearDialog) {
        console.log('✅ Dialogs customizados inicializados com sucesso');
    } else {
        console.error('❌ Erro ao inicializar dialogs customizados');
    }
});

// Função para mostrar dialog de remover conta
function showRemoveAccountDialog(accountId) {
    console.log('🔧 showRemoveAccountDialog chamada para:', accountId);
    return new Promise((resolve) => {
        currentDialogCallback = resolve;
        
        // Aguardar um pouco para garantir que o DOM está pronto
        setTimeout(() => {
            const dialog = document.getElementById('remove-account-dialog');
            console.log('🔧 Dialog encontrado:', !!dialog);
            
            if (!dialog) {
                console.error('❌ Dialog remove-account-dialog não encontrado');
                resolve(false);
                return;
            }
            
            dialog.classList.add('show');
            
            // Aplicar tema dinâmico ao dialog
            applyThemeToCustomDialogs(document.documentElement.style.getPropertyValue('--gragas-orange') || '#FF6B35');
            
            // Event listeners
            const confirmBtn = document.getElementById('confirm-remove-btn');
            const cancelBtn = document.getElementById('cancel-remove-btn');
            const closeBtn = document.getElementById('close-remove-dialog');
            
            console.log('🔧 Botões encontrados:', {
                confirm: !!confirmBtn,
                cancel: !!cancelBtn,
                close: !!closeBtn
            });
            
            if (!confirmBtn || !cancelBtn || !closeBtn) {
                console.error('❌ Botões do dialog não encontrados');
                resolve(false);
                return;
            }
            
            const handleConfirm = () => {
                console.log('🔧 Botão confirmar clicado');
                dialog.classList.remove('show');
                resolve(true);
                cleanup();
            };
            
            const handleCancel = () => {
                console.log('🔧 Botão cancelar clicado');
                dialog.classList.remove('show');
                resolve(false);
                cleanup();
            };
            
            const cleanup = () => {
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                closeBtn.removeEventListener('click', handleCancel);
                dialog.removeEventListener('click', handleBackdrop);
            };
            
            const handleBackdrop = (e) => {
                if (e.target === dialog) {
                    handleCancel();
                }
            };
            
            // Adicionar event listeners
            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            closeBtn.addEventListener('click', handleCancel);
            dialog.addEventListener('click', handleBackdrop);
            
            console.log('🔧 Event listeners adicionados ao dialog de remover');
        }, 100); // Aguardar 100ms para garantir que o DOM está pronto
    });
}

// Função para mostrar dialog de limpar sessão
function showClearSessionDialog(accountId) {
    console.log('🔧 showClearSessionDialog chamada para:', accountId);
    return new Promise((resolve) => {
        currentDialogCallback = resolve;
        
        // Aguardar um pouco para garantir que o DOM está pronto
        setTimeout(() => {
            const dialog = document.getElementById('clear-session-dialog');
            console.log('🔧 Dialog encontrado:', !!dialog);
            
            if (!dialog) {
                console.error('❌ Dialog clear-session-dialog não encontrado');
                resolve(false);
                return;
            }
            
            dialog.classList.add('show');
            
            // Aplicar tema dinâmico ao dialog
            applyThemeToCustomDialogs(document.documentElement.style.getPropertyValue('--gragas-orange') || '#FF6B35');
            
            // Event listeners
            const confirmBtn = document.getElementById('confirm-clear-btn');
            const cancelBtn = document.getElementById('cancel-clear-btn');
            const closeBtn = document.getElementById('close-clear-dialog');
            
            console.log('🔧 Botões encontrados:', {
                confirm: !!confirmBtn,
                cancel: !!cancelBtn,
                close: !!closeBtn
            });
            
            if (!confirmBtn || !cancelBtn || !closeBtn) {
                console.error('❌ Botões do dialog não encontrados');
                resolve(false);
                return;
            }
            
            const handleConfirm = () => {
                console.log('🔧 Botão confirmar clicado');
                dialog.classList.remove('show');
                resolve(true);
                cleanup();
            };
            
            const handleCancel = () => {
                console.log('🔧 Botão cancelar clicado');
                dialog.classList.remove('show');
                resolve(false);
                cleanup();
            };
            
            const cleanup = () => {
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                closeBtn.removeEventListener('click', handleCancel);
                dialog.removeEventListener('click', handleBackdrop);
            };
            
            const handleBackdrop = (e) => {
                if (e.target === dialog) {
                    handleCancel();
                }
            };
            
            // Adicionar event listeners
            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            closeBtn.addEventListener('click', handleCancel);
            dialog.addEventListener('click', handleBackdrop);
            
            console.log('🔧 Event listeners adicionados ao dialog de limpar sessão');
        }, 100); // Aguardar 100ms para garantir que o DOM está pronto
    });
}

// Limpeza agressiva de memória para computadores fracos
function aggressiveRendererCleanup() {
  try {
    console.log('🧹 Iniciando limpeza agressiva do renderer...');
    
    // LIMPEZA AGRESSIVA: Manter apenas 20 avatars mais recentes
    if (avatarCache && avatarCache.size > 20) {
      const entries = Array.from(avatarCache.entries());
      const toRemove = entries.slice(0, entries.length - 20); // Manter apenas 20 mais recentes
      toRemove.forEach(([key]) => avatarCache.delete(key));
      console.log('🧹 Cache de avatares reduzido drasticamente (mantidos 20 mais recentes)');
    }
    
    // LIMPEZA AGRESSIVA: Manter apenas 10 sessões mais recentes
    if (sessionCache && sessionCache.size > 10) {
      const entries = Array.from(sessionCache.entries());
      const toRemove = entries.slice(0, entries.length - 10); // Manter apenas 10 mais recentes
      toRemove.forEach(([key]) => sessionCache.delete(key));
      console.log('🧹 Cache de sessão reduzido drasticamente (mantidos 10 mais recentes)');
    }
    
    // LIMPEZA AGRESSIVA: Remover TODAS as imagens não essenciais
    const allImages = document.querySelectorAll('img');
    allImages.forEach(img => {
      // Manter apenas avatars da conta ativa
      if (!img.closest('.avatar-tab.active') && !img.closest('.avatar-circle.active')) {
        img.src = '';
        img.remove();
      }
    });
    
    // Limpar elementos DOM órfãos
    const orphanedElements = document.querySelectorAll('[data-account-id]:not(.active)');
    orphanedElements.forEach(el => {
      if (!el.isConnected || el.offsetParent === null) {
        el.remove();
      }
    });
    
    // Limpar observadores de imagens órfãs
    const observedImages = document.querySelectorAll('img[data-account-id]');
    observedImages.forEach(img => {
      if (!img.isConnected) {
        imageObserver.unobserve(img);
      }
    });
    
    // Forçar garbage collection se disponível
    if (window.gc) {
      window.gc();
      console.log('🗑️ Garbage collection forçado no renderer');
    }
    
    console.log('✅ Limpeza agressiva do renderer concluída');
  } catch (error) {
    console.error('❌ Erro na limpeza agressiva do renderer:', error);
  }
}

// Limpeza agressiva a cada 1 minuto para reduzir RAM drasticamente
setInterval(aggressiveRendererCleanup, 1 * 60 * 1000);

// Função de otimização de performance sem lazy loading
function optimizePerformance() {
  try {
    console.log('⚡ Otimizando performance...');
    
    // Otimização: Reduzir frequência de atualizações
    let updateTimeout;
    const debouncedUpdate = () => {
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        // Atualizar apenas elementos visíveis
        const visibleElements = document.querySelectorAll('.avatar-tab:not([style*="display: none"])');
        console.log(`📊 ${visibleElements.length} elementos visíveis otimizados`);
      }, 100);
    };
    
    // Observer para otimizar elementos quando saem da tela
    const performanceObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) {
          // Pausar animações em elementos fora da tela
          entry.target.style.willChange = 'auto';
        } else {
          // Reativar quando volta à tela
          entry.target.style.willChange = 'transform';
        }
      });
    });
    
    // Aplicar observer a todos os avatares
    const avatarTabs = document.querySelectorAll('.avatar-tab');
    avatarTabs.forEach(tab => performanceObserver.observe(tab));
    
    console.log('✅ Performance otimizada');
  } catch (error) {
    console.error('❌ Erro na otimização de performance:', error);
  }
}

// Implementar otimização quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', optimizePerformance);

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
    
    // Inicializar melhorias de feedback visual
    initializeVisualFeedback();
    
