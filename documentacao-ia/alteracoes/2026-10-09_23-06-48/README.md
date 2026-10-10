# Alterações - 2026-10-09 23:06:48

## Contexto
Ticket novo nascia sem fila e a IA não respondia. A conexão tem promptId=14; o caminho antigo "openai na conexão" chamava a OpenAI sem chave, o erro 401 interrompia o handleMessage antes do verifyQueue (Triagem) e do módulo de IA (Ollama).

## Arquivos
- backend/src/services/WbotServices/wbotMessageListener.ts
  - Desligado o bloco legado "openai na conexão" (o prompt da conexão já é usado pelo módulo de IA da empresa).
  - verifyQueue: saudação/mensagens de fila enviadas para msg.key.remoteJid (funciona com @lid).

## Banco
- Ticket 33 (empresa 2) movido para a fila Triagem (14).
