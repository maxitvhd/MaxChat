import React, { useState, useEffect } from "react";
import * as Yup from "yup";
import { Formik, Form, Field } from "formik";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import CircularProgress from "@material-ui/core/CircularProgress";
import { i18n } from "../../translate/i18n";
import { MenuItem, FormControl, InputLabel, Select } from "@material-ui/core";
import QueueSelectSingle from "../QueueSelectSingle";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import useAiProviderSettings from "../../hooks/useSettings/aiProviderSettings";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    flexWrap: "wrap",
  },
  multFieldLine: {
    display: "flex",
    "& > *:not(:last-child)": {
      marginRight: theme.spacing(1),
    },
  },
  btnWrapper: {
    position: "relative",
  },
  buttonProgress: {
    color: green[500],
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -12,
    marginLeft: -12,
  },
  formControl: {
    margin: theme.spacing(1),
    minWidth: 120,
  },
  colorAdorment: {
    width: 20,
    height: 20,
  },
}));

const PromptSchema = Yup.object().shape({
  name: Yup.string()
    .min(5, "Muito curto!")
    .max(100, "Muito longo!")
    .required("Obrigatório"),
  prompt: Yup.string()
    .min(10, "Muito curto!")
    .required("Descreva o treinamento para Inteligência Artificial"),
  queueId: Yup.number().required("Informe a fila"),
  maxMessages: Yup.number().required("Informe o número máximo de mensagens"),
  maxTokens: Yup.number().notRequired(),
  temperature: Yup.number().notRequired()
});

const replyEngines = [
  { value: "default", label: "Padrão (Config IA)" },
  { value: "ollama", label: "Ollama" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Google Gemini" },
  { value: "anthropic", label: "Anthropic" },
  { value: "jev", label: "TypeSafe (JEV)" },
  { value: "laya", label: "Laya" }
];

const PromptModal = ({ open, onClose, promptId }) => {
  const classes = useStyles();
  const { settings } = useAiProviderSettings();
  const [loading, setLoading] = useState(false);

  const initialState = {
    name: "",
    prompt: "Você é um assistente útil e preciso. Responda de forma clara e objetiva.",
    model: "",
    replyEngine: "default",
    maxTokens: 2000,
    temperature: 0.5,
    apiKey: "",
    queueId: null,
    maxMessages: 10,
    voice: null,
    voiceKey: "",
    voiceRegion: "",
    max_completion_tokens: 0
  };

  const [prompt, setPrompt] = useState(initialState);

  useEffect(() => {
    const fetchPrompt = async () => {
      if (!promptId) {
        setPrompt(initialState);
        return;
      }
      try {
        const { data } = await api.get(`/prompt/${promptId}`);
        setPrompt(prevState => ({ ...prevState, ...data }));
      } catch (err) {
        toastError(err);
      }
    };

    fetchPrompt();
  }, [promptId, open]);

  const handleClose = () => {
    setPrompt(initialState);
    onClose();
  };

  const handleSavePrompt = async values => {
    const promptData = {
      ...values,
      apiKey: values.apiKey || ""
    };
    if (!values.queueId) {
      toastError("Informe o setor");
      return;
    }
    try {
      setLoading(true);
      if (promptId) {
        await api.put(`/prompt/${promptId}`, promptData);
      } else {
        await api.post("/prompt", promptData);
      }
      toast.success(i18n.t("promptModal.success"));
      setLoading(false);
      handleClose();
    } catch (err) {
      setLoading(false);
      toastError(err);
    }
  };

  return (
    <div className={classes.root}>
      <Dialog open={open} onClose={handleClose} maxWidth="md" scroll="paper">
        <DialogTitle id="form-dialog-title">
          {promptId ? i18n.t("promptModal.title.edit") : i18n.t("promptModal.title.add")}
        </DialogTitle>
        <Formik
          initialValues={prompt}
          enableReinitialize={true}
          validationSchema={PromptSchema}
          onSubmit={(values, actions) => {
            setTimeout(() => {
              handleSavePrompt(values);
              actions.setSubmitting(false);
            }, 400);
          }}
        >
          {({ touched, errors, isSubmitting, values }) => (
            <Form>
              <DialogContent dividers>
                <Field
                  as={TextField}
                  label={i18n.t("promptModal.form.name")}
                  autoFocus
                  name="name"
                  error={touched.name && Boolean(errors.name)}
                  helperText={touched.name && errors.name}
                  variant="outlined"
                  margin="dense"
                  fullWidth
                />
                <div className={classes.multFieldLine}>
                  <Field
                    as={TextField}
                    label="Fila"
                    name="queueId"
                    error={touched.queueId && Boolean(errors.queueId)}
                    helperText={touched.queueId && errors.queueId}
                    variant="outlined"
                    margin="dense"
                    fullWidth
                    disabled={true}
                  />
                  <QueueSelectSingle
                    value={values.queueId}
                    onChange={(queueId) => (values.queueId = queueId)}
                    multiple={false}
                  />
                </div>
                <FormControl variant="outlined" margin="dense" fullWidth>
                  <InputLabel id="replyEngine-label">Motor de IA (override)</InputLabel>
                  <Field
                    as={Select}
                    labelId="replyEngine-label"
                    id="replyEngine"
                    name="replyEngine"
                    label="Motor de IA (override)"
                  >
                    {replyEngines.map((engine) => (
                      <MenuItem key={engine.value} value={engine.value}>
                        {engine.label}
                      </MenuItem>
                    ))}
                  </Field>
                  <small style={{ marginTop: 4, color: "#666" }}>
                    Vazio/padrão herda do "Motor padrão" em Configurações &gt; Inteligência Artificial
                  </small>
                </FormControl>
                <Field
                  as={TextField}
                  label="Modelo específico (opcional)"
                  name="model"
                  error={touched.model && Boolean(errors.model)}
                  helperText={touched.model && errors.model}
                  variant="outlined"
                  margin="dense"
                  fullWidth
                  placeholder="Ex.: gemini-2.0-flash, llama3.1:8b"
                />
                <div className={classes.multFieldLine}>
                  <Field
                    as={TextField}
                    label="Máx. mensagens contexto"
                    name="maxMessages"
                    type="number"
                    error={touched.maxMessages && Boolean(errors.maxMessages)}
                    helperText={touched.maxMessages && errors.maxMessages}
                    variant="outlined"
                    margin="dense"
                    fullWidth
                  />
                  <Field
                    as={TextField}
                    label="Máx. tokens"
                    name="maxTokens"
                    type="number"
                    error={touched.maxTokens && Boolean(errors.maxTokens)}
                    helperText={touched.maxTokens && errors.maxTokens}
                    variant="outlined"
                    margin="dense"
                    fullWidth
                  />
                  <Field
                    as={TextField}
                    label="Temperatura"
                    name="temperature"
                    type="number"
                    inputProps={{ step: 0.1, min: 0, max: 2 }}
                    error={touched.temperature && Boolean(errors.temperature)}
                    helperText={touched.temperature && errors.temperature}
                    variant="outlined"
                    margin="dense"
                    fullWidth
                  />
                </div>
                <Field
                  as={TextField}
                  label={i18n.t("promptModal.form.prompt")}
                  name="prompt"
                  error={touched.prompt && Boolean(errors.prompt)}
                  helperText={touched.prompt && errors.prompt}
                  variant="outlined"
                  margin="dense"
                  fullWidth
                  multiline
                  rows={10}
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={handleClose} color="secondary">
                  {i18n.t("promptModal.buttons.cancel")}
                </Button>
                <Button type="submit" color="primary" disabled={loading || isSubmitting}>
                  {loading || isSubmitting ? (
                    <CircularProgress size={24} className={classes.buttonProgress} />
                  ) : (
                    promptId ? i18n.t("promptModal.buttons.okEdit") : i18n.t("promptModal.buttons.okAdd")
                  )}
                </Button>
              </DialogActions>
            </Form>
          )}
        </Formik>
      </Dialog>
    </div>
  );
};

export default PromptModal;
