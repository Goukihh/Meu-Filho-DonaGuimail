@echo off
echo ========================================
echo    CRIANDO INSTALADOR DO MEU FILHO
echo ========================================
echo.

echo 📦 Instalando dependências...
call npm install

echo.
echo 🔨 Criando instalador...
call npm run build:single

echo.
echo ✅ Instalador criado com sucesso!
echo 📁 Localização: dist\Meu Filho Setup 1.0.0.exe
echo.

echo 🎯 O instalador:
echo    - Salva dados permanentemente
echo    - Não deleta dados ao desinstalar
echo    - Cria atalhos no desktop e menu iniciar
echo    - Permite escolher diretório de instalação
echo.

pause
