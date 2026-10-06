/**
 * @TercioSantos-0 |
 * services/AiServices/VoiceAgentService |
 * @descrição: o cérebro do agente de voz. Recebe o que o operador falou,
 *             transcreve, deixa o modelo escolher ferramentas, executa as
 *             de leitura na hora e devolve as de escrita como confirmação.
 *
 *              Decisões que valem explicar:
 *              - o modelo NUNCA executa uma escrita sozinho. Ferramenta de
 *                escrita devolve "precisaConfirmacao" e o backend segura a
 *                ação até o /voice-agent/confirm;
 *              - todo companyId vem do token do operador, nunca da conversa;
 *              - o modelo do agente é separado do modelo de atendimento
 *                (voiceAgentModel), porque aqui ele precisa raciocinar sobre
 *                ferramentas e o de WhatsApp precisa responder curto;
 *              - quando o modelo não está disponível ou não devolve tools,
 *                o agente ainda responde por texto, sem quebrar o painel.
 */
import logger from "../../utils/logger";
import { AiSettingsLike, isBlank } from "./types";
import { aiRequest, joinUrl, AiHttpError } from "./http";
import ShowAiProviderSettingsService from "../AiProviderSettingsServices/ShowAiProviderSettingsService";
import {
  ContextoAgente,
  ResultadoAcao,
  confirmarAcao,
  definicoesParaModelo,
  ferramentasPorNome,
  pendenciaAtiva,
  registrarPendente
} from "./VoiceAgentTools";

export const SYSTEM_PROMPT_AGENTE = `Você é o assistente de voz do painel de atendimento.

Você fala com um operador da equipe, não com o cliente final. Fale em português do Brasil, curto e direto.

Como agir:
- Use as ferramentas para consultar e alterar o painel. Não invente número de ticket, nome de cliente nem situação.
- Para saber a situação do atendimento, chame dashboard_resumo.
- Para achar um ticket pelo cliente, use ticket_consultar com o telefone.
- Antes de dizer que não sabe algo da empresa, chame conhecimento_buscar.
- Se o pedido for mudar algo (mover fila, atribuir, fechar, responder), chame a ferramenta correspondente. O sistema vai pedir confirmação, então explique o que vai acontecer.
- Nunca invente resultado de ferramenta. Se a ferramenta não achou, diga que não achou.
- Se o pedido for ambígu, faça uma pergunta curta em vez de chamar ferramenta no escuro.`;

export interface TurnoVoz {
  companyId: number;
  userId: number;
  profile: string;
  /** transcrição do áudio ou texto digitado */
  texto: string;
}

export interface RespostaAgente {
  /** o que o agente respondeu (vai para o áudio e para a tela) */
  fala: string;
  /** true quando há uma ação esperando "sim" */
  aguardandoConfirmacao: boolean;
  /** chave da ação pendente, devolvida no confirm */
  chave?: string;
  /** histórico de ferramentas, para depurar */
  ferramentas?: { nome: string; fala: string }[];
}

interface MensagemChat {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
  name?: string;
}

/** Janela curta: o agente é de comando, não de conversa longa. */
const MAX_MENSAGENS = 12;

/** Uma pausa longa já é outro assunto: a conversa é esquecida. */
const TTL_HISTORICO_MS = 30 * 60 * 1000;

/** Só as falas finais entram no histórico. */
const historicos = new Map<
  string,
  { mensagens: MensagemChat[]; atualizado: number }
>();

const chaveDoTurno = (companyId: number, userId: number): string =>
  `${companyId}:${userId}`;

const limparHistoricosExpirados = (): void => {
  const agora = Date.now();
  historicos.forEach((valor, chave) => {
    if (agora - valor.atualizado > TTL_HISTORICO_MS) historicos.delete(chave);
  });
};

/**
 * Respostas afirmativas do operador.
 *
 * Feito à mão e de propósito: "sim" só confirma o que o próprio agente tinha
 * acabado de perguntar, dentro do TTL e para o mesmo operador. Sem lista
 * curta, qualquer frase com "sim" dentro dispararia ação de escrita.
 */
const RESPOSTAS_AfirmATIVAS = new Set([
  "sim",
  "sim, pode fazer",
  "pode fazer",
  "pode",
  "faz",
  "faça",
  "confirma",
  "confirmo",
  "pode executar",
  "executa",
  "bora",
  "go",
  "yes"
]);

const ehAfirmativa = (texto: string): boolean => {
  const normalizado = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.!?,;]/g, "")
    .trim();
  return RESPOSTAS_AfirmATIVAS.has(normalizado);
};

const modeloDoAgente = (settings: AiSettingsLike): string => {
  const dedicated = (settings as { voiceAgentModel?: string }).voiceAgentModel;
  if (!isBlank(dedicated)) return String(dedicated).trim();
  return isBlank(settings.ollamaModel)
    ? "qwen3.5:4b"
    : String(settings.ollamaModel).trim();
};

const contextoDoAgente = (
  companyId: number,
  userId: number,
  profile: string,
  settings: AiSettingsLike
): ContextoAgente => {
  // Escrita liberada para admin, ou para qualquer um se a empresa assim
  // configurou. Ver SettingsAiProviderController UpdateAiProvider.
  const permissao = String(
    (settings as { voiceAgentPermission?: string }).voiceAgentPermission ??
      "admin"
  ).toLowerCase();

  const podeEscrever =
    permissao === "all" ? true : String(profile).toLowerCase() === "admin";

  return { companyId, userId, podeEscrever };
};

/** Chama o LLM com suporte a tool-calling. */
const chamarModeloComTools = async (
  settings: AiSettingsLike,
  mensagens: MensagemChat[]
): Promise<{
  texto: string;
  chamadas: { id: string; nome: string; argumentos: any }[];
}> => {
  const base = isBlank(settings.ollamaUrl)
    ? "http://127.0.0.1:11434"
    : String(settings.ollamaUrl);
  const model = modeloDoAgente(settings);

  const bruto = await aiRequest<{
    choices?: {
      message?: {
        content?: string;
        tool_calls?: {
          id?: string;
          function?: { name?: string; arguments?: string };
        }[];
      };
    }[];
  }>({
    label: "voice-agent",
    method: "POST",
    url: joinUrl(base, "/v1/chat/completions"),
    timeout: Math.max(Number(settings.requestTimeout ?? 30000), 60000),
    headers: { "Content-Type": "application/json" },
    retries: 1,
    data: {
      model,
      messages: mensagens,
      stream: false,
      temperature: 0.2,
      tools: definicoesParaModelo(),
      tool_choice: "auto"
    }
  });

  const mensagem = bruto?.choices?.[0]?.message ?? {};

  const chamadas = (mensagem.tool_calls ?? [])
    .filter(c => c?.function?.name)
    .map((c, i) => {
      let argumentos: any = {};
      try {
        argumentos = JSON.parse(c.function?.arguments ?? "{}");
      } catch {
        argumentos = {};
      }
      return {
        id: c.id ?? `call_${i}`,
        nome: String(c.function.name),
        argumentos
      };
    });

  return { texto: String(mensagem.content ?? "").trim(), chamadas };
};

/** Sem tool-calling: o modelo responde só texto. */
const chamarModeloSimples = async (
  settings: AiSettingsLike,
  mensagens: MensagemChat[]
): Promise<string> => {
  const base = isBlank(settings.ollamaUrl)
    ? "http://127.0.0.1:11434"
    : String(settings.ollamaUrl);

  const bruto = await aiRequest<{
    choices?: { message?: { content?: string } }[];
  }>({
    label: "voice-agent-texto",
    method: "POST",
    url: joinUrl(base, "/v1/chat/completions"),
    timeout: Math.max(Number(settings.requestTimeout ?? 30000), 60000),
    headers: { "Content-Type": "application/json" },
    retries: 1,
    data: {
      model: modeloDoAgente(settings),
      messages: mensagens,
      stream: false,
      temperature: 0.2
    }
  });

  return String(bruto?.choices?.[0]?.message?.content ?? "").trim();
};

const lerHistorico = (chave: string): MensagemChat[] => {
  limparHistoricosExpirados();
  return historicos.get(chave)?.mensagens ?? [];
};

/**
 * Guarda só a pergunta e a resposta do turno.
 *
 * As chamadas de ferramenta ficam de fora: elas são JSON grande e encheriam a
 * janela, deixando o próximo turno caro e lento sem ganho nenhum de contexto.
 */
const gravarHistorico = (chave: string, texto: string, fala: string): void => {
  limparHistoricosExpirados();
  const anteriores = historicos.get(chave)?.mensagens ?? [];
  const novas: MensagemChat[] = [
    ...anteriores,
    { role: "user", content: texto },
    { role: "assistant", content: fala }
  ];
  historicos.set(chave, {
    mensagens: novas.slice(-MAX_MENSAGENS),
    atualizado: Date.now()
  });
};

/** /voice-agent/reset: operador trocou de assunto. */
export const limparHistorico = (companyId: number, userId: number): void => {
  historicos.delete(chaveDoTurno(companyId, userId));
};

/**
 * Processa um turno de voz: monta as mensagens, deixa o modelo pedir
 * ferramentas e devolve a resposta já com a confirmação quando houver.
 */
export const processarTurno = async (
  turno: TurnoVoz
): Promise<RespostaAgente> => {
  const settings = (
    await ShowAiProviderSettingsService({
      companyId: turno.companyId
    })
  ).toJSON() as unknown as AiSettingsLike;

  // Empresa com o agente desligado nao entra no modo voz: o botao some na
  // tela, mas a API tambem precisa recusar.
  if (!(settings as { voiceAgentEnabled?: boolean }).voiceAgentEnabled) {
    throw new AiHttpError("O agente de voz não está ativo nesta empresa.", 403);
  }

  const ctx = contextoDoAgente(
    turno.companyId,
    turno.userId,
    turno.profile,
    settings
  );

  const chave = chaveDoTurno(turno.companyId, turno.userId);

  // "Sim" falado confirma o que o agente acabou de perguntar. Um agente de
  // voz que pede confirmação mas exige o mouse não serve para nada: sem isso
  // o operador teria que dizer a frase inteira de novo.
  if (ehAfirmativa(turno.texto)) {
    const pendente = pendenciaAtiva(turno.companyId, turno.userId);
    if (pendente && ctx.podeEscrever) {
      try {
        const resultado = await confirmarAcao(pendente.chave, ctx);
        gravarHistorico(chave, turno.texto, resultado.fala);
        logger.info(
          `[VoiceAgent] operador ${turno.userId} confirmou por voz: ${pendente.chave}`
        );
        return {
          fala: resultado.fala,
          aguardandoConfirmacao: false,
          ferramentas: []
        };
      } catch (erro) {
        logger.error(
          `[VoiceAgent] confirmação por voz falhou: ${(erro as Error).message}`
        );
      }
    }
  }

  const mensagens: MensagemChat[] = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT_AGENTE}\n\nSeu ID de usuário é ${
        turno.userId
      }.${ctx.podeEscrever ? "" : " Você só pode consultar; não alterar nada."}`
    },
    // Turnos anteriores, senão "agora fecha ele" não tem o que referenciar.
    ...lerHistorico(chave),
    { role: "user", content: turno.texto }
  ];

  const usadas: { nome: string; fala: string }[] = [];
  let pendente: ResultadoAcao | null = null;
  let fala = "";

  // Duas passadas: na segunda, o modelo já vê o resultado da ferramenta.
  for (let volta = 0; volta < 3; volta += 1) {
    let saida: {
      texto: string;
      chamadas: { id: string; nome: string; argumentos: any }[];
    };

    try {
      saida = await chamarModeloComTools(settings, mensagens);
    } catch (erro) {
      // Modelo sem tools (versão antiga do Ollama): texto puro ainda serve.
      logger.warn(
        `[VoiceAgent] tool-calling indisponível: ${(erro as Error).message}`
      );
      try {
        fala = await chamarModeloSimples(settings, mensagens);
      } catch (erroTexto) {
        // Sem LLM nao ha resposta, mas o painel precisa saber o que houve
        // em vez de receber 500 cru.
        logger.error(
          `[VoiceAgent] LLM indisponível: ${(erroTexto as Error).message}`
        );
        throw new AiHttpError(
          `Não consegui falar com a IA agora: ${(erroTexto as Error).message}`,
          503
        );
      }
      break;
    }

    fala = saida.texto;

    if (!saida.chamadas.length) {
      // Terminou: ou respondeu, ou precisa que o usuário confirme.
      break;
    }

    mensagens.push({
      role: "assistant",
      content: saida.texto,
      tool_calls: saida.chamadas.map(c => ({
        id: c.id,
        type: "function",
        function: { name: c.nome, arguments: JSON.stringify(c.argumentos) }
      }))
    });

    const chamada = saida.chamadas[0];
    const ferramenta = ferramentasPorNome(chamada.nome);

    if (!ferramenta) {
      mensagens.push({
        role: "tool",
        tool_call_id: chamada.id,
        name: chamada.nome,
        content: "Ferramenta inexistente."
      });
      continue;
    }

    let resultado: ResultadoAcao;
    try {
      resultado = await ferramenta.executar(chamada.argumentos, ctx);
    } catch (erro) {
      logger.error(
        `[VoiceAgent] ferramenta ${chamada.nome} falhou: ${
          (erro as Error).message
        }`
      );
      resultado = { fala: `Falha ao rodar ${chamada.nome}.` };
    }

    usadas.push({ nome: chamada.nome, fala: resultado.fala });

    // Pedido de confirmação: segura aqui e não deixa o modelo inventar
    // que a ação já foi feita.
    if (resultado.precisaConfirmacao && resultado.chave) {
      const chave = registrarPendente(
        resultado.chave,
        turno.companyId,
        turno.userId,
        resultado.dados
      );
      pendente = { ...resultado, chave };
      break;
    }

    mensagens.push({
      role: "tool",
      tool_call_id: chamada.id,
      name: chamada.nome,
      content: JSON.stringify({
        fala: resultado.fala,
        dados: resultado.dados ?? null
      })
    });
  }

  if (pendente) {
    gravarHistorico(chave, turno.texto, pendente.fala);
    return {
      fala: pendente.fala,
      aguardandoConfirmacao: true,
      chave: pendente.chave,
      ferramentas: usadas
    };
  }

  // O modelo às vezes devolve só a chamada da ferramenta e texto vazio
  // depois de receber o resultado. Ouvir "Não entendi" depois de uma
  // consulta que deu certo seria mentira; a resposta honesta é a da
  // própria ferramenta.
  if (!fala && usadas.length > 0) {
    fala = usadas[usadas.length - 1].fala;
  }

  const respostaFinal = fala || "Não entendi. Repita o comando.";
  gravarHistorico(chave, turno.texto, respostaFinal);

  return {
    fala: respostaFinal,
    aguardandoConfirmacao: false,
    ferramentas: usadas
  };
};

export { AiHttpError };
