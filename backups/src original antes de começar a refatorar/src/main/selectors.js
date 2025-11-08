/**
 * 🎯 Seletores centralizados do Discord
 * 
 * Este arquivo contém todas as estratégias para encontrar elementos do Discord.
 * Centralizar aqui facilita manutenção quando o Discord muda o layout.
 * 
 * Cada função retorna um objeto com:
 * - success: boolean
 * - element: HTMLElement | null
 * - method: string (qual estratégia funcionou)
 */

/**
 * Encontra a aba "Friends" na sidebar (não confundir com "Activity")
 */
function findFriendsSidebar() {
  console.log('[SELECTORS] Procurando aba Friends na sidebar...');
  
  const strategies = [
    {
      name: 'href="/channels/@me"',
      fn: () => document.querySelector('a[href="/channels/@me"]')
    },
    {
      name: 'data-list-item-id*="friends"',
      fn: () => document.querySelector('nav a[data-list-item-id*="friends"]')
    },
    {
      name: 'aria-label="Friends"',
      fn: () => document.querySelector('a[aria-label*="Friends"]')
    },
    {
      name: 'aria-label="Amigos"',
      fn: () => document.querySelector('a[aria-label*="Amigos"]')
    },
    {
      name: 'text search "Friends"',
      fn: () => {
        const links = Array.from(document.querySelectorAll('nav a'));
        return links.find(a => {
          const text = a.textContent.trim().toLowerCase();
          return text === 'friends' || text === 'amigos';
        });
      }
    }
  ];
  
  for (const strategy of strategies) {
    try {
      const element = strategy.fn();
      if (element && element.offsetParent !== null) {
        console.log(`[SELECTORS] ✅ Friends encontrado via: ${strategy.name}`);
        return { success: true, element, method: strategy.name };
      }
    } catch (error) {
      console.log(`[SELECTORS] ⚠️ Erro na estratégia ${strategy.name}:`, error.message);
    }
  }
  
  console.log('[SELECTORS] ❌ Friends sidebar não encontrado');
  return { success: false, element: null, method: 'none' };
}

/**
 * Encontra o botão "Add Friend" na área principal
 */
function findAddFriendButton() {
  console.log('[SELECTORS] Procurando botão Add Friend...');
  
  const strategies = [
    {
      name: 'text exact match',
      fn: () => {
        const allClickable = Array.from(document.querySelectorAll('div, span, button, a'));
        for (const el of allClickable) {
          const text = (el.textContent || '').trim();
          if ((text === 'Add Friend' || text === 'Adicionar Amigo') && el.offsetParent !== null) {
            let clickable = el;
            if (el.tagName !== 'BUTTON' && el.tagName !== 'A') {
              clickable = el.closest('button, a, div[role="button"], div[class*="item"]');
            }
            return clickable;
          }
        }
        return null;
      }
    },
    {
      name: 'id*="add_friend-tab"',
      fn: () => document.querySelector('div[id*="add_friend-tab"]')
    },
    {
      name: 'id*="addFriend"',
      fn: () => document.querySelector('div[id*="addFriend"]')
    },
    {
      name: 'aria-label="Add Friend"',
      fn: () => document.querySelector('div[aria-label="Add Friend"]')
    },
    {
      name: 'class*="addFriend"',
      fn: () => document.querySelector('[class*="addFriend"]')
    },
    {
      name: 'role="tab" with text',
      fn: () => {
        const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
        return tabs.find(tab => {
          const text = tab.textContent.trim();
          return text === 'Add Friend' || text === 'Adicionar Amigo';
        });
      }
    }
  ];
  
  for (const strategy of strategies) {
    try {
      const element = strategy.fn();
      if (element && element.offsetParent !== null) {
        console.log(`[SELECTORS] ✅ Add Friend encontrado via: ${strategy.name}`);
        return { success: true, element, method: strategy.name };
      }
    } catch (error) {
      console.log(`[SELECTORS] ⚠️ Erro na estratégia ${strategy.name}:`, error.message);
    }
  }
  
  console.log('[SELECTORS] ❌ Add Friend não encontrado');
  return { success: false, element: null, method: 'none' };
}

/**
 * Encontra a aba "All" (para ver todos os amigos)
 */
function findAllTab() {
  console.log('[SELECTORS] Procurando aba ALL...');
  
  const strategies = [
    {
      name: 'text exact match',
      fn: () => {
        const allClickable = Array.from(document.querySelectorAll('div, button, span, a'));
        for (const el of allClickable) {
          const text = (el.textContent || '').trim().toLowerCase();
          if ((text === 'all' || text === 'todos') && el.offsetParent !== null) {
            let clickable = el;
            if (el.tagName !== 'BUTTON' && el.tagName !== 'A') {
              clickable = el.closest('button, a, div[role="button"], div[role="tab"], div[class*="item"]');
            }
            return clickable;
          }
        }
        return null;
      }
    },
    {
      name: 'role="tab" with text',
      fn: () => {
        const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
        return tabs.find(tab => {
          const text = tab.textContent.trim().toLowerCase();
          return text === 'all' || text === 'todos';
        });
      }
    },
    {
      name: 'id*="all"',
      fn: () => document.querySelector('div[id*="all"]')
    },
    {
      name: 'data-list-item-id*="all"',
      fn: () => document.querySelector('div[data-list-item-id*="all"]')
    },
    {
      name: 'aria-label*="All"',
      fn: () => document.querySelector('[aria-label*="All"]')
    }
  ];
  
  for (const strategy of strategies) {
    try {
      const element = strategy.fn();
      if (element && element.offsetParent !== null) {
        console.log(`[SELECTORS] ✅ ALL encontrado via: ${strategy.name}`);
        return { success: true, element, method: strategy.name };
      }
    } catch (error) {
      console.log(`[SELECTORS] ⚠️ Erro na estratégia ${strategy.name}:`, error.message);
    }
  }
  
  console.log('[SELECTORS] ❌ ALL não encontrado');
  return { success: false, element: null, method: 'none' };
}

/**
 * Encontra o input de adicionar amigo (campo de texto)
 */
function findAddFriendInput() {
  console.log('[SELECTORS] Procurando input de adicionar amigo...');
  
  const strategies = [
    {
      name: 'name="add-friend"',
      fn: () => document.querySelector('input[name="add-friend"]')
    },
    {
      name: 'placeholder containing "username"',
      fn: () => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
        return inputs.find(input => {
          const placeholder = (input.placeholder || '').toLowerCase();
          return placeholder.includes('username') || placeholder.includes('usuário');
        });
      }
    },
    {
      name: 'aria-label containing "friend"',
      fn: () => document.querySelector('input[aria-label*="friend" i]')
    }
  ];
  
  for (const strategy of strategies) {
    try {
      const element = strategy.fn();
      if (element && element.offsetParent !== null) {
        console.log(`[SELECTORS] ✅ Input encontrado via: ${strategy.name}`);
        return { success: true, element, method: strategy.name };
      }
    } catch (error) {
      console.log(`[SELECTORS] ⚠️ Erro na estratégia ${strategy.name}:`, error.message);
    }
  }
  
  console.log('[SELECTORS] ❌ Input não encontrado');
  return { success: false, element: null, method: 'none' };
}

// Exportar para uso no main.js via executeJavaScript
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    findFriendsSidebar,
    findAddFriendButton,
    findAllTab,
    findAddFriendInput
  };
}
