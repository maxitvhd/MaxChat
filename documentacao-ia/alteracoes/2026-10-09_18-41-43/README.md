# Alterações - 2026-10-09 18:41:43

## Contexto
Contatos duplicados (uma conversa com telefone e outra com "id"). O WhatsApp passou a mandar conversas como `xxx@lid` (LID) e o sistema gravava os dígitos do LID como número, criando um segundo contato/ticket.

## Arquivos modificados
### Backend
- backend/src/services/WbotServices/wbotMessageListener.ts

## Detalhes
- `resolveLidContact`: mensagem com `remoteJid` @lid usa `msg.key.senderPn` (telefone real) como identidade do contato.
- `getSenderMessage`: em grupos, participante @lid usa `participantPn` quando disponível.
- `verifyContact`:
  - Guarda o LID no campo extra `whatsapp_lid` (ContactCustomField) — sem alteração de schema.
  - Mensagem só com LID (sem telefone): busca o contato pelo campo `whatsapp_lid`.
  - Contato antigo criado com número de LID é convertido para o telefone quando a pessoa volta a escrever (nada é apagado). Se já existirem os dois contatos, ficam como estão (junção manual).

## Pendências
- Sessão WhatsApp com erros "Bad MAC"/"MessageCounterError": re-parear (QR) para limpar chaves.
- Chave da OpenAI ausente no servidor (erro 401 na IA).
