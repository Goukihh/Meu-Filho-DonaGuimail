@echo off
echo ========================================
echo    PUBLICANDO RELEASE NO GITHUB
echo ========================================
echo.

echo 📦 Instalando dependências...
call npm install

echo.
echo 🔨 Criando release e publicando no GitHub...
call npm run build:release

echo.
echo ✅ Release publicada com sucesso!
echo 🎯 O auto-updater verificará automaticamente por atualizações
echo.

echo 📋 Para publicar uma nova versão:
echo    1. Atualize a versão no package.json
echo    2. Execute: publish-release.bat
echo    3. Os usuários receberão a atualização automaticamente
echo.

pause

