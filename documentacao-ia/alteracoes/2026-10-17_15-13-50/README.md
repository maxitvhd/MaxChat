# Alterações - 2026-10-17 15:13:50

## Contexto
Campanhas da festa: permitir editar campanhas já enviadas e corrigir horário (recepção às 13h, valsa às 14h30).

## Arquivos
- backend/src/services/CampaignService/UpdateService.ts: campanha FINALIZADA volta a rascunho (INATIVA) ao salvar; data passada não vira PROGRAMADA.
- frontend/src/components/CampaignModal/index.js: campanhas FINALIZADA e CANCELADA são editáveis.

## Banco (produção, empresa 2)
- Campanha 12 (lembrete) e 13 (confirmação): textos com recepção às 13h e valsa às 14h30, sem menção a traje.
