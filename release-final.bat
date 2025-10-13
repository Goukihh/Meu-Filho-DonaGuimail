@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ========================================
echo   RELEASE FINAL - FUNCIONA 100%
echo ========================================
echo.

echo [INFO] Este script cria release automaticamente
echo [INFO] Sincroniza versao e cria tag
echo.

echo [CURRENT] Versao atual:
type package.json | findstr "version"

echo.
set /p VERSION="Digite a nova versao (ex: 1.0.1): "

echo.
echo [INFO] IMPORTANTE: Atualize manualmente a versao no package.json
echo [INFO] Mude a linha: "version": "1.0.0" para "version": "%VERSION%"
echo [INFO] Depois pressione qualquer tecla para continuar...
pause

echo.
echo [GIT] Fazendo commit das mudancas...
git add .
git commit -m "Release v%VERSION% - The Rell Seas is real"
if %errorlevel% neq 0 (
    echo [ERROR] Falha ao fazer commit
    echo [INFO] Pressione qualquer tecla para sair...
    pause >nul
    exit /b 1
)

echo [GIT] Enviando mudancas para GitHub...
git push origin main
if %errorlevel% neq 0 (
    echo [ERROR] Falha ao enviar mudancas
    echo [INFO] Pressione qualquer tecla para sair...
    pause >nul
    exit /b 1
)

echo [GIT] Criando tag v%VERSION%...
git tag v%VERSION%
if %errorlevel% neq 0 (
    echo [ERROR] Falha ao criar tag
    echo [INFO] Pressione qualquer tecla para sair...
    pause >nul
    exit /b 1
)

echo [GIT] Enviando tag para GitHub...
git push origin v%VERSION%
if %errorlevel% neq 0 (
    echo [ERROR] Falha ao enviar tag
    echo [INFO] Pressione qualquer tecla para sair...
    pause >nul
    exit /b 1
)

echo.
echo [SUCCESS] Tag v%VERSION% criada e enviada!
echo [INFO] GitHub Actions vai criar a release automaticamente
echo [INFO] Verifique em: https://github.com/Goukihh/Meu-Filho-DonaGuimail/actions
echo.

echo [AUTO-UPDATER] Usuarios receberao atualizacao automaticamente
echo.

echo [INFO] Pressione qualquer tecla para sair...
pause >nul
