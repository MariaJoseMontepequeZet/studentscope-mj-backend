import { Router } from 'express';
import { ErrorApi } from '../errores.js';
import { emitirCookie, limpiarCookie } from '../middleware/sesion.js';
import { aPublico } from '../servicios/cuentas.js';
import { firmarToken } from '../seguridad/token.js';
import { validarCambiosPerfil, validarLogin, validarRegistro } from '../validacion.js';

export function crearRutasAuth({ servicio, requiereSesion, limiteLogin, config }) {
  const rutas = Router();

  function abrirSesion(res, usuario) {
    emitirCookie(res, firmarToken(usuario.id, config.jwtSecreto, config.sesionHoras), config);
  }

  rutas.post('/registro', async (req, res) => {
    const usuario = await servicio.registrar(validarRegistro(req.body));
    abrirSesion(res, usuario);
    res.status(201).json({ usuario });
  });

  rutas.post('/login', async (req, res) => {
    const { email, password } = validarLogin(req.body);

    if (limiteLogin.bloqueado(email)) {
      throw new ErrorApi(
        429,
        'DEMASIADOS_INTENTOS',
        'Demasiados intentos fallidos. Inténtalo de nuevo en unos minutos'
      );
    }

    try {
      const usuario = await servicio.iniciarSesion({ email, password });
      limiteLogin.limpiar(email);
      abrirSesion(res, usuario);
      res.json({ usuario });
    } catch (error) {
      if (error instanceof ErrorApi && error.codigo === 'CREDENCIALES_INVALIDAS') {
        limiteLogin.registrarFallo(email);
      }
      throw error;
    }
  });

  rutas.post('/logout', (req, res) => {
    limpiarCookie(res, config);
    res.status(204).end();
  });

  rutas.get('/yo', requiereSesion, (req, res) => {
    res.json({ usuario: aPublico(req.usuario) });
  });

  rutas.patch('/yo', requiereSesion, async (req, res) => {
    const usuario = await servicio.actualizarPerfil(req.usuario.id, validarCambiosPerfil(req.body));
    res.json({ usuario });
  });

  return rutas;
}
