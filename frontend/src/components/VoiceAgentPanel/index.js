/**
 * Painel do agente de voz.
 *
 * O operador fala (ou digita), o backend transcreve, decide com ferramentas e
 * devolve texto + áudio. Ações que alteram o painel NUNCA saem daqui prontas:
 * o backend devolve uma chave e a confirmação fica na tela, com os botões de
 * sim/não. Se o operador trocar de assunto, a chave é esquecida.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import {
  Delete as DeleteIcon,
  GraphicEq as GraphicEqIcon,
  Mic as MicIcon,
  MicOff as MicOffIcon,
  Send as SendIcon,
  Stop as StopIcon,
  VolumeUp as VolumeUpIcon
} from "@mui/icons-material";
import { toast } from "react-toastify";

import api from "../../services/api";
import { i18n } from "../../translate/i18n";

/** Formatos que o MediaRecorder entrega por navegador. */
const MIME_CANDIDATOS = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4"
];

const mimeSuportado = () => {
  if (typeof window === "undefined" || !window.MediaRecorder) return "";
  return MIME_CANDIDATOS.find((t) => window.MediaRecorder.isTypeSupported(t)) ?? "";
};

const VoiceAgentPanel = ({ aoConcluir }) => {
  const [situacao, setSituacao] = useState(null);
  const [transcricao, setTranscricao] = useState("");
  const [texto, setTexto] = useState("");
  const [resposta, setResposta] = useState(null);
  const [pendencia, setPendencia] = useState(null);
  const [ferramentas, setFerramentas] = useState([]);
  const [gravando, setGravando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const gravador = useRef(null);
  const pedacos = useRef([]);
  const audioRef = useRef(null);
  const urlAudio = useRef(null);

  const carregarSituacao = useCallback(async () => {
    try {
      const { data } = await api.get("/voice-agent/status");
      setSituacao(data);
      return data;
    } catch {
      setSituacao({ enabled: false });
      return { enabled: false };
    }
  }, []);

  useEffect(() => {
    carregarSituacao();
  }, [carregarSituacao]);

  // Libera o audio anterior para o blob nao ficar na memoria do navegador.
  useEffect(
    () => () => {
      if (urlAudio.current) URL.revokeObjectURL(urlAudio.current);
    },
    []
  );

  const tocarResposta = (audio) => {
    if (!audio?.base64) return;
    if (urlAudio.current) URL.revokeObjectURL(urlAudio.current);
    const bytes = Uint8Array.from(atob(audio.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: audio.mimeType }));
    urlAudio.current = url;
    audioRef.current = new Audio(url);
    audioRef.current.play().catch(() => {
      /* navegador pode bloquear autoplay: o texto continua na tela */
    });
  };

  const limpar = async () => {
    setResposta(null);
    setPendencia(null);
    setFerramentas([]);
    try {
      await api.post("/voice-agent/reset");
    } catch {
      /* sem pendencia para esquecer */
    }
  };

  const enviarTexto = async (conteudo) => {
    const pergunta = String(conteudo ?? "").trim();
    if (!pergunta || ocupado) return;

    setOcupado(true);
    setTranscricao("");
    setTexto("");
    try {
      const { data } = await api.post("/voice-agent/turn", { texto: pergunta });
      setResposta({ fala: data.fala, audio: data.audio });
      setFerramentas(data.ferramentas ?? []);
      setPendencia(data.aguardandoConfirmacao ? { chave: data.chave } : null);
      tocarResposta(data.audio);
      if (aoConcluir) aoConcluir();
    } catch (err) {
      const mensagem =
        err?.response?.data?.error ?? "Não consegui falar com o agente agora.";
      toast.error(mensagem);
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async (aceite) => {
    if (!pendencia?.chave || ocupado) return;
    setOcupado(true);
    try {
      const { data } = await api.post("/voice-agent/confirm", {
        chave: pendencia.chave,
        aceite
      });
      setPendencia(null);
      setResposta({ fala: data.fala, audio: data.audio });
      tocarResposta(data.audio);
      toast.success(aceite ? data.fala : data.fala, {
        autoClose: aceite ? 4000 : 2000
      });
      if (aoConcluir) aoConcluir();
    } catch (err) {
      toast.error(err?.response?.data?.error ?? "Falha ao confirmar a ação.");
      setPendencia(null);
    } finally {
      setOcupado(false);
    }
  };

  const iniciarGravacao = async () => {
    if (gravando || ocupado) return;
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = mimeSuportado();
      const grav = new MediaRecorder(fluxo, mime ? { mimeType: mime } : undefined);
      pedacos.current = [];

      grav.ondataavailable = (evento) => {
        if (evento.data && evento.data.size > 0) pedacos.current.push(evento.data);
      };
      grav.onstop = async () => {
        fluxo.getTracks().forEach((t) => t.stop());
        setGravando(false);
        setOcupado(true);
        try {
          const tipo = grav.mimeType || "audio/webm";
          const dados = new FormData();
          dados.append(
            "audio",
            new Blob(pedacos.current, { type: tipo }), `agente.${tipo.includes("mp4") ? "m4a" : "webm"}`
          );
          const { data } = await api.post("/voice-agent/turn", dados, {
            headers: { "Content-Type": "multipart/form-data" }
          });
          setTranscricao(data.transcricao ?? "");
          setResposta({ fala: data.fala, audio: data.audio });
          setFerramentas(data.ferramentas ?? []);
          setPendencia(data.aguardandoConfirmacao ? { chave: data.chave } : null);
          tocarResposta(data.audio);
          if (aoConcluir) aoConcluir();
        } catch (err) {
          toast.error(err?.response?.data?.error ?? "Falha ao ouvir o áudio.");
        } finally {
          setOcupado(false);
        }
      };

      gravador.current = grav;
      grav.start();
      setGravando(true);
    } catch {
      toast.error("Não foi possível acessar o microfone.");
    }
  };

  const pararGravacao = () => {
    if (gravador.current && gravador.current.state !== "inactive") {
      gravador.current.stop();
    }
  };

  if (situacao && situacao.enabled === false) {
    return (
      <Alert severity="info" sx={{ mt: 1 }}>
        {i18n.t("voiceAgent.disabled")}
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <GraphicEqIcon color="primary" />
        <Typography variant="h6" fontWeight="bold">
          {i18n.t("voiceAgent.title")}
        </Typography>
        {situacao?.modelo && (
          <Chip size="small" variant="outlined" label={situacao.modelo} />
        )}
        <Chip
          size="small"
          color={situacao?.podeEscrever ? "primary" : "default"}
          label={
            situacao?.podeEscrever
              ? i18n.t("voiceAgent.canWrite")
              : i18n.t("voiceAgent.readOnly")
          }
        />
        <Box sx={{ flex: 1 }} />
        <Tooltip title={i18n.t("voiceAgent.clear")}>
          <span>
            <IconButton onClick={limpar} disabled={(!resposta && !pendencia) || ocupado}>
              <DeleteIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Paper variant="outlined" sx={{ p: 2, bgcolor: "#f8f9fa" }}>
        <Typography variant="caption" color="text.secondary">
          {i18n.t("voiceAgent.help")}
        </Typography>
      </Paper>

      {transcricao && (
        <Alert severity="info" icon={<MicIcon fontSize="inherit" />}>
          <Typography variant="caption" color="text.secondary">
            {i18n.t("voiceAgent.heard")}
          </Typography>
          <Typography variant="body2">{transcricao}</Typography>
        </Alert>
      )}

      {resposta && (
        <Alert severity={resposta.fala?.includes("Não consegui") ? "warning" : "success"}>
          <Typography variant="body2">{resposta.fala}</Typography>
          {resposta.audio && (
            <IconButton size="small" onClick={() => tocarResposta(resposta.audio)} sx={{ mt: 0.5 }}>
              <VolumeUpIcon fontSize="small" />
            </IconButton>
          )}
        </Alert>
      )}

      {ferramentas.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {ferramentas.map((f, i) => (
            <Chip key={`${f.nome}-${i}`} size="small" variant="outlined" label={f.nome} />
          ))}
        </Stack>
      )}

      {pendencia && (
        <Alert
          severity="warning"
          action={
            <Stack direction="row" spacing={1}>
              <Button size="small" color="inherit" onClick={() => confirmar(false)} disabled={ocupado}>
                {i18n.t("voiceAgent.no")}
              </Button>
              <Button size="small" variant="contained" color="warning" onClick={() => confirmar(true)} disabled={ocupado}>
                {i18n.t("voiceAgent.yes")}
              </Button>
            </Stack>
          }
        >
          <Typography variant="caption" fontWeight="bold">
            {i18n.t("voiceAgent.confirmTitle")}
          </Typography>
          <Typography variant="body2">{i18n.t("voiceAgent.confirmBody")}</Typography>
        </Alert>
      )}

      <Divider />

      <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
        <Tooltip title={gravando ? i18n.t("voiceAgent.stop") : i18n.t("voiceAgent.record")}>
          <span>
            <IconButton
              onClick={gravando ? pararGravacao : iniciarGravacao}
              disabled={situacao?.enabled === false}
              color={gravando ? "error" : "primary"}
              sx={{
                bgcolor: gravando ? "rgba(231, 80, 90, 0.15)" : "rgba(53, 152, 220, 0.1)",
                "&:hover": { bgcolor: gravando ? "rgba(231, 80, 90, 0.25)" : "rgba(53, 152, 220, 0.2)" }
              }}
            >
              {gravando ? <StopIcon /> : <MicIcon />}
            </IconButton>
          </span>
        </Tooltip>

        <TextField
          fullWidth
          size="small"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviarTexto(texto);
            }
          }}
          placeholder={i18n.t("voiceAgent.placeholder")}
          disabled={situacao?.enabled === false}
          inputProps={{ "aria-label": i18n.t("voiceAgent.placeholder") }}
        />

        <IconButton
          onClick={() => enviarTexto(texto)}
          disabled={!texto.trim() || ocupado || situacao?.enabled === false}
          color="primary"
        >
          {ocupado ? <CircularProgress size={22} /> : <SendIcon />}
        </IconButton>
      </Box>

      {gravando && (
        <Stack direction="row" spacing={1} alignItems="center">
          <MicOffIcon color="error" fontSize="small" />
          <Typography variant="caption" color="error">
            {i18n.t("voiceAgent.listening")}
          </Typography>
        </Stack>
      )}
    </Stack>
  );
};

export default VoiceAgentPanel;
