---
applyTo: '**'
---
# Instruções para o Assistente AI

## PROCEDIMENTOS DE SEGURANÇA
⚠️ ANTES DE QUALQUER MODIFICAÇÃO NO CÓDIGO:

1. Criar backup local dos arquivos que serão modificados:
```powershell
# Criar pasta de backup com data/hora
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = "backup_$timestamp"
New-Item -ItemType Directory -Path $backupDir

# Copiar arquivos específicos
# Exemplo: se for modificar src/main.js:
Copy-Item "src/main.js" "$backupDir/main.js.backup"
Copy-Item "src/renderer" "$backupDir/renderer" -Recurse
```

2. Para projetos maiores, criar zip do diretório:
```powershell
# Backup da pasta inteira
$zipName = "projeto_backup_$timestamp.zip"
Compress-Archive -Path "." -DestinationPath $zipName -Force
```

3. SEMPRE informar antes de modificar:
- Quais arquivos serão alterados
- Que mudanças serão feitas
- Possíveis impactos
- Aguardar confirmação do usuário

## CONTEXTO DO PROJETO

### Estrutura Principal
- `src/main.js`: Arquivo principal
- `src/main/`: Core do Electron
- `src/renderer/`: Interface/UI
- `src/assets/`: Recursos

### Tecnologias
- Electron
- Discord API
- Node.js

### Objetivos Críticos
- Mascaramento do navegador
- Múltiplas contas
- Performance
- Segurança
- Automação de tarefas

## REGRAS DE DESENVOLVIMENTO

1. Padrões de Código:
   - Manter compatibilidade
   - Documentar mudanças
   - Testar antes de aplicar

2. Segurança:
   - Nada de tokens/credenciais
   - Verificar mascaramento
   - Testar isolamento de contas

3. Performance:
   - Evitar loops pesados
   - Otimizar recursos
   - Testar com várias contas

## PROCESSO DE RESTAURAÇÃO

Se algo der errado:
1. Restaurar dos backups locais:
```powershell
# Restaurar arquivo específico
Copy-Item "backup_[DATA]/arquivo.backup" "src/arquivo" -Force

# Ou restaurar pasta inteira
Expand-Archive "projeto_backup_[DATA].zip" "restore_temp"
Copy-Item "restore_temp/*" "." -Recurse -Force
```

2. Manter histórico de backups:
- Pasta `backups/` no seu PC (fora do repo)
- Nunca commitar ou pushar backups
- Organizar por data/feature

## EM CADA NOVO CHAT

1. Ler estas instruções
2. Verificar estado atual:
   - Branch ativo
   - Arquivos modificados
   - Commits pendentes

3. Antes de cada tarefa:
   - Criar backup
   - Informar mudanças
   - Aguardar confirmação

4. Após mudanças:
   - Testar funcionamento
   - Verificar segurança
   - Confirmar com usuário

## OBSERVAÇÕES IMPORTANTES

- Manter backups organizados
- Documentar todas as mudanças
- Priorizar segurança
- Confirmar cada passo com usuário
- Testar em ambiente de desenvolvimento

## LOCALIZAÇÃO DOS BACKUPS

- Pasta `backups/` no seu computador (fora do repositório)
- Subpastas por data (YYYYMMDD_HHMMSS)
- Arquivos .zip para backups completos
- Pastas específicas para features/mudanças

## COMANDOS ÚTEIS

```powershell
# Criar backup completo
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupPath = "..\backups\$timestamp"
New-Item -ItemType Directory -Path $backupPath
Copy-Item "." $backupPath -Recurse

# Backup em ZIP
$zipName = "..\backups\backup_$timestamp.zip"
Compress-Archive -Path "." -DestinationPath $zipName -Force

# Restaurar backup específico
Copy-Item "..\backups\[DATA]\*" "." -Recurse -Force

# Restaurar de ZIP
Expand-Archive "..\backups\backup_[DATA].zip" "." -Force
```

## FLUXO DE TRABALHO

1. Receber solicitação
2. Criar backup
3. Informar plano
4. Aguardar confirmação
5. Executar mudanças
6. Testar
7. Confirmar com usuário

---
⚠️ LEMBRE-SE: Segurança e backups primeiro, sempre!