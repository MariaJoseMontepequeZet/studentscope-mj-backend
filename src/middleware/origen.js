import { ErrorApi } from '../errores.js';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function verificarOrigen(req, res, next) {
  if (METODOS_SEGUROS.has(req.method)) return next();

  const origen = req.get('origin');
  if (origen) {
    let host = null;
    try {
      host = new URL(origen).host;
    } catch {
      host = null;
    }
    if (host !== req.get('host')) {
      return next(new ErrorApi(403, 'ORIGEN_NO_PERMITIDO', 'Origen no permitido'));
    }
  }
  next();
}

export function sinCache(req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}
