import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import {
  DeleteOutline,
  DescriptionOutlined,
  Link as LinkIcon,
  Replay,
  Search as SearchIcon
} from "@material-ui/icons";
import { toast } from "react-toastify";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../MainHeader";
import MainHeaderButtonsWrapper from "../MainHeaderButtonsWrapper";
import Title from "../Title";
import ConfirmationModal from "../ConfirmationModal";
import toastError from "../../errors/toastError";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(1),
    overflowY: "scroll",
    ...theme.scrollbarStyles
  },
  formControl: {
    margin: theme.spacing(1),
    minWidth: 180
  },
  grow: { flex: 1 },
  linhaTrecho: {
    borderLeft: `3px solid ${theme.palette.primary.main}`,
    paddingLeft: theme.spacing(1),
    marginTop: theme.spacing(1)
  },
  score: {
    fontVariantNumeric: "tabular-nums",
    fontWeight: "bold"
  },
  erro: { color: theme.palette.error.main },
  pronto: { color: theme.palette.success.main }
}));

const CORES_STATUS = {
  pronto: "primary",
  erro: "secondary",
  indexando: "default"
};

const KnowledgePanel = ({ embutido = false }) => {
  const classes = useStyles();
  const [bases, setBases] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [selectedBase, setSelectedBase] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [confirmaBase, setConfirmaBase] = useState(null);
  const [confirmaDoc, setConfirmaDoc] = useState(null);

  // diálogo de criação de base
  const [modalBase, setModalBase] = useState(false);
  const [formBase, setFormBase] = useState({
    name: "",
    description: "",
    queueId: ""
  });
  const [filas, setFilas] = useState([]);

  // diálogo de documento
  const [modalDoc, setModalDoc] = useState(false);
  const [modoDoc, setModoDoc] = useState("arquivo");
  const [enviando, setEnviando] = useState(false);
  const [arquivo, setArquivo] = useState(null);
  const [formDoc, setFormDoc] = useState({ title: "", content: "", url: "" });

  // teste de busca
  const [modalBusca, setModalBusca] = useState(false);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);

  const carregarBases = useCallback(async () => {
    try {
      setCarregando(true);
      const { data } = await api.get("/knowledge-bases");
      setBases(data.bases || []);
    } catch (err) {
      toastError(err);
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarDocumentos = useCallback(async baseId => {
    try {
      const { data } = await api.get(`/knowledge-bases/${baseId}/documents`);
      setDocuments(data.documentos || []);
    } catch (err) {
      toastError(err);
    }
  }, []);

  const abrirBase = useCallback(
    async base => {
      setSelectedBase(base);
      setResultados(null);
      await carregarDocumentos(base.id);
    },
    [carregarDocumentos]
  );

  useEffect(() => {
    carregarBases();
    api
      .get("/queue")
      .then(({ data }) => setFilas(data))
      .catch(() => setFilas([]));
  }, [carregarBases]);

  // ------------------------------------------------------------------ bases

  const salvarBase = async () => {
    try {
      await api.post("/knowledge-bases", {
        ...formBase,
        queueId: formBase.queueId === "" ? null : Number(formBase.queueId)
      });
      toast.success(i18n.t("knowledge.toast.baseCreated"));
      setModalBase(false);
      setFormBase({ name: "", description: "", queueId: "" });
      carregarBases();
    } catch (err) {
      toastError(err);
    }
  };

  const excluirBase = async () => {
    try {
      await api.delete(`/knowledge-bases/${confirmaBase.id}`);
      toast.success(i18n.t("knowledge.toast.baseDeleted"));
      if (selectedBase?.id === confirmaBase.id) {
        setSelectedBase(null);
        setDocuments([]);
      }
      carregarBases();
    } catch (err) {
      toastError(err);
    }
    setConfirmaBase(null);
  };

  const reindexar = async base => {
    try {
      setCarregando(true);
      const { data } = await api.post(`/knowledge-bases/${base.id}/reindex`);
      if (data.comErro > 0) {
        toast.error(`${data.prontos} prontos, ${data.comErro} com erro`);
      } else {
        toast.success(`${data.prontos} documentos reindexados`);
      }
      if (selectedBase?.id === base.id) carregarDocumentos(base.id);
    } catch (err) {
      toastError(err);
    } finally {
      setCarregando(false);
    }
  };

  // ------------------------------------------------------------- documentos

  const enviarDocumento = async () => {
    try {
      setEnviando(true);
      const url = `/knowledge-bases/${selectedBase.id}/documents`;

      if (modoDoc === "arquivo") {
        if (!arquivo) {
          toast.error(i18n.t("knowledge.toast.selectFile"));
          return;
        }
        const dados = new FormData();
        dados.append("file", arquivo);
        if (formDoc.title) dados.append("title", formDoc.title);
        await api.post(`${url}/upload`, dados);
      } else if (modoDoc === "texto") {
        await api.post(`${url}/texto`, formDoc);
      } else {
        await api.post(`${url}/url`, formDoc);
      }

      toast.success(i18n.t("knowledge.toast.documentAdded"));
      setModalDoc(false);
      setArquivo(null);
      setFormDoc({ title: "", content: "", url: "" });
      carregarDocumentos(selectedBase.id);
      carregarBases();
    } catch (err) {
      toastError(err);
    } finally {
      setEnviando(false);
    }
  };

  const excluirDocumento = async () => {
    try {
      await api.delete(`/knowledge-documents/${confirmaDoc.id}`);
      toast.success(i18n.t("knowledge.toast.documentDeleted"));
      carregarDocumentos(selectedBase.id);
      carregarBases();
    } catch (err) {
      toastError(err);
    }
    setConfirmaDoc(null);
  };

  // ------------------------------------------------------------------ busca

  const testarBusca = async () => {
    try {
      setBuscando(true);
      const { data } = await api.post(
        `/knowledge-bases/${selectedBase.id}/search`,
        {
          query
        }
      );
      setResultados(data.resultados);
    } catch (err) {
      toastError(err);
    } finally {
      setBuscando(false);
    }
  };

  const rotuloFila = useMemo(() => {
    const mapa = {};
    filas.forEach(f => {
      mapa[f.id] = f.name;
    });
    return mapa;
  }, [filas]);

  // ==================================================================== tela

  // Quando embutido (aba dentro de /prompts), o MainContainer e o header já
  // existem na página: repetir aqui aninhava dois containers com padding duplo.
  const conteudo = (
    <>
      <ConfirmationModal
        title={
          confirmaBase &&
          `${i18n.t("knowledge.confirm.deleteBaseTitle")} ${confirmaBase.name}?`
        }
        open={Boolean(confirmaBase)}
        onClose={() => setConfirmaBase(null)}
        onConfirm={excluirBase}
      >
        {i18n.t("knowledge.confirm.deleteBaseMessage")}
      </ConfirmationModal>

      <ConfirmationModal
        title={
          confirmaDoc &&
          `${i18n.t("knowledge.confirm.deleteDocTitle")} ${confirmaDoc.title}?`
        }
        open={Boolean(confirmaDoc)}
        onClose={() => setConfirmaDoc(null)}
        onConfirm={excluirDocumento}
      >
        {i18n.t("knowledge.confirm.deleteDocMessage")}
      </ConfirmationModal>

      {/* ---------------------------------------------------- criar base */}
      <Dialog
        open={modalBase}
        onClose={() => setModalBase(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{i18n.t("knowledge.modal.createBase")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label={i18n.t("knowledge.form.baseName")}
            value={formBase.name}
            onChange={e => setFormBase({ ...formBase, name: e.target.value })}
          />
          <TextField
            fullWidth
            multiline
            margin="dense"
            label={i18n.t("knowledge.form.baseDescription")}
            value={formBase.description}
            onChange={e =>
              setFormBase({ ...formBase, description: e.target.value })
            }
          />
          <FormControl variant="outlined" margin="dense" fullWidth>
            <InputLabel>{i18n.t("knowledge.form.baseQueue")}</InputLabel>
            <Select
              value={formBase.queueId}
              onChange={e =>
                setFormBase({ ...formBase, queueId: e.target.value })
              }
            >
              <MenuItem value="">{i18n.t("knowledge.form.queueAll")}</MenuItem>
              {filas.map(f => (
                <MenuItem key={f.id} value={f.id}>
                  {f.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" color="textSecondary">
            {i18n.t("knowledge.form.queueHint")}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalBase(false)}>
            {i18n.t("knowledge.buttons.cancel")}
          </Button>
          <Button variant="contained" color="primary" onClick={salvarBase}>
            {i18n.t("knowledge.buttons.save")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ------------------------------------------------ novo documento */}
      <Dialog
        open={modalDoc}
        onClose={() => setModalDoc(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{i18n.t("knowledge.modal.newDocument")}</DialogTitle>
        <DialogContent>
          <Tabs
            value={modoDoc}
            onChange={(e, v) => setModoDoc(v)}
            indicatorColor="primary"
            textColor="primary"
          >
            <Tab label={i18n.t("knowledge.tabs.file")} value="arquivo" />
            <Tab label={i18n.t("knowledge.tabs.text")} value="texto" />
            <Tab label={i18n.t("knowledge.tabs.url")} value="url" />
          </Tabs>

          <TextField
            fullWidth
            margin="dense"
            label={i18n.t("knowledge.form.docTitle")}
            value={formDoc.title}
            onChange={e => setFormDoc({ ...formDoc, title: e.target.value })}
          />

          {modoDoc === "arquivo" && (
            <>
              <Button
                variant="outlined"
                component="label"
                fullWidth
                style={{ marginTop: 8 }}
              >
                {arquivo ? arquivo.name : i18n.t("knowledge.form.chooseFile")}
                <input
                  type="file"
                  hidden
                  accept=".md,.txt,.pdf,.csv"
                  onChange={e => setArquivo(e.target.files?.[0] ?? null)}
                />
              </Button>
              <Typography variant="caption" color="textSecondary">
                {i18n.t("knowledge.form.fileHint")}
              </Typography>
            </>
          )}

          {modoDoc === "texto" && (
            <TextField
              fullWidth
              multiline
              rows={10}
              margin="dense"
              label={i18n.t("knowledge.form.content")}
              value={formDoc.content}
              onChange={e =>
                setFormDoc({ ...formDoc, content: e.target.value })
              }
            />
          )}

          {modoDoc === "url" && (
            <TextField
              fullWidth
              margin="dense"
              placeholder="https://..."
              label={i18n.t("knowledge.form.url")}
              value={formDoc.url}
              onChange={e => setFormDoc({ ...formDoc, url: e.target.value })}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalDoc(false)}>
            {i18n.t("knowledge.buttons.cancel")}
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={enviarDocumento}
            disabled={enviando}
          >
            {enviando ? (
              <CircularProgress size={20} />
            ) : (
              i18n.t("knowledge.buttons.index")
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ---------------------------------------------------- testar busca */}
      <Dialog
        open={modalBusca}
        onClose={() => setModalBusca(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>{i18n.t("knowledge.modal.testSearch")}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label={i18n.t("knowledge.form.query")}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyPress={e => {
              if (e.key === "Enter" && query.trim()) testarBusca();
            }}
          />
          <Button
            variant="contained"
            color="primary"
            style={{ marginTop: 8 }}
            onClick={testarBusca}
            disabled={buscando || !query.trim()}
          >
            {buscando ? (
              <CircularProgress size={20} />
            ) : (
              i18n.t("knowledge.buttons.search")
            )}
          </Button>

          {resultados && (
            <div style={{ marginTop: 16 }}>
              <Typography variant="subtitle2" gutterBottom>
                {i18n.t("knowledge.results.title", {
                  count: resultados.length
                })}
              </Typography>
              {resultados.length === 0 && (
                <Typography variant="body2" color="textSecondary">
                  {i18n.t("knowledge.results.empty")}
                </Typography>
              )}
              {resultados.map((r, idx) => (
                <Paper
                  key={`${r.documentId}-${idx}`}
                  variant="outlined"
                  style={{ padding: 8, marginTop: 8 }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <Chip
                      size="small"
                      label={`${r.score}`}
                      className={classes.score}
                    />
                    <Typography variant="subtitle2">{r.titulo}</Typography>
                    {r.fonte && (
                      <Typography variant="caption" color="textSecondary">
                        {r.fonte}
                      </Typography>
                    )}
                  </div>
                  <div className={classes.linhaTrecho}>
                    <Typography variant="body2">{r.texto}</Typography>
                  </div>
                </Paper>
              ))}
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalBusca(false)}>
            {i18n.t("knowledge.buttons.close")}
          </Button>
        </DialogActions>
      </Dialog>

      {embutido ? null : (
        <MainHeader>
          <Title>{i18n.t("knowledge.title")}</Title>
        </MainHeader>
      )}

      <Paper className={classes.mainPaper} variant="outlined">
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <MainHeaderButtonsWrapper>
              <Button
                variant="contained"
                color="primary"
                onClick={() => setModalBase(true)}
              >
                {i18n.t("knowledge.buttons.newBase")}
              </Button>
            </MainHeaderButtonsWrapper>

            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{i18n.t("knowledge.table.base")}</TableCell>
                  <TableCell>{i18n.t("knowledge.table.scope")}</TableCell>
                  <TableCell align="center">
                    {i18n.t("knowledge.table.actions")}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bases.length === 0 && !carregando && (
                  <TableRow>
                    <TableCell colSpan={3}>
                      {i18n.t("knowledge.empty.bases")}
                    </TableCell>
                  </TableRow>
                )}
                {bases.map(base => (
                  <TableRow
                    key={base.id}
                    hover
                    selected={selectedBase?.id === base.id}
                    onClick={() => abrirBase(base)}
                    style={{ cursor: "pointer" }}
                  >
                    <TableCell>
                      <Typography variant="body2">{base.name}</Typography>
                      {base.description && (
                        <Typography variant="caption" color="textSecondary">
                          {base.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {base.queueId ? (
                        <Chip
                          size="small"
                          color="primary"
                          label={rotuloFila[base.queueId] || `#${base.queueId}`}
                        />
                      ) : (
                        <Chip
                          size="small"
                          label={i18n.t("knowledge.scope.all")}
                        />
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title={i18n.t("knowledge.buttons.reindex")}>
                        <IconButton
                          size="small"
                          onClick={e => {
                            e.stopPropagation();
                            reindexar(base);
                          }}
                        >
                          <Replay fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={i18n.t("knowledge.buttons.delete")}>
                        <IconButton
                          size="small"
                          onClick={e => {
                            e.stopPropagation();
                            setConfirmaBase(base);
                          }}
                        >
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div style={{ flex: 1, minWidth: 320 }}>
            {!selectedBase ? (
              <Typography color="textSecondary" style={{ padding: 16 }}>
                {i18n.t("knowledge.empty.selectBase")}
              </Typography>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Typography variant="h6" className={classes.grow}>
                    {selectedBase.name}
                  </Typography>
                  <Tooltip title={i18n.t("knowledge.buttons.testSearch")}>
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => {
                        setResultados(null);
                        setModalBusca(true);
                      }}
                    >
                      <SearchIcon />
                    </IconButton>
                  </Tooltip>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={() => setModalDoc(true)}
                  >
                    {i18n.t("knowledge.buttons.addDocument")}
                  </Button>
                </div>

                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        {i18n.t("knowledge.table.document")}
                      </TableCell>
                      <TableCell>{i18n.t("knowledge.table.kind")}</TableCell>
                      <TableCell>{i18n.t("knowledge.table.status")}</TableCell>
                      <TableCell align="center">
                        {i18n.t("knowledge.table.actions")}
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {documents.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          {i18n.t("knowledge.empty.documents")}
                        </TableCell>
                      </TableRow>
                    )}
                    {documents.map(doc => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6
                            }}
                          >
                            {doc.kind === "url" ? (
                              <LinkIcon fontSize="small" />
                            ) : (
                              <DescriptionOutlined fontSize="small" />
                            )}
                            <Typography variant="body2">{doc.title}</Typography>
                          </div>
                          {doc.errorMessage && (
                            <Typography
                              variant="caption"
                              className={classes.erro}
                            >
                              {doc.errorMessage}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>{doc.kind}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={CORES_STATUS[doc.status] || "default"}
                            label={doc.status}
                          />
                          <Typography variant="caption" color="textSecondary">
                            {` ${doc.chunkCount} ${i18n.t("knowledge.table.chunks")}`}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <IconButton
                            size="small"
                            onClick={() => setConfirmaDoc(doc)}
                          >
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </div>
        </div>
      </Paper>
    </>
  );

  return embutido ? conteudo : <MainContainer>{conteudo}</MainContainer>;
};

export default KnowledgePanel;
