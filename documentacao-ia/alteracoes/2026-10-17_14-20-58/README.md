# Alterações - 2026-10-17 14:20:58

## Contexto
1. Campanha não salvava (500): `Number(null)` virava `0` no userId/queueId quando nenhum usuário/fila era escolhido → violação de FK (Campaigns_userId_fkey).
2. Logout deixava a tela branca: `socket.on/off` chamados com socket `null` em componentes ainda montados ("Cannot read properties of null (reading 'on')").

## Arquivos
- backend/src/services/CampaignService/CreateService.ts e UpdateService.ts: helper `toIdOuNull` (vazio/null/0 → null).
- frontend/src: todas as chamadas `socket.on`/`socket.off` protegidas com `socket && ...` (31 arquivos).
