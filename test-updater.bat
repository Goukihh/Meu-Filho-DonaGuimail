@echo off
echo ========================================
echo   TESTE DO AUTO-UPDATER
echo ========================================
echo.

echo [INFO] Este script testa o auto-updater localmente
echo [INFO] Certifique-se de ter a versao mais recente instalada
echo.

echo [BUILD] Compilando versao de teste...
npm run build:single

echo.
echo [INFO] Build concluido! Agora teste:
echo [INFO] 1. Abra a versao instalada (v1.0.9)
echo [INFO] 2. Aguarde 3 segundos
echo [INFO] 3. Deve aparecer notificacao de atualizacao
echo.
pause
