import { CookieOptions, Response } from "express";

/**
 * O cookie de refresh precisa de atributos explicitos.
 *
 * Sem `maxAge` ele vira cookie de sessao: some quando o navegador fecha e o
 * usuario precisa refazer o login. Sem `sameSite`/`secure` explicitos o
 * navegador assume `Lax`, que nao viaja em chamada de outra origem, o refresh
 * responde 401 e o front desloga no meio do uso.
 *
 * Os dois valores sao sobrescritiveis por env porque a origem muda entre o
 * dominio publico e o acesso pela rede local:
 *   COOKIE_SAMESITE  lax | none   (default lax)
 *   COOKIE_SECURE    true|false  (default true)
 *   COOKIE_DOMAIN    dominio opcional, ex.: .maximo.tec.br
 *
 * Atencao: `sameSite: "none"` exige `secure: true`. Acesso pela rede local em
 * http://192.168.1.50:3000 nao atende a essa exigencia, entao para esse caminho
 * o painel precisa ser servido por https.
 */
export const refreshCookieOptions = (): CookieOptions => {
  const sameSite = (process.env.COOKIE_SAMESITE || "lax").toLowerCase();
  const secure = process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === "true"
    : true;

  if (sameSite === "none" && !secure) {
    throw new Error(
      "COOKIE_SAMESITE=none exige COOKIE_SECURE=true: o navegador recusa cookie cross-site sem HTTPS."
    );
  }

  return {
    httpOnly: true,
    // 7 dias, o mesmo prazo do refreshExpiresIn em config/auth.ts
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
    sameSite: sameSite as CookieOptions["sameSite"],
    secure,
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {})
  };
};

export const SendRefreshToken = (res: Response, token: string): void => {
  res.cookie("jrt", token, refreshCookieOptions());
};