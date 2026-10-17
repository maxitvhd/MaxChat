# Alterações - 2026-10-17 14:43:43

## Contexto
Campanha com "confirmação" ligada e sem mensagens de confirmação enviava só o texto "null" ao contato: o envio caía no passo de confirmação com confirmationMessage vazia e a mensagem principal nunca era enviada.

## Arquivos
- backend/src/queues.ts: o passo de confirmação só roda quando existe confirmationMessage (2 ocorrências, envio com e sem mídia).
