import jwt from 'jsonwebtoken';

const ALGORITMO = 'HS256';

export function firmarToken(usuarioId, secreto, horas) {
  return jwt.sign({ sub: String(usuarioId) }, secreto, {
    algorithm: ALGORITMO,
    expiresIn: `${horas}h`
  });
}

export function leerToken(token, secreto) {
  try {
    const carga = jwt.verify(token, secreto, { algorithms: [ALGORITMO] });
    const id = Number(carga.sub);
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}
