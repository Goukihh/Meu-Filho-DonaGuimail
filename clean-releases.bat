@echo off
echo ========================================
echo   CLEAN RELEASES - REMOVER DUPLICATAS
echo ========================================
echo.

echo [INFO] Este script remove releases duplicadas do GitHub
echo [INFO] Use apenas se necessario
echo.

set /p CONFIRM="Digite 'SIM' para confirmar: "
if not "%CONFIRM%"=="SIM" (
    echo [CANCELADO] Operacao cancelada
    pause
    exit /b 0
)

echo.
echo [GIT] Removendo tag v1.0.7 local...
git tag -d v1.0.7 2>nul

echo [GIT] Removendo tag v1.0.7 do GitHub...
git push origin :refs/tags/v1.0.7 2>nul

echo.
echo [SUCCESS] Tag v1.0.7 removida!
echo [INFO] Agora voce pode executar o release-final.bat novamente
echo [INFO] Ou criar uma nova versao (ex: 1.0.8)
echo.
pause
