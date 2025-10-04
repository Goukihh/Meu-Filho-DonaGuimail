@echo off
echo ========================================
echo   REMOVENDO PASTA DIST DO GIT
echo ========================================
echo.

echo 🗑️ Removendo pasta dist do controle de versão...
git rm -r --cached dist
git commit -m "Remove dist folder from version control"

echo.
echo ✅ Pasta dist removida do Git!
echo 📝 A pasta dist agora será ignorada pelo .gitignore
echo.

pause
