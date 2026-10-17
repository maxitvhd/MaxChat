# Alterações - 2026-10-17 14:38:09

## Contexto
Campanha criada às 14:37 (Brasília) ficou gravada como 14:37 UTC: o frontend enviava a data sem fuso e o banco lia como UTC. Resultado: a campanha ficava 3h no passado, o agendador (janela NOW..NOW+3h) nunca a pegava e o botão de editar bloqueava (regra: só edita com mais de 1h de antecedência).

## Arquivos
- frontend/src/components/CampaignModal/index.js: scheduledAt enviado como ISO (toISOString) em vez de texto local.

## Banco (produção)
- Campanha 12 ("Isabella"): scheduledAt 2026-10-17 14:37+00 → 2026-10-17 17:40+00 (14:40 de Brasília), para teste.
