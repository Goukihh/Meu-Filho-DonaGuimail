// Centraliza toda lógica de manipulação de nicks (módulo isolado)
const fs = require('fs');
const path = require('path');
const os = require('os');

// Internals prefixados para evitar colisões de nomes com outros módulos
// Determinar o diretório userData do Electron quando possível para
// garantir que lemos/escrevemos o mesmo `loaded-nicks.json` que o main
let _nm_loadedNicksList = [];
let _nm_loadedNicksPath;

// Preferir sempre o userData (AppData/Library/Application Support) para persistência.
// Somente usar um fallback seguro dentro do diretório do usuário (~/.config ou %APPDATA%)
try {
  const electron = require('electron');
  const app = (electron && electron.app) ? electron.app : (electron.remote && electron.remote.app ? electron.remote.app : null);
  const userDataDir = app && typeof app.getPath === 'function'
    ? app.getPath('userData')
    : (process.env.APPDATA || path.join(os.homedir(), 'meu-filho'));
  _nm_loadedNicksPath = path.join(userDataDir, 'loaded-nicks.json');
} catch (e) {
  // Em ambientes non-Electron, usar um fallback seguro no diretório do usuário
  const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.config'));
  _nm_loadedNicksPath = path.join(appData, 'meu-filho', 'loaded-nicks.json');
}

function load() {
  if (fs.existsSync(_nm_loadedNicksPath)) {
    try {
      const data = fs.readFileSync(_nm_loadedNicksPath, 'utf8');
      const obj = JSON.parse(data);
      if (Array.isArray(obj)) {
        _nm_loadedNicksList = obj;
      } else if (obj && Array.isArray(obj.nicks)) {
        _nm_loadedNicksList = obj.nicks;
      } else {
        _nm_loadedNicksList = [];
      }
    } catch (e) {
      _nm_loadedNicksList = [];
    }
  } else {
    _nm_loadedNicksList = [];
  }
  return getList();
}

function save() {
  const payload = { nicks: _nm_loadedNicksList };
  try {
    // Garantir diretório antes de escrever
    try { fs.mkdirSync(path.dirname(_nm_loadedNicksPath), { recursive: true }); } catch (_) { /* ignore */ }
    fs.writeFileSync(_nm_loadedNicksPath, JSON.stringify(payload, null, 2));
  } catch (e) {
    // Não propagar erro sincrono do gerenciador; caller pode logar
    try { console.warn('nicks-manager: save error', e && e.message ? e.message : e); } catch (_) { /* ignore */ }
  }
}

function getCount() {
  return Array.isArray(_nm_loadedNicksList) ? _nm_loadedNicksList.length : 0;
}

function peek() {
  return Array.isArray(_nm_loadedNicksList) && _nm_loadedNicksList.length > 0 ? _nm_loadedNicksList[0] : null;
}

function claimNext() {
  if (!Array.isArray(_nm_loadedNicksList) || _nm_loadedNicksList.length === 0) return null;
  const nick = _nm_loadedNicksList.shift();
  save();
  return nick;
}

function getList() {
  return Array.isArray(_nm_loadedNicksList) ? [..._nm_loadedNicksList] : [];
}

function setList(arr) {
  _nm_loadedNicksList = Array.isArray(arr) ? [...arr] : [];
  save();
}

module.exports = {
  load,
  save,
  getCount,
  peek,
  claimNext,
  getList,
  setList,
};
