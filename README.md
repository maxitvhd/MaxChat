# MaxChat (Multizap Plus) — Sistema de Atendimento WhatsApp

Fork do Multizap Plus com backend migrado para Express 5, Sequelize 6 e
dependências atualizadas.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node + Express 5 + Sequelize 6 + TypeScript |
| Banco | PostgreSQL |
| Fila | Redis + Bull |
| WhatsApp | Baileys (@whiskeysockets/baileys) |
| Frontend | React 16 + Material-UI + CRA (react-scripts 3.4.3) |

## Requisitos

- Node 18 ou superior
- PostgreSQL 14+
- Redis 6+
- 2 subdomínios apontando para o servidor (frontend e API)

## Primeira instalação

```bash
git clone https://github.com/maxitvhd/MaxChat.git
cd MaxChat

# ---- BACKEND ----
cd backend
cp .env.example .env      # preencha DB_*, JWT_SECRET, MASTER_KEY
npm install
npm run build             # gera dist/ — obrigatório antes das migrations
npx sequelize db:migrate
npx sequelize db:seed:all # cria admin@admin.com / 123456
pm2 start dist/server.js --name maxchat-backend

# ---- FRONTEND ----
cd ../frontend
cp .env.example .env      # defina REACT_APP_BACKEND_URL=https://api.seudominio.com.br
npm install
npm run build
pm2 start server.js --name maxchat-frontend
```

Acesse com `admin@admin.com` / `123456` e troque a senha imediatamente.

## Atualização

```bash
git pull
cd backend  && npm install && npm run build && npx sequelize db:migrate
cd ../frontend && npm install && npm run build
pm2 restart maxchat-backend maxchat-frontend
```

## Variáveis obrigatórias

| Variável | Onde | Observação |
|---|---|---|
| `ENV_TOKEN` | backend | Deve ser `wtV`. O frontend envia esse valor fixo em `/public-settings`. Valor diferente faz cores, logos e nome do sistema retornarem **403**. |
| `REDIS_URI_ACK` | backend | Usada por `libs/queue.ts` e pelo guard em `server.ts`. Sem ela o BullBoard não sobe. |
| `MASTER_KEY` | backend | Gere com `openssl rand -base64 32`. |
| `JWT_SECRET` | backend | Gere com `openssl rand -base64 32`. |
| `REACT_APP_BACKEND_URL` | frontend | URL pública da API. Ler no build — alterar exige `npm run build`. |

## Estrutura

```
backend/    API, migrations, seeds, filas, sessões WhatsApp
frontend/   SPA (React), servido por server.js a partir de build/
```

O `frontend/build/` não é versionado: é gerado no servidor.

## Scripts

| Comando | Efeito |
|---|---|
| `npm run build` (backend) | Compila TypeScript para `dist/`. É o typecheck. |
| `npm run lint` (backend) | ESLint. |
| `npx sequelize db:migrate` | Aplica migrations. |
| `npx sequelize db:seed:all` | Cria empresa, usuário admin e settings padrão. |
| `npm run build` (frontend) | Build de produção. Requer `NODE_OPTIONS=--openssl-legacy-provider` (já embutido no script). |

## Notas

- O `.sequelizerc` aponta para `dist/`. Rodar `db:migrate` sem `npm run build`
  antes faz o CLI não encontrar as migrations.
- `npm run lint` no backend reporta problemas preexistentes de formatação
  (2745 findings). Não afetam build nem runtime.
