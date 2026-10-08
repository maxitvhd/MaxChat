# Alterações - 2026-10-08 17:26:42

## Contexto
Correções de recarregamento (F5) no frontend, união/agrupamento de contatos e ajustes em API de contatos, além de melhorias no logout e sincronização Git/deploy.

## Arquivos modificados
### Frontend
- frontend/src/hooks/useAuth.js/index.js
- frontend/src/services/SocketWorker.js
- frontend/src/hooks/useWhatsApps/index.js
- frontend/src/layout/MainListItems.js
- frontend/src/hooks/useUserMoments/index.js
- frontend/src/pages/Annoucements/index.js
- frontend/src/pages/Chat/index.js
- frontend/src/components/MessagesList/index.js

### Backend
- backend/src/services/ContactServices/CreateOrUpdateContactService.ts
- backend/src/controllers/ContactController.ts

## Detalhes
### Socket/Sessão
- useAuth: socket inicia null, inicializa no boot com cache, guards on/off, cleanup no logout com localStorage.clear() e window.location.href
- SocketWorker: sem singleton, instancia por companyId/userId, não conecta em namespace root, disconnect não zera instância global
- Listeners protegidos contra .on em socket null

### Contatos
- CreateOrUpdateContactService: matching por number/remoteJid + variantes BR (com/sem 9)
- ContactController: validação flexibilizada e evita bloqueio "já existe"

## Data/Hora
2026-10-08 17:26:42
