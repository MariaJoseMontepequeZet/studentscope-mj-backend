import express from 'express';
import { ErrorApi } from './errores.js';
import { manejarErrores } from './middleware/errores.js';
import { crearLimiteIntentos } from './middleware/limiteIntentos.js';
import { sinCache, verificarOrigen } from './middleware/origen.js';
import { crearRequiereSesion } from './middleware/sesion.js';
import { crearRutasAuth } from './rutas/auth.js';
import { crearRutasUsuarios } from './rutas/usuarios.js';
import { crearServicioCuentas } from './servicios/cuentas.js';

export function crearApp({
  repositorio,
  config,
  comprobarSalud = async () => true,
  limiteLogin = crearLimiteIntentos(),
  registrarError = console.error
}) {
  const servicio = crearServicioCuentas({ repositorio, config });
  const requiereSesion = crearRequiereSesion({ repositorio, config });
  const app = express();

  app.disable('x-powered-by');
  app.use('/api', sinCache);
  app.use(express.json({ limit: '10kb' }));
  app.use(verificarOrigen);

  app.get('/api/health', async (req, res) => {
    const sano = await comprobarSalud().catch(() => false);
    res.status(sano ? 200 : 503).json({ estado: sano ? 'ok' : 'degradado' });
  });

  app.use('/api/auth', crearRutasAuth({ servicio, requiereSesion, limiteLogin, config }));
  app.use('/api/usuarios', crearRutasUsuarios({ servicio, requiereSesion }));

  app.use((req, res, next) => next(new ErrorApi(404, 'NO_ENCONTRADO', 'No encontrado')));
  app.use(manejarErrores(registrarError));

  return { app, servicio };
}
