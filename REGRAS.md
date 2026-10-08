# DIRETRIZES DE DESENVOLVIMENTO (SISTEMA WHATICKET)

## ⚠ RESTRIÇÕES CRÍTICAS (AMBIENTE DE PRODUÇÃO)
- NÃO modifique este arquivo de instruções (`REGRAS.md`).
- NÃO apague informações ou registros do banco de dados (sistema em produção).
- NÃO altere credenciais, acessos ou configurações do servidor de produção sem autorização prévia.
- NÃO instale bibliotecas ou pacotes sem perguntar primeiro.
- NÃO altere o schema ou estrutura do banco de dados sem permissão.
- NÃO crie rotas, tabelas ou controllers sem aprovação prévia.
- NÃO execute rotinas de deploy sem permissão expressa.

---

## 🔒 SEGURANÇA E BOAS PRÁTICAS
- **Segurança em Primeiro Lugar:** Utilize sempre métodos seguros (sanitização de dados, proteção contra SQL Injection/XSS e tratamento defensivo de exceções).
- **Código Limpo e Organizado:** Mantenha legibilidade, funções pequenas com responsabilidade única e alta performance.
- **Separação de Camadas (Views vs. Controllers):** 
  - As views devem conter **apenas** lógicas de interface e chamadas para funções dos controllers.
  - NUNCA crie lógicas de banco de dados, consultas SQL ou funções de negócio dentro de Views.

---

## 💬 IDIOMA E PADRÕES DE COMUNICAÇÃO
- **Idioma do Sistema e Respostas:** Sempre responda em Português do Brasil (PT-BR).
- **Otimização de Tokens:** Seja direto e objetivo para gastar o mínimo de tokens possível.
- **Comentários de Código:** Escreva comentários em PT-BR com tom pessoal e natural (como se o próprio desenvolvedor estivesse explicando sua lógica em funções, rotas e regras complexas).
- **Commits:** Todas as mensagens de commit devem ser escritas em PT-BR.

---

## 🎨 INTERFACE DE USUÁRIO (UI / UX)
- **Alertas e Popups:** Todos os alertas e notificações do sistema devem seguir o estilo **SweetAlert** (sem barra e respeitando estritamente o tema selecionado no momento).
- **Assinatura do Console:** Adicione no console do navegador em todas as telas:
  ```javascript
  console.log(
    '%c{nome do aplicativo} {versao}\nCriado pela Maximo tecnologias brasil.\nConheça mais dos nossos sistemas em: %cwww.maximo.tec.br',
    'font-size: 24px; font-weight: bold; color: #ff0000; text-shadow: 1px 1px #000;',
    'font-size: 14px; color: #000; font-weight: bold;',
    'color: #ff0000; font-weight: bold;'
  );
  ```

---

## DOCUMENTAÇÃO DE ALTERAÇÕES (HISTÓRICO)

### [2026-10-08] Correções de Socket e Sessão (Frontend)
- **useAuth.js**: Inicialização de socket como `null` (não `{}`); inicialização do socket no boot a partir de cache (`user`+`token`); guards `io && io.on/off`; limpeza adequada de socket em logout/erro; uso de `window.location.href` e `localStorage.clear()` no logout para evitar tela branca e 401s em requisições subsequentes.
- **SocketWorker.js**: Removido singleton global; criação de instância por chamada com `companyId` e `userId`; bloqueio de conexão sem `companyId`/`userId` (não conecta ao namespace root `/`); `disconnect()` não zera instância global; namespace correto por empresa (`/socket.io/company-${companyId}`).
- **Listeners protegidos**: Guards adicionados em `useWhatsApps/index.js`, `layout/MainListItems.js`, `hooks/useUserMoments/index.js`, `pages/Annoucements/index.js`, `pages/Chat/index.js`, `components/MessagesList/index.js` para evitar `.on` em `socket` `null`/`undefined`.

### [2026-10-08] União de Contatos (Backend)
- **CreateOrUpdateContactService.ts**: Busca inteligente por contato (`companyId`) com `Op.or` entre `number` e `remoteJid`; geração de candidatos/variantes BR (com/sem nono dígito DDI BR) e busca por `Op.in` em `number`/`remoteJid` para evitar duplicação de contatos ao receber mensagens por API/WhatsApp ou abrir conversas (agrupar conversas no mesmo contato).

### [2026-10-08] API de Contatos
- **ContactController.ts**: Flexibilizado `store`/`update` (remoção de validação rígida por apenas dígitos e bloqueio de "já existe") para evitar 400 em cadastros com formatos diversos (`+`, espaços) e permitir reaproveitamento/atualização de contatos existentes.

### [2026-10-08] Git/Deploy
- Commits aplicados, push para GitHub, merge no servidor, builds frontend gerados e PM2 reiniciado (backend/frontend online).
