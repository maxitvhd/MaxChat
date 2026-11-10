# Guia de Deploy Automático - MaxChat (Whaticket)

Este documento descreve como funciona o deploy automático para o servidor de produção e como executá-lo com um único comando.

---

## 1. Como fazer o Deploy Automático (1 Comando)

Na raiz do projeto (`/Users/maximooficial/Documents/Projetos/whaticket`) ou dentro da pasta `src` (`/Users/maximooficial/Documents/Projetos/whaticket/src`), execute:

```bash
# Modo automático (faz commit se houver alterações, envia ao GitHub e compila o que mudou)
./deploy.sh

# Passando uma mensagem de commit personalizada no modo automático:
./deploy.sh auto "fix(tickets): ajuste no fechamento de conversa"

# Forçar deploy apenas do Backend:
./deploy.sh backend "fix(backend): ajuste no serviço de tickets"

# Forçar deploy apenas do Frontend:
./deploy.sh frontend "feat(frontend): ajuste visual na listagem"

# Forçar deploy completo (Backend + Frontend):
./deploy.sh all "release: atualização completa do sistema"
```

---

## 2. O que o script `deploy.sh` faz automaticamente

1. **Verifica alterações locais (`git status`):**
   - Se houver arquivos modificados sem commit, adiciona (`git add -A`) e cria o commit automaticamente em PT-BR.
2. **Identifica os módulos alterados:**
   - No modo `auto`, verifica se o commit alterou `backend/`, `frontend/` ou ambos para compilar apenas o necessário e economizar tempo.
3. **Envia para o GitHub:**
   - Executa `git push origin master` para o repositório `https://github.com/maxitvhd/MaxChat.git`.
4. **Atualiza o Servidor de Produção via SSH:**
   - Conecta ao servidor em `/root/MaxChat` (usando as variáveis do arquivo local `src/.deploy.env`, que fica no `.gitignore` para não expor senhas no GitHub).
   - Executa `git fetch origin && git merge --no-edit origin/master`.
   - Se o **backend** mudou: executa `npm run build`, roda `npx sequelize db:migrate` e reinicia o processo `maxchat-backend` no PM2.
   - Se o **frontend** mudou: executa `npm run build` e reinicia o processo `maxchat-frontend` no PM2.
   - Exibe o status atualizado do PM2 (`pm2 status`).

---

## 3. Informações do Ambiente de Produção

- **Diretório no Servidor:** `/root/MaxChat`
- **Repositório Git:** `https://github.com/maxitvhd/MaxChat.git` (branch `master`)
- **Processos PM2:**
  - `maxchat-backend` (API Node.js / TypeScript compilado em `/root/MaxChat/backend/dist`)
  - `maxchat-frontend` (React compilado em `/root/MaxChat/frontend/build`)
- **Arquivo de Credenciais Locais:** `src/.deploy.env` (ignorado pelo Git)
  - Contém `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_PATH` e `SSHPASS`.

---

## 4. Comandos Úteis de Manutenção no Servidor

Caso precise consultar logs ou status diretamente:

```bash
# Verificar status dos processos PM2 no servidor
SSHPASS='...' sshpass -e ssh -p 10022 root@131.108.32.83 "pm2 status"

# Consultar as últimas 100 linhas de log do backend
SSHPASS='...' sshpass -e ssh -p 10022 root@131.108.32.83 "pm2 logs maxchat-backend --lines 100 --nostream"
```
