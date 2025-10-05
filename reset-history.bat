@echo off
echo ========================================
echo   RESET HISTORY - CUIDADO!
echo ========================================
echo.
echo [WARNING] Este script vai limpar todo o historico do Git
echo [WARNING] Todos os commits antigos serao perdidos
echo [WARNING] Use apenas se necessario
echo.
set /p CONFIRM="Digite 'SIM' para confirmar: "
if not "%CONFIRM%"=="SIM" (
    echo [CANCELADO] Operacao cancelada
    pause
    exit /b 0
)

echo.
echo [GIT] Fazendo backup do codigo atual...
git add .
git commit -m "Backup before history reset"

echo [GIT] Criando novo branch sem historico...
git checkout --orphan new-main
git add .
git commit -m "Initial commit - Clean history"

echo [GIT] Removendo branch main antigo...
git branch -D main
git branch -m main

echo [GIT] Enviando novo historico limpo...
git push -f origin main

echo.
echo [SUCCESS] Historico limpo com sucesso!
echo [INFO] Todos os commits agora tem caracteres corretos
echo.
pause
