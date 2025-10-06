@echo off
cd /d "%~dp0"
echo ========================================
echo    BUILD RELEASE - MEU FILHO
echo ========================================
echo.

echo [INFO] Instalando dependencias...
call npm install

echo.
echo [BUILD] Criando instalador...
call npm run build:single

echo.
echo [SUCCESS] Instalador criado com sucesso!
echo [LOCATION] Localizacao: dist\Meu Filho Setup 1.0.0.exe
echo.

echo [FEATURES] O instalador:
echo    - Salva dados permanentemente
echo    - Nao deleta dados ao desinstalar
echo    - Cria atalhos no desktop e menu iniciar
echo    - Permite escolher diretorio de instalacao
echo.

pause



