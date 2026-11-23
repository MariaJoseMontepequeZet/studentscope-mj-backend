import { ErrorApi } from '../errores.js';

const ESPERA_POR_DEFECTO_MS = 3000;

export function crearClienteRiesgo({ url, peticion = fetch, esperaMs = ESPERA_POR_DEFECTO_MS }) {
  return {
    async evaluar(estudiante) {
      if (!url) {
        throw new ErrorApi(503, 'RIESGO_NO_DISPONIBLE', 'El servicio de riesgo de abandono no está configurado');
      }

      let respuesta;
      try {
        respuesta = await peticion(`${url}/riesgo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            progreso: estudiante.progreso,
            fechaInscripcion: estudiante.fechaInscripcion,
            plan: estudiante.plan
          }),
          signal: AbortSignal.timeout(esperaMs)
        });
      } catch {
        throw new ErrorApi(502, 'RIESGO_NO_RESPONDE', 'El servicio de riesgo de abandono no responde');
      }

      if (!respuesta.ok) {
        throw new ErrorApi(502, 'RIESGO_ERROR', 'El servicio de riesgo de abandono devolvió un error');
      }
      return respuesta.json();
    }
  };
}
