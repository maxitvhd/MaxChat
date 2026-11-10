# Alterações - 2026-11-10 13:19:00

## Contexto
1. Contatos estavam sendo duplicados e o mesmo contato podia ficar com duas conversas abertas/pendentes simultaneamente (ex.: quando uma conversa antiga ficava com `whatsappId` nulo ou de outra conexão, ou devido ao 9º dígito / `@lid`).
2. Ao fechar tickets sem fila (`queueId = null`) ou via "Fechar todos" (`userId = null`), o `CreateLogTicketService` convertia `null` para `0` e gerava erro 500 por violação de chave estrangeira no banco.
3. Ao excluir uma conversa cujo contato tinha tickets históricos anteriores, o ticket antigo voltava a aparecer na listagem ao atualizar a página (`F5`).
4. Criado fluxo documentado e script de deploy automático (`deploy.sh` e `DEPLOY.md`).

## Arquivos
- `backend/src/services/ContactServices/CreateOrUpdateContactService.ts`, `CreateContactService.ts`, `GetContactService.ts`, `CreateOrUpdateContactServiceForImport.ts`: unificação de busca de contatos (`findExistingContact` e `buildContactCandidates` preservando DDD brasileiro, `remoteJid`, `whatsapp_lid` e nome válido) e migração automática de tickets/mensagens duplicados.
- `backend/src/services/TicketServices/FindOrCreateTicketService.ts`, `CreateTicketService.ts`, `CreateTicketServiceWebhook.ts`, `FindOrCreateTicketServiceMeta.ts`: consolidação de tickets por contato (`consolidateAndFindContactTicket`) independentemente da conexão (`whatsappId`) e reabertura garantida de conversas fechadas.
- `backend/src/services/TicketServices/ListTicketsService.ts`, `TicketsQueuesService.ts`, `backend/src/services/MessageServices/ListMessagesService.ts`: agrupamento de 1 conversa por contato nas abas e unificação do histórico de mensagens do contato.
- `backend/src/services/TicketServices/CreateLogTicketService.ts`, `UpdateTicketService.ts`, `DeleteTicketService.ts`: correção de chave estrangeira ao fechar tickets sem fila/usuário e remoção completa de todos os tickets do contato ao excluir a conversa.
- `deploy.sh`, `DEPLOY.md`: script e documentação para commit, push, build e restart automático no servidor via SSH/PM2.

