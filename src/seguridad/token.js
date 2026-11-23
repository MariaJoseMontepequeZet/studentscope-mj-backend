import jwt from 'jsonwebtoken';

const ALGORITMO = 'HS256';

export function firmarToken(usuarioId, secreto, horas) {
  return jwt.sign({ sub: String(usuarioId) }, secreto, {
    algorithm: ALGORITMO,
    expiresIn: `${horas}h`
  });
}

export function leerCarga(token, secreto) {
  try {
    const carga = jwt.verify(token, secreto, { algorithms: [ALGORITMO] });
    const id = Number(carga.sub);
    if (!Number.isInteger(id) || !Number.isFinite(carga.iat)) return null;
    return { id, emitidoEn: carga.iat };
  } catch {
    return null;
  }
}

export function leerToken(token, secreto) {
  return leerCarga(token, secreto)?.id ?? null;
}
