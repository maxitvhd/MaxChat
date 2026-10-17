# Alterações - 2026-10-17 16:41:03

## Contexto
Reutilizar campanha não é seguro (os registros de envio já marcados como entregues impedem novo envio, e o histórico se mistura). Decidido: duplicar campanha, e mostrar o histórico de envios por contato no relatório.

## Arquivos
- frontend/src/pages/Campaigns/index.js: botão "Duplicar campanha". Usa o endpoint de criação já existente (sem rota nova). A cópia fica em INATIVA, sem data e sem anexo.
- frontend/src/pages/CampaignReport/index.js: tabela "Histórico de envios" com contato, número, situação (Enviado / Pendente / Não enviado), data do envio, confirmação solicitada e prévia da mensagem.

## Limitação conhecida
Erros de envio não são gravados no banco (não há coluna para isso). Consultar o log do servidor.
