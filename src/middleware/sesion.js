import { ErrorApi } from '../errores.js';
import { leerToken } from '../seguridad/token.js';

export const NOMBRE_COOKIE = 'sesion';

export function leerCookie(req, nombre) {
  const cabecera = req.headers.cookie;
  if (!cabecera) return null;

  for (const par of cabecera.split(';')) {
    const [clave, ...resto] = par.trim().split('=');
    if (clave === nombre) {
      try {
        return decodeURIComponent(resto.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function opcionesCookie(config) {
  return { httpOnly: true, sameSite: 'strict', secure: config.produccion, path: '/' };
}

export function emitirCookie(res, token, config) {
  res.cookie(NOMBRE_COOKIE, token, {
    ...opcionesCookie(config),
    maxAge: config.sesionHoras * 60 * 60 * 1000
  });
}

export function limpiarCookie(res, config) {
  res.clearCookie(NOMBRE_COOKIE, opcionesCookie(config));
}

export function crearRequiereSesion({ repositorio, config }) {
  return async function requiereSesion(req, res, next) {
    const token = leerCookie(req, NOMBRE_COOKIE);
    const id = token ? leerToken(token, config.jwtSecreto) : null;
    const usuario = id ? await repositorio.buscarPorId(id) : null;

    if (!usuario) {
      limpiarCookie(res, config);
      return next(new ErrorApi(401, 'NO_AUTENTICADO', 'Inicia sesión para continuar'));
    }
    req.usuario = usuario;
    next();
  };
}

export function requiereAdministrador(req, res, next) {
  if (req.usuario?.rol !== 'administrador') {
    return next(new ErrorApi(403, 'SIN_PERMISO', 'No tienes permiso para esta acción'));
  }
  next();
}
