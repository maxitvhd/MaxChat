/**
 * @TercioSantos-0 |
 * middleware/isAdmin |
 * @descrição: exige perfil de administrador.
 *
 *              A tela de Prompts/Conhecimento já esconde o menu para
 *              atendente, mas isso não impede nada: sem este middleware, o
 *              atendente chamaria a API direto e criaria/apagaria base da
 *              própria empresa. O perfil vem do token (req.user), nunca do
 *              body.
 */
import { Request, Response, NextFunction } from "express";

export default function isAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const perfil = String(req.user?.profile ?? "").toLowerCase();

  if (perfil !== "admin" && perfil !== "super") {
    return res.status(403).json({
      error: "Apenas administradores podem alterar a base de conhecimento."
    });
  }

  return next();
}
