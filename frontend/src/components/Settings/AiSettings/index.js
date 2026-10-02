import React, { useEffect, useState } from "react";

import Grid from "@material-ui/core/Grid";
import MenuItem from "@material-ui/core/MenuItem";
import FormControl from "@material-ui/core/FormControl";
import InputLabel from "@material-ui/core/InputLabel";
import Select from "@material-ui/core/Select";
import FormHelperText from "@material-ui/core/FormHelperText";
import TextField from "@material-ui/core/TextField";
import Switch from "@material-ui/core/Switch";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import Button from "@material-ui/core/Button";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import CircularProgress from "@material-ui/core/CircularProgress";
import Chip from "@material-ui/core/Chip";
import Divider from "@material-ui/core/Divider";

import { makeStyles } from "@material-ui/core/styles";
import { toast } from "react-toastify";

import useAiProviderSettings from "../../../hooks/useSettings/aiProviderSettings";

const useStyles = makeStyles((theme) => ({
  container: {
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(4),
  },
  selectContainer: {
    width: "100%",
    textAlign: "left",
  },
  section: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  sectionTitle: {
    marginBottom: theme.spacing(1),
    fontWeight: 600,
  },
  aviso: {
    backgroundColor: "#fff8e1",
    borderLeft: "4px solid #f9a825",
    padding: theme.spacing(1.5),
    marginBottom: theme.spacing(2),
    fontSize: 13,
  },
  acoes: {
    display: "flex",
    gap: theme.spacing(1),
    flexWrap: "wrap",
    marginTop: theme.spacing(1),
  },
  chip: {
    margin: theme.spacing(0.5, 0.5, 0.5, 0),
  },
}));

const MASCARA = "********";

/** Campos que não são chave e devem ir para a API como string. */
const CAMPOS_TEXTO = [
  "ollamaUrl",
  "ollamaModel",
  "openaiUrl",
  "openaiModel",
  "geminiUrl",
  "geminiModel",
  "anthropicUrl",
  "anthropicModel",
  "jevUrl",
  "jevModel",
  "jevQuestions",
  "layaUrl",
  "layaModel",
  "ttsUrl",
  "ttsModel",
  "ttsVoice",
  "ttsEndpoint",
  "ttsDeployment",
  "ttsRegion",
  "sttUrl",
  "sttModel",
  "qdrantUrl",
  "qdrantCollectionPrefix"
];

const CAMPOS_CHAVE = [
  "openaiApiKey",
  "geminiApiKey",
  "anthropicApiKey",
  "jevApiKey",
  "layaApiKey",
  "ttsApiKey",
  "sttApiKey",
  "qdrantApiKey"
];

const CAMPOS_NUMERO = [
  "requestTimeout",
  "maxHistoryMessages",
  "ttsSpeed"
];

/**
 * Rótulos amigáveis para os campos de chave (a API devolve a máscara).
 * O placeholder mostra apenas se a chave JÁ foi salva, nunca o valor.
 */
const rotuloChave = (campo) => {
  const mapa = {
    openaiApiKey: "OpenAI",
    geminiApiKey: "Gemini",
    anthropicApiKey: "Anthropic",
    jevApiKey: "TypeSafe (JEV)",
    layaApiKey: "Laya",
    ttsApiKey: "TTS",
    sttApiKey: "STT",
    qdrantApiKey: "Qdrant"
  };
  return `Chave da API${mapa[campo] ? ` (${mapa[campo]})` : ""}`;
};

export default function AiSettings() {
  const classes = useStyles();
  const { getAll, getOptions, update, listarModelos, listarColecoes, testar } =
    useAiProviderSettings();

  const [form, setForm] = useState({});
  const [listas, setListas] = useState({
    replyEngine: [],
    routingEngine: [],
    ttsProvider: [],
    sttProvider: [],
    vozesPtBr: [],
    avisoVoz: ""
  });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(null);
  const [modelosOllama, setModelosOllama] = useState([]);
  const [colecoes, setColecoes] = useState([]);

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      try {
        const [dados, opcoes] = await Promise.all([getAll(), getOptions()]);
        setForm(dados || {});
        setListas(opcoes || {});
      } catch (e) {
        toast.error("Falha ao carregar as configurações de IA");
      }
      setCarregando(false);
    }
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const alterar = (campo, valor) => {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  };

  /** Remove a máscara dos campos de chave que o usuário não editou. */
  const montarPayload = () => {
    const payload = {};

    for (const [chave, valor] of Object.entries(form)) {
      if (chave.endsWith("Configurado")) continue;
      if (CAMPOS_CHAVE.includes(chave) && valor === MASCARA) continue;
      payload[chave] = valor;
    }

    CAMPOS_TEXTO.forEach((c) => {
      if (payload[c] !== undefined) payload[c] = String(payload[c] ?? "");
    });

    CAMPOS_NUMERO.forEach((c) => {
      if (payload[c] !== undefined && payload[c] !== "") {
        payload[c] = Number(payload[c]);
      }
    });

    return payload;
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const atualizado = await update(montarPayload());
      setForm(atualizado || {});
      toast.success("Configurações de IA salvas com sucesso.");
    } catch (e) {
      toast.error("Não foi possível salvar as configurações de IA.");
    }
    setSalvando(false);
  };

  const executarTeste = async (provider) => {
    setTestando(provider);
    try {
      const resultado = await testar(provider);
      if (resultado.ok) {
        toast.success(`${provider}: ${resultado.mensagem}`);
      } else {
        toast.warn(`${provider}: ${resultado.mensagem}`);
      }
    } catch (e) {
      toast.error(`${provider}: falha na verificação`);
    }
    setTestando(null);
  };

  const carregarModelos = async () => {
    try {
      const { models } = await listarModelos("ollama");
      setModelosOllama(models || []);
      if (!models?.length) toast.warn("Nenhum modelo encontrado no Ollama.");
    } catch (e) {
      toast.error("Não foi possível listar os modelos do Ollama.");
    }
  };

  const carregarColecoes = async () => {
    try {
      const { collections } = await listarColecoes();
      setColecoes(collections || []);
      toast.success(`${collections?.length ?? 0} coleção(ões) da empresa`);
    } catch (e) {
      toast.error("Não foi possível listar as coleções do Qdrant.");
    }
  };

  const rotulo = (valor) => {
    const mapa = {
      default: "Padrão (sem IA)",
      jev: "JEV (TypeSafe)",
      laya: "Laya",
      openai: "OpenAI",
      gemini: "Gemini",
      anthropic: "Anthropic (Claude)",
      ollama: "Ollama",
      disabled: "Desativado",
      custom: "Nossa API (padrão)",
      azure: "Azure Speech",
      azureopenai: "Azure OpenAI"
    };
    return mapa[valor] || valor;
  };

  const botaoTestar = (provider) => (
    <Button
      size="small"
      variant="outlined"
      disabled={testando !== null}
      onClick={() => executarTeste(provider)}
    >
      {testando === provider ? <CircularProgress size={16} /> : "Testar conexão"}
    </Button>
  );

  const avisoApiKey = (campo) =>
    form[`${campo}Configurado`] ? "Chave salva. Deixe em branco para manter." : "Não configurada";

  const campoTexto = (campo, label, { senha = false, helper = "" } = {}) => (
    <Grid xs={12} sm={6} md={4} item key={campo}>
      <FormControl className={classes.selectContainer}>
        <TextField
          id={campo}
          name={campo}
          margin="dense"
          label={label}
          variant="outlined"
          fullWidth
          type={senha ? "password" : "text"}
          value={form[campo] ?? ""}
          helperText={helper}
          onChange={(e) => alterar(campo, e.target.value)}
        />
      </FormControl>
    </Grid>
  );

  const campoNumero = (campo, label) => (
    <Grid xs={12} sm={6} md={4} item key={campo}>
      <FormControl className={classes.selectContainer}>
        <TextField
          id={campo}
          name={campo}
          margin="dense"
          label={label}
          type="number"
          variant="outlined"
          fullWidth
          value={form[campo] ?? ""}
          onChange={(e) => alterar(campo, e.target.value)}
        />
      </FormControl>
    </Grid>
  );

  const campoChave = (campo) => (
    <Grid xs={12} sm={6} md={4} item key={campo}>
      <FormControl className={classes.selectContainer}>
        <TextField
          id={campo}
          name={campo}
          margin="dense"
          label={rotuloChave(campo)}
          type="password"
          variant="outlined"
          fullWidth
          value={form[campo] ?? ""}
          helperText={avisoApiKey(campo)}
          onChange={(e) => alterar(campo, e.target.value)}
        />
      </FormControl>
    </Grid>
  );

  const campoSelecao = (campo, label, valores, {Ajuda} = {}) => (
    <Grid xs={12} sm={6} md={4} item key={campo}>
      <FormControl className={classes.selectContainer}>
        <InputLabel id={`${campo}-label`}>{label}</InputLabel>
        <Select
          labelId={`${campo}-label`}
          value={form[campo] ?? ""}
          onChange={(e) => alterar(campo, e.target.value)}
        >
          {(valores ?? []).map((v) => (
            <MenuItem key={v} value={v}>
              {rotulo(v)}
            </MenuItem>
          ))}
        </Select>
        {Ajuda ? <FormHelperText>{Ajuda}</FormHelperText> : null}
      </FormControl>
    </Grid>
  );

  if (carregando) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <CircularProgress />
      </div>
    );
  }

  return (
    <div className={classes.container}>
      <Paper className={classes.aviso} elevation={0}>
        <strong>Atenção às vozes:</strong> {listas.avisoVoz}
      </Paper>

      {/*------------------------------------------------ GERAL */}
      <Paper className={classes.section} elevation={1}>
        <Typography className={classes.sectionTitle}>Geral</Typography>
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={4} item>
            <FormControlLabel
              control={
                <Switch
                  checked={!!form.enabled}
                  onChange={(e) => alterar("enabled", e.target.checked)}
                  color="primary"
                />
              }
              label="Ativar módulo de IA"
            />
          </Grid>
          {campoSelecao(
            "defaultReplyEngine",
            "Motor de resposta padrão",
            listas.replyEngine,
            { Ajuda: "Usado quando o prompt da fila não define um motor." }
          )}
          {campoNumero("requestTimeout", "Timeout das requisições (ms)")}
          {campoNumero("maxHistoryMessages", "Mensagens de histórico para a IA")}

          <Grid xs={12} item>
            <Divider />
          </Grid>

          <Grid xs={12} sm={6} md={4} item>
            <FormControlLabel
              control={
                <Switch
                  checked={!!form.memoryEnabled}
                  onChange={(e) => alterar("memoryEnabled", e.target.checked)}
                  color="primary"
                />
              }
              label="Ligar memória de longo prazo (Qdrant)"
            />
          </Grid>
        </Grid>
      </Paper>

      {/*------------------------------------------------ ROTEAMENTO */}
      <Paper className={classes.section} elevation={1}>
        <Typography className={classes.sectionTitle}>
          Roteamento inteligente (JEV / Laya)
        </Typography>
        <Grid container spacing={2}>
          {campoSelecao(
            "routingEngine",
            "Motor de roteamento",
            listas.routingEngine,
            { Ajuda: "Desativado mantém o fluxo atual de atendimento humano." }
          )}
          {campoNumero("routingConfidenceThreshold", "Confiança mínima (0 a 1)")}
          <Grid xs={12} sm={6} md={4} item>
            <FormControlLabel
              control={
                <Switch
                  checked={!!form.fallbackOnLowConfidence}
                  onChange={(e) => alterar("fallbackOnLowConfidence", e.target.checked)}
                  color="primary"
                />
              }
              label="Escalar para humano quando a confiança for baixa"
            />
          </Grid>

          <Grid xs={12} item>
            <Divider />
          </Grid>

          <Grid xs={12} item>
            <Typography variant="subtitle2">TypeSafe (JEV)</Typography>
          </Grid>
          {campoTexto("jevUrl", "URL do JEV", {
            helper: "Padrão: https://api.typesafe.ai"
          })}
          {campoChave("jevApiKey")}
          {campoTexto("jevModel", "Modelo", { helper: "Padrão: jev-latest" })}

          <Grid xs={12} item>
            <TextField
              id="jevQuestions"
              name="jevQuestions"
              margin="dense"
              label="Perguntas do JEV (JSON)"
              variant="outlined"
              fullWidth
              multiline
              rows={8}
              value={form.jevQuestions ?? ""}
              helperText="Spec enviada ao JEV. Vazio usa a spec padrão (intenção + certeza). Veja o formato em services/AiServices/JevService.ts"
              onChange={(e) => alterar("jevQuestions", e.target.value)}
            />
          </Grid>

          <Grid xs={12} item>
            <Divider />
          </Grid>

          <Grid xs={12} item>
            <Typography variant="subtitle2">Laya</Typography>
          </Grid>
          {campoTexto("layaUrl", "URL do servidor Laya", {
            helper: "Trocar de servidor = trocar URL e chave."
          })}
          {campoChave("layaApiKey")}
          {campoTexto("layaModel", "Modelo", {
            helper: "Vazio usa \"default\"."
          })}
        </Grid>
      </Paper>

      {/*------------------------------------------------ LLMs */}
      <Paper className={classes.section} elevation={1}>
        <Typography className={classes.sectionTitle}>
          Providers de texto (LLM)
        </Typography>
        <Grid container spacing={2}>
          <Grid xs={12} item>
            <Typography variant="subtitle2">Ollama</Typography>
          </Grid>
          {campoTexto("ollamaUrl", "URL do Ollama")}
          <Grid xs={12} sm={6} md={4} item>
            <FormControl className={classes.selectContainer}>
              <InputLabel id="ollamaModel-label">Modelo do Ollama</InputLabel>
              <Select
                labelId="ollamaModel-label"
                value={form.ollamaModel ?? ""}
                onChange={(e) => alterar("ollamaModel", e.target.value)}
              >
                <MenuItem value="">Padrão do servidor</MenuItem>
                {modelosOllama.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid xs={12} item>
            <div className={classes.acoes}>
              {botaoTestar("ollama")}
              <Button size="small" variant="text" onClick={carregarModelos}>
                Carregar modelos
              </Button>
            </div>
          </Grid>

          <Grid xs={12} item>
            <Divider />
            <Typography variant="subtitle2">OpenAI</Typography>
          </Grid>
          {campoTexto("openaiUrl", "URL (vazio = api.openai.com)")}
          {campoChave("openaiApiKey")}
          {campoTexto("openaiModel", "Modelo", { helper: "Padrão: gpt-4o-mini" })}
          <Grid xs={12} item>
            <div className={classes.acoes}>{botaoTestar("openai")}</div>
          </Grid>

          <Grid xs={12} item>
            <Divider />
            <Typography variant="subtitle2">Gemini</Typography>
          </Grid>
          {campoTexto("geminiUrl", "URL (vazio = Google)")}
          {campoChave("geminiApiKey")}
          {campoTexto("geminiModel", "Modelo", { helper: "Padrão: gemini-2.5-flash" })}
          <Grid xs={12} item>
            <div className={classes.acoes}>{botaoTestar("gemini")}</div>
          </Grid>

          <Grid xs={12} item>
            <Divider />
            <Typography variant="subtitle2">Anthropic (Claude)</Typography>
          </Grid>
          {campoTexto("anthropicUrl", "URL (vazio = api.anthropic.com)")}
          {campoChave("anthropicApiKey")}
          {campoTexto("anthropicModel", "Modelo", {
            helper: "Padrão: claude-3-5-sonnet-latest"
          })}
          <Grid xs={12} item>
            <div className={classes.acoes}>{botaoTestar("anthropic")}</div>
          </Grid>
        </Grid>
      </Paper>

      {/*------------------------------------------------ VOZ */}
      <Paper className={classes.section} elevation={1}>
        <Typography className={classes.sectionTitle}>Voz (TTS e STT)</Typography>
        <Grid container spacing={2}>
          {campoSelecao("ttsProvider", "Provider de voz (TTS)", listas.ttsProvider)}
          {campoSelecao("ttsFormat", "Formato do áudio", ["mp3", "wav"], {
            Ajuda: "mp3 é o padrão e funciona no WhatsApp. ogg/opus não são aceitos pela API custom.",
          })}
          {campoSelecao("ttsVoice", "Voz", listas.vozesPtBr, {
            Ajuda: "Vozes pt-BR da nossa API e da Azure."
          })}
          {campoNumero("ttsSpeed", "Velocidade (1 = normal)")}
          {campoTexto("ttsUrl", "URL da API de voz", {
            helper: "Padrão: http://192.168.1.13:5000"
          })}
          {campoChave("ttsApiKey")}
          {campoTexto("ttsModel", "Modelo de voz")}
          {campoTexto("ttsRegion", "Região (Azure)", { helper: "Ex.: eastus" })}
          {campoTexto("ttsEndpoint", "Endpoint (Azure OpenAI)")}
          {campoTexto("ttsDeployment", "Deployment (Azure OpenAI)")}
          <Grid xs={12} item>
            <div className={classes.acoes}>{botaoTestar("tts")}</div>
          </Grid>

          <Grid xs={12} item>
            <Divider />
            <Typography variant="subtitle2">Transcrição (STT)</Typography>
          </Grid>
          {campoSelecao("sttProvider", "Provider de transcrição", listas.sttProvider)}
          {campoTexto("sttUrl", "URL do STT", {
            helper: "Padrão: http://192.168.1.13:5000"
          })}
          {campoChave("sttApiKey")}
          {campoTexto("sttModel", "Modelo de transcrição", {
            helper: "Padrão: whisper-1"
          })}
        </Grid>
      </Paper>

      {/*------------------------------------------------ QDRANT */}
      <Paper className={classes.section} elevation={1}>
        <Typography className={classes.sectionTitle}>Memória de longo prazo (Qdrant)</Typography>
        <Grid container spacing={2}>
          <Grid xs={12} sm={6} md={4} item>
            <FormControlLabel
              control={
                <Switch
                  checked={!!form.qdrantEnabled}
                  onChange={(e) => alterar("qdrantEnabled", e.target.checked)}
                  color="primary"
                />
              }
              label="Ativar Qdrant"
            />
          </Grid>
          {campoTexto("qdrantUrl", "URL do Qdrant", {
            helper: "Padrão: http://127.0.0.1:6333"
          })}
          {campoChave("qdrantApiKey")}
          {campoTexto("qdrantCollectionPrefix", "Prefixo das coleções", {
            helper: "As coleções desta empresa sempre começam com empresa_<id>_"
          })}
          <Grid xs={12} item>
            <div className={classes.acoes}>
              {botaoTestar("qdrant")}
              <Button size="small" variant="text" onClick={carregarColecoes}>
                Listar coleções da empresa
              </Button>
            </div>
            {colecoes.length > 0 && (
              <div className={classes.chip}>
                {colecoes.map((c) => (
                  <Chip key={c} label={c} size="small" className={classes.chip} />
                ))}
              </div>
            )}
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={2} justifyContent="flex-end">
        <Grid item>
          <Button
            variant="contained"
            color="primary"
            disabled={salvando}
            onClick={salvar}
          >
            {salvando ? "Salvando..." : "Salvar configurações de IA"}
          </Button>
        </Grid>
      </Grid>
    </div>
  );
}