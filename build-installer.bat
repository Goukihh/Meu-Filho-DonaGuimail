@echo off
cd /d "%~dp0"
echo ========================================
echo    DESENVOLVIMENTO - MEU FILHO
echo ========================================
echo.

echo [INFO] Instalando dependencias...
call npm install

echo.
echo [DEV] Iniciando modo desenvolvimento...
echo [INFO] O app vai abrir automaticamente
echo [INFO] Pressione Ctrl+C para parar
echo.

call npm start

echo.
echo [INFO] Desenvolvimento finalizado
echo.

pause

