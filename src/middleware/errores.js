import { ErrorApi } from '../errores.js';

export function manejarErrores(registrar = console.error) {
  return function manejador(error, req, res, next) {
    if (res.headersSent) return next(error);

    if (error instanceof ErrorApi) {
      const cuerpo = { error: error.message, codigo: error.codigo };
      if (error.campos) cuerpo.campos = error.campos;
      return res.status(error.estado).json(cuerpo);
    }
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'El cuerpo no es un JSON válido', codigo: 'JSON_INVALIDO' });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: 'El cuerpo es demasiado grande', codigo: 'CUERPO_GRANDE' });
    }

    registrar('Error no controlado:', error);
    res.status(500).json({ error: 'Error interno del servidor', codigo: 'ERROR_INTERNO' });
  };
}
