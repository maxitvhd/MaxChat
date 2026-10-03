#!/usr/bin/env python3
"""
Gera a migracao de prompts da EcoMax a partir dos rascunhos revisados em
documentacao-ia/prompts/*.md.

Uso:  python3 documentacao-ia/gerar-migracao-prompts.py

Regra: o Markdown e a fonte da verdade do texto. Este script so embrulha o
conteudo no formato de migracao, para o deploy continuar sendo so por Git.
"""

import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(SCRIPT_DIR)
DOCS = os.path.join(SCRIPT_DIR, "prompts")
# Com --forcar a migracao sobrescreve o prompt mesmo sem ser sentinela. Use
# so quando o texto publicado veio da revisao atual e ninguem editou a mao:
# e o caso de uma republicacao logo apos aprovar o prompt.
FORCAR = "--forcar" in sys.argv

DESTINO = os.path.join(
    BASE, "backend", "src", "database", "migrations",
    "20261003150000-publish-company-2-prompts.ts",
)

MAPA = [
    ("MaxCheckout", "02-maxcheckout.md"),
    ("MaxOS", "03-maxos.md"),
    ("OS.MaxOS", "04-os-maxos.md"),
    ("Dfast", "05-dfast.md"),
    ("MaxGas", "06-maxgas.md"),
    ("HolyHub", "07-holyhub.md"),
    ("MResgatar", "08-missao-resgatar.md"),
    ("BeatLove", "09-beatlove.md"),
    ("AIConect", "10-aiconect.md"),
    ("MarchaPraJesusItagua", "11-marcha-pra-jesus.md"),
    ("Maximo.TEC", "12-maximo-tec.md"),
    ("RadarMix", "13-radarmix.md"),
    ("Triagem", "14-triagem.md"),
]

SQL_BUSCA_FILA = """      const filas: any[] = await queryInterface.sequelize.query(
        'SELECT id FROM "Queues" WHERE "companyId" = :companyId AND name = :name LIMIT 1',
        {
          type: QueryTypes.SELECT,
          replacements: { companyId, name: nomeFila }
        }
      );"""

SQL_BUSCA_PROMPT = """      const atuais: any[] = await queryInterface.sequelize.query(
        'SELECT id, prompt FROM "Prompts" WHERE "companyId" = :companyId AND "queueId" = :queueId LIMIT 1',
        {
          type: QueryTypes.SELECT,
          replacements: { companyId, queueId }
        }
      );"""

# O SQL do INSERT fica entre crases: tem aspas simples do '' e do 'default',
# que quebrariam uma string JS com aspas simples.
SQL_INSERT = """          `INSERT INTO "Prompts" ("name", "prompt", "apiKey", "queueId", "companyId", "maxMessages", "maxTokens", "temperature", "replyEngine", "model", "max_completion_tokens", "voice", "voiceKey", "voiceRegion", "promptTokens", "completionTokens", "totalTokens", "createdAt", "updatedAt")
           VALUES (:name, :prompt, '', :queueId, :companyId, 10, 2000, 0.5, 'default', NULL, 0, NULL, NULL, NULL, 0, 0, 0, NOW(), NOW())`"""

SQL_UPDATE = """      await queryInterface.sequelize.query(
        'UPDATE "Prompts" SET "prompt" = :prompt, "updatedAt" = NOW() WHERE id = :id',
        { replacements: { prompt: conteudo, id: atuais[0].id } }
      );"""


def extrair_prompt(path):
    """Pega so o bloco '## Prompt' do Markdown, sem os '>' de citacao."""
    linhas = open(path, encoding="utf-8").read().split("\n")

    ini = None
    for i, l in enumerate(linhas):
        if l.startswith("## Prompt"):
            ini = i
            break
    if ini is None:
        raise SystemExit("sem secao '## Prompt' em " + path)

    fim = len(linhas)
    for j in range(ini + 1, len(linhas)):
        if linhas[j].startswith("## "):
            fim = j
            break

    bloco = []
    for l in linhas[ini + 1:fim]:
        if not l.startswith(">"):
            continue
        resto = l[1:]
        bloco.append(resto[1:] if resto.startswith(" ") else resto)

    while bloco and not bloco[0].strip():
        bloco.pop(0)
    while bloco and not bloco[-1].strip():
        bloco.pop()

    return "\n".join(bloco)


def main():
    entradas = []
    for nome, arquivo in MAPA:
        caminho = os.path.join(DOCS, arquivo)
        if not os.path.exists(caminho):
            raise SystemExit("faltando " + caminho)
        prompt = extrair_prompt(caminho)
        if len(prompt) < 200:
            raise SystemExit("prompt curto demais em %s (%d)" % (arquivo, len(prompt)))
        entradas.append((nome, prompt))
        print("%-24s %6d caracteres" % (nome, len(prompt)))

    corpo = []

    def add(linha=""):
        corpo.append(linha)

    add('import { QueryInterface, QueryTypes } from "sequelize";')
    add()
    add("/**")
    add(" * Conteudo dos prompts da EcoMax (empresa 2).")
    add(" *")
    add(" * O texto de cada prompt vem dos rascunhos revisados em")
    add(" * documentacao-ia/prompts/*.md e entra aqui para o deploy ser so por")
    add(" * Git, sem SQL manual.")
    add(" *")
    add(" * A migracao so escreve quando o prompt ainda e o generico antigo ou esta")
    add(" * vazio. Depois de publicada, a edicao passa a ser pelo painel /prompts e")
    add(" * esta migracao nao sobrescreve mais nada.")
    add(" *")
    add(" * A fila Triagem (id 14) e diferente das outras: ela roteia. O prompt pede")
    add(" * o departamento e a empresa e devolve a escolha no marcador")
    add(" * [[ROTA:Nome da fila]]. Quem consome o marcador e o")
    add(" * services/AiServices/rotaTriagem.ts.")
    add(" *")
    add(" * GERADO por documentacao-ia/gerar-migracao-prompts.py - edite o Markdown,")
    add(" * nao este arquivo.")
    if FORCAR:
        add(" *")
        add(" * ATENCAO: gerado com --forcar. Esta versao sobrescreve o prompt mesmo")
        add(" * quando ele ja foi editado a mao. Use so para republicar texto")
        add(" * aprovado, e volte a gerar sem a flag depois.")
    add(" */")
    add()
    add("const PROMPTS: Record<string, string> = {")
    for nome, prompt in entradas:
        add("  %s: %s," % (json.dumps(nome, ensure_ascii=False),
                           json.dumps(prompt, ensure_ascii=False)))
    add("};")
    add()
    add("// Sentinelas: textos que NAO foram escritos por gente. Enquanto o prompt")
    add("// da fila for um deles, a migracao pode trocar com seguranca. Depois que")
    add("// alguem editar pelo painel, a migracao para de mexer naquela fila.")
    add("const semAcento = (valor: string): string =>")
    add('  String(valor || "")')
    add('    .normalize("NFD")')
    add('    .replace(/[\\u0300-\\u036f]/g, "")')
    add('    .toLowerCase()')
    add('    .trim();')
    add()
    add("const SENTINELAS = [")
    add('  "Você é um assistente útil e preciso. Responda de forma clara e objetiva.",')
    add('  "Você é o assistente de atendimento da fila",')
    add('  "Você é um assistente virtual de atendimento da fila"')
    add("].map(semAcento);")
    add()
    add("const ehSentinela = (texto: string): boolean => {")
    add('  const normalizado = semAcento(texto);')
    add("  if (!normalizado) return true;")
    add("  return SENTINELAS.some((sentinela) =>")
    add("    normalizado === sentinela || normalizado.startsWith(sentinela)")
    add("  );")
    add("};")
    add()
    add("module.exports = {")
    add("  up: async (queryInterface: QueryInterface) => {")
    add("    const empresa: any[] = await queryInterface.sequelize.query(")
    add('      \'SELECT id FROM "Companies" WHERE id = :id LIMIT 1\',')
    add("      { type: QueryTypes.SELECT, replacements: { id: 2 } }")
    add("    );")
    add()
    add("    if (empresa.length === 0) return;")
    add()
    add("    const companyId = empresa[0].id;")
    add()
    add("    for (const [nomeFila, conteudo] of Object.entries(PROMPTS)) {")
    add(SQL_BUSCA_FILA)
    add()
    add("      if (filas.length === 0) continue;")
    add()
    add("      const queueId = filas[0].id;")
    add()
    add(SQL_BUSCA_PROMPT)
    add()
    add("      if (atuais.length === 0) {")
    add("        await queryInterface.sequelize.query(")
    add(SQL_INSERT + ",")
    add("          {")
    add("            replacements: {")
    add("              name: `Prompt - ${nomeFila}`,")
    add("              prompt: conteudo,")
    add("              queueId,")
    add("              companyId")
    add("            }")
    add("          }")
    add("        );")
    add("        continue;")
    add("      }")
    add()
    if FORCAR:
        add("      // --forcar: republicacao aprovada. Nao checa a sentinela de proposito,")
        add("      // porque o texto publicado aqui ja foi revisado.")
    else:
        add("      // Preserva edicao manual: so troca prompt que ninguem escreveu a mao.")
        add("      if (!ehSentinela(atuais[0].prompt)) continue;")
    add()
    add(SQL_UPDATE)
    add("    }")
    add("  },")
    add("  down: async (_queryInterface: QueryInterface) => {}")
    add("};")
    add()

    with open(DESTINO, "w", encoding="utf-8") as f:
        f.write("\n".join(corpo))

    print("\nmodo: " + ("--forcar (sobrescreve)" if FORCAR else "com sentinela (preserva edicao manual)"))
    print("gerado: " + DESTINO)


if __name__ == "__main__":
    main()