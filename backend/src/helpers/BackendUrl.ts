/**
 * @helper BackendUrl
 *
 * Devolve a URL publica do backend, sem porta interna, para montar link de
 * midia (foto de contato, audio, video, anuncio, mensagem rapida).
 *
 * `BACKEND_URL` ja e o endereco publico (ex.: https://telemaxapi.maximo.tec.br)
 * e `PROXY_PORT` e a porta do processo Node, que nao e publicada: contatena-la
 * gerava `https://dominio:8080/public/...` e nenhuma imagem ou midia carregava,
 * sobrando no chat so o placeholder.
 *
* `PROXY_PORT` so entra quando `BACKEND_URL` nao e uma URL completa, que e o
 * caso legado de host interno sem esquema. Quem quiser a porta publica deve
 * escreve-la dentro do proprio `BACKEND_URL`; nada e acrescentado depois.
 */
const backendBaseUrl = (): string => {
  const base = String(process.env.BACKEND_URL || "").replace(/\/+$/, "");
  const ehUrlCompleta = /^https?:\/\//i.test(base);
  const porta =
    !ehUrlCompleta && process.env.PROXY_PORT ? `:${process.env.PROXY_PORT}` : "";

  return base + porta;
};

export default backendBaseUrl;