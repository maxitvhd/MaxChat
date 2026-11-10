#!/usr/bin/env bash
set -euo pipefail

# Diretório do repositório Git (pasta src)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -d "$SCRIPT_DIR/src/.git" ]; then
  REPO_DIR="$SCRIPT_DIR/src"
else
  REPO_DIR="$SCRIPT_DIR"
fi

# Carrega variáveis locais de conexão (.deploy.env)
if [ -f "$REPO_DIR/.deploy.env" ]; then
  set -a
  source "$REPO_DIR/.deploy.env"
  set +a
elif [ -f "$SCRIPT_DIR/.deploy.env" ]; then
  set -a
  source "$SCRIPT_DIR/.deploy.env"
  set +a
fi

DEPLOY_HOST="${DEPLOY_HOST:-131.108.32.83}"
DEPLOY_PORT="${DEPLOY_PORT:-10022}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/root/MaxChat}"
TARGET="${1:-auto}" # Opções: auto | backend | frontend | all
COMMIT_MSG="${2:-}"

echo "===================================================="
echo " Iniciando Deploy Automático - MaxChat (Whaticket)"
echo " Alvo: $TARGET"
echo "===================================================="

cd "$REPO_DIR"

# 1. Verifica alterações locais e faz commit se necessário
if [ -n "$(git status --porcelain)" ]; then
  if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="chore(deploy): atualização automática em $(date '+%Y-%m-%d %H:%M')"
  fi
  echo "-> Alterações locais detectadas. Criando commit: $COMMIT_MSG"
  git add -A
  git commit -m "$COMMIT_MSG"
else
  echo "-> Working tree limpa. Nenhum commit pendente."
fi

# Detecta o que mudou no último commit caso o modo seja 'auto'
if [ "$TARGET" = "auto" ]; then
  CHANGED_FILES="$(git diff-tree --no-commit-id --name-only -r HEAD || true)"
  BUILD_BACKEND=false
  BUILD_FRONTEND=false

  if echo "$CHANGED_FILES" | grep -q "^backend/"; then
    BUILD_BACKEND=true
  fi
  if echo "$CHANGED_FILES" | grep -q "^frontend/"; then
    BUILD_FRONTEND=true
  fi

  # Se nenhum dos dois foi detectado no HEAD (ex.: redeploy), compila o backend por padrão
  if [ "$BUILD_BACKEND" = false ] && [ "$BUILD_FRONTEND" = false ]; then
    BUILD_BACKEND=true
  fi
elif [ "$TARGET" = "backend" ]; then
  BUILD_BACKEND=true
  BUILD_FRONTEND=false
elif [ "$TARGET" = "frontend" ]; then
  BUILD_BACKEND=false
  BUILD_FRONTEND=true
elif [ "$TARGET" = "all" ]; then
  BUILD_BACKEND=true
  BUILD_FRONTEND=true
else
  echo "Uso: ./deploy.sh [auto|backend|frontend|all] [\"mensagem de commit opcional\"]"
  exit 1
fi

# 2. Envia alterações para o GitHub
echo "-> Enviando código para origin/master..."
git push origin master

# 3. Executa atualização no servidor de produção via SSH
SSH_CMD=(ssh -o StrictHostKeyChecking=no -p "$DEPLOY_PORT" "${DEPLOY_USER}@${DEPLOY_HOST}")
if [ -n "${SSHPASS:-}" ] && command -v sshpass >/dev/null 2>&1; then
  SSH_CMD=(sshpass -e "${SSH_CMD[@]}")
fi

echo "-> Conectando ao servidor ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PORT}..."
"${SSH_CMD[@]}" "bash -s" <<EOF
set -euo pipefail
cd "$DEPLOY_PATH"
echo "-> Atualizando repositório remoto em $DEPLOY_PATH..."
git fetch origin
git merge --no-edit origin/master

if [ "$BUILD_BACKEND" = "true" ]; then
  echo "-> Compilando backend..."
  cd "$DEPLOY_PATH/backend"
  npm run build
  npx sequelize db:migrate || true
  pm2 restart maxchat-backend
fi

if [ "$BUILD_FRONTEND" = "true" ]; then
  echo "-> Compilando frontend..."
  cd "$DEPLOY_PATH/frontend"
  NODE_OPTIONS="--openssl-legacy-provider --max-old-space-size=4096" npm run build
  pm2 restart maxchat-frontend
fi

pm2 status
EOF

echo "===================================================="
echo " Deploy finalizado com sucesso!"
echo "===================================================="
