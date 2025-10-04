# 🚀 Como Criar o Instalador do Meu Filho

## 📦 Instalador Profissional

O instalador criado será igual ao Google Chrome - um arquivo .exe que instala o aplicativo no computador e **salva todos os dados permanentemente**.

## 🎯 Características do Instalador:

### ✅ **Persistência de Dados:**
- **Dados salvos permanentemente** em `%APPDATA%/Meu Filho/`
- **Não deleta dados** ao desinstalar
- **Backup automático** das contas
- **Atualizações preservam** todos os logins

### ✅ **Interface Profissional:**
- **Instalador com interface** igual ao Chrome
- **Escolher diretório** de instalação
- **Criar atalhos** no desktop e menu iniciar
- **Categoria "Social"** no menu iniciar
- **Ícone personalizado** em todos os lugares

## 🔨 Como Criar o Instalador:

### **Método 1: Script Automático (Recomendado)**
```bash
# Execute o arquivo .bat
build-installer.bat
```

### **Método 2: Comando Manual**
```bash
# Instalar dependências
npm install

# Criar instalador
npm run build:single
```

## 📁 Resultado:

Após criar o instalador, você terá:
```
dist/
└── Meu Filho Setup 1.0.0.exe    # Instalador profissional
```

## 🎯 Como Distribuir:

### **1. Upload para GitHub:**
- Faça upload do arquivo `Meu Filho Setup 1.0.0.exe` para o GitHub
- Crie uma release com o instalador
- Pessoas podem baixar e instalar

### **2. Instalação pelo Usuário:**
1. **Baixar** o arquivo .exe
2. **Executar** o instalador
3. **Escolher** diretório de instalação
4. **Instalar** com atalhos automáticos
5. **Dados salvos** permanentemente

## 🔄 Atualizações:

### **Para o Usuário:**
1. **Desinstalar** versão antiga
2. **Instalar** nova versão
3. **Dados preservados** automaticamente
4. **Todas as contas** mantidas

### **Para o Desenvolvedor:**
1. **Criar nova versão** no package.json
2. **Executar** `build-installer.bat`
3. **Upload** novo instalador
4. **Usuários atualizam** sem perder dados

## 📍 Localização dos Dados:

Os dados são salvos em:
```
%APPDATA%/Meu Filho/
├── accounts.json          # Contas salvas
├── sessions/              # Sessões do Discord
├── cache/                 # Cache do navegador
└── logs/                  # Logs do aplicativo
```

## 🎉 Vantagens:

- ✅ **Instalador profissional** igual ao Chrome
- ✅ **Dados permanentes** mesmo ao desinstalar
- ✅ **Atualizações preservam** tudo
- ✅ **Atalhos automáticos** criados
- ✅ **Interface familiar** para usuários
- ✅ **Fácil distribuição** via GitHub

## 🚀 Comando Final:

```bash
# Execute este comando para criar o instalador
build-installer.bat
```

**O arquivo `Meu Filho Setup 1.0.0.exe` estará pronto para distribuição!** 🎉
