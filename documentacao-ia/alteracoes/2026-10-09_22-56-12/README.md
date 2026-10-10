# Alterações - 2026-10-09 22:56:12

## Contexto
Cliente que manda áudio deve receber resposta em texto e em áudio. O TTS (`gerarAudio`) existia e estava configurado, mas nunca era chamado no atendimento do WhatsApp.
Também: conexão "Servidor Producao" (empresa 2) sem fila vinculada → chats novos sem fila; e mensagens da conexão vazias.

## Arquivos
- backend/src/services/AiServices/TtsToWhatsAppService.ts (novo): texto → TTS da empresa → Opus/Ogg (ffmpeg) → envio como mensagem de voz (ptt). Remove formatação/links/emojis antes da fala. Nunca lança.
- backend/src/services/WbotServices/wbotMessageListener.ts: se a mensagem do cliente for áudio, após enviar o texto da IA envia também o áudio.

## Banco (produção, sem apagar dados)
- WhatsappQueues: vinculada fila Triagem (14) à conexão 8 → chats novos entram na Triagem.
- Whatsapps id 8: preenchidas saudação, conclusão, fora de expediente e férias coletivas.
