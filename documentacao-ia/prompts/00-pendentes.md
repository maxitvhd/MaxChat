# Mapeamento das filas da EcoMax → base de conhecimento

Status: **publicado em producao** em 03/10/2026, migracao
`20261003150000-publish-company-2-prompts`.

Os 13 prompts abaixo estao no banco da EcoMax (`companyId=2`). O texto e o
gerador sao a fonte; para mudar qualquer coisa, edite os `.md` e rode
`python3 ../gerar-migracao-prompts.py` (use `--forcar` so para republicar
texto ja revisado). Prompt editado a mao pelo painel `/prompts` nunca e
sobrescrito sem o `--forcar`.

O que segue sao os **pontos em aberto** da revisao, nao o estado da publicacao.

## Filas e origem do conhecimento

| Fila | ID | Prompt | Origem | Base documental | Confianca |
|---|---|---|---|---|---|
| MaxCheckout | 2 | `02-maxcheckout.md` | `/Projetos/MaxCheckout` | 86 documentos | alta |
| MaxOS | 3 | `03-maxos.md` | `/Projetos/MaxOs` | 99 documentos | alta |
| OS.MaxOS | 4 | `04-os-maxos.md` | `/Projetos/MaxOs` | 99 documentos | alta |
| Dfast | 5 | `05-dfast.md` | `/Projetos/MaxOs` (modulo de delivery) | 99 documentos | alta |
| MaxGas | 6 | `06-maxgas.md` | `/Projetos/MaxGas` | 58 documentos | alta |
| HolyHub | 7 | `07-holyhub.md` | `/Projetos/Holyhub` | **nenhuma** | baixa |
| MResgatar | 8 | `08-missao-resgatar.md` | `/Projetos/Missao Resgatar` | 4 documentos | media |
| BeatLove | 9 | — | **nao identificada** | — | nenhuma |
| AIConect | 10 | `10-aiconect.md` | `/Projetos/aiconect` | **nenhuma** | media |
| MarchaPraJesusItagua | 11 | `11-marcha-pra-jesus.md` | `/Projetos/MarchaPraJesus` | 1 documento | baixa |
| Maximo.TEC | 12 | — | **nao identificada** | — | nenhuma |
| RadarMix | 13 | — | **candidato `/Projetos/KadarOculos`** | 2 documentos de sensor | baixa |
| Triagem | 14 | — | menu, nao possui produto | — | n/a |

## Candidatos nao confirmados

### RadarMix → KadarOculos (candidato)
`/Projetos/KadarOculos` tem `radar_app/`, sensores ESP32 e documentacao de sensor
(`sensor_APDS_9960.md`, `sensor_VL53L0X.md`), o que combina com um produto de radar
com IA. **O nome RadarMix nao aparece em nenhum arquivo de nenhum projeto.**
Precisa de confirmação do dono.

### BeatLove (nao identificado)
Aparece em apenas dois lugares:
- `ZapSaudades/documentacao/alteracoes_central_programas_e_sync_maxmusicbox_20260918_1050.md`
  lista `BeatLove NFC` entre parceiros homologados.
- `Camelodabeleza/.env` usa `beatlove1` como usuario de banco.

Nao existe pasta de projeto BeatLove. Precisa de confirmação: e um programa NFC?
um app de cartao? o mesmo ZapSaudades com outro nome?

### Maximo.TEC (nao identificado)
Nao existe pasta com esse nome. Candidatos internos da Maximo:
- `/Projetos/RetornoMax` — switcher de vídeo para transmissão (20 documentos)
- `/Projetos/MaxLume---Vídeo-&-Apresentação-Profissional`
- `/Projetos/aiconect` — plataforma de streaming
- `/Projetos/hacker` — infraestrutura de servidores
- `/Projetos/cardoso` — geração de catálogo

Precisa de confirmação do que a fila Maximo.TEC atende.

## Projetos sem fila propria na EcoMax

| Projeto | Para onde encaminhar |
|---|---|
| ZapSaudades | nenhuma fila definida |
| Camelodabeleza | nenhuma fila definida |
| TerracoBar | cliente de MaxOS (arquivos de origem contem material do MaxOS) |
| miniseries, backup, junkbox, cerebro, comerciais, whaticket2 | material interno, nao atendem cliente |

## Observacoes que afetam o menu

0. **A fila Triagem roteia por marcador, nao por FlowBuilder.** O JEV NAFO move o ticket: ele
   classifica intencao. O prompt da Triagem pergunta o departamento e a empresa e devolve a
   escolha em `[[ROTA:Nome da fila]]`; o backend consome o marcador em
   `backend/src/services/AiServices/rotaTriagem.ts`, tira a marcacao do texto e so troca a fila
   se o nome existir na mesma empresa. Por isso os `FlowBuilders` ficaram vazios: com a IA ativa
   o fluxo do WhatsApp nao chega a rodar, o modulo de IA responde antes.
1. **DFast nao e produto separado.** E modulo de delivery dentro do MaxOS. Se o menu
  offer DFast como empresa, mantenha a resposta apontando para o mesmo time do MaxOS.
2. **ZapSaudades e Missao Resgatar compartilham a mesma base de portal.** Confirmar se
   a fila `MResgatar` deve atender tambem ZapSaudades.
3. **HolyHub e AIConect nao tem documentacao.** Publicar os prompts atuais so depois de
   confirmar licenca e escopo comercial.
4. **MarchaPraJesusItagua** esta praticamente sem informacao de evento.
5. Nenhum dos produtos tem preco, plano ou prazo documentado. Os prompts deliberadamente
   nao respondem valores — confirmando se prefere manter assim ou criar uma tabela de
   precos central para o bot consultar.