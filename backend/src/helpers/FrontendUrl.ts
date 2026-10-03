/**
 * @helper FrontendUrl
 *
 * `FRONTEND_URL` pode conter mais de uma origem separada por vírgula
 * (ex.: `https://telemax.maximo.tec.br,http://192.168.1.50:3000`) para o mesmo
 * backend servir o front na LAN e no domínio público ao mesmo tempo.
 *
 * Esse helper devolve sempre **uma** URL válida (a primeira da lista),
 * removendo barra final. Use-o em todo lugar que precise montar um link
 * absoluto (imagens, e-mails, reset de senha, financeiro, nopicture).
 *
 * Usar `process.env.FRONTEND_URL` direto quebra nesses casos, gerando
 * `getaddrinfo ENOTFOUND telemax.maximo.tec.br,http`.
 */
const getFrontendUrl = (): string => {
  const primeira = (process.env.FRONTEND_URL || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean)[0];

  return primeira.replace(/\/+$/, "");
};

export default getFrontendUrl;