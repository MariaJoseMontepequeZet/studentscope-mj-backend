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

    // Otros rechazos del lector del cuerpo, como una codificación no admitida
    if (error.type && error.status >= 400 && error.status < 500) {
      return res.status(error.status).json({ error: 'La solicitud no es válida', codigo: 'SOLICITUD_INVALIDA' });
    }

    registrar('Error no controlado:', error);
    res.status(500).json({ error: 'Error interno del servidor', codigo: 'ERROR_INTERNO' });
  };
}
