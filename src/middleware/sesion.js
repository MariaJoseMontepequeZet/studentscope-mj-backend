import { ErrorApi } from '../errores.js';
import { leerCarga } from '../seguridad/token.js';

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

export function emitirCookie(res, token, config, horas = config.sesionHoras) {
  res.cookie(NOMBRE_COOKIE, token, {
    ...opcionesCookie(config),
    maxAge: horas * 60 * 60 * 1000
  });
}

export function limpiarCookie(res, config) {
  res.clearCookie(NOMBRE_COOKIE, opcionesCookie(config));
}

function anteriorAlCambioDeClave(usuario, carga) {
  if (!usuario.credencialesEn) return false;
  return Math.floor(new Date(usuario.credencialesEn).getTime() / 1000) > carga.emitidoEn;
}

export function crearRequiereSesion({ repositorio, config }) {
  return async function requiereSesion(req, res, next) {
    const token = leerCookie(req, NOMBRE_COOKIE);
    const carga = token ? leerCarga(token, config.jwtSecreto) : null;
    const encontrado = carga ? await repositorio.buscarPorId(carga.id) : null;
    const usuario = encontrado && !anteriorAlCambioDeClave(encontrado, carga) ? encontrado : null;

    if (!usuario) {
      limpiarCookie(res, config);
      return next(new ErrorApi(401, 'NO_AUTENTICADO', 'Inicia sesión para continuar'));
    }
    req.usuario = usuario;
    next();
  };
}

const ROLES_DE_GESTION = ['administrador', 'demo'];

export function requiereGestion(req, res, next) {
  if (!ROLES_DE_GESTION.includes(req.usuario?.rol)) {
    return next(new ErrorApi(403, 'SIN_PERMISO', 'No tienes permiso para esta acción'));
  }
  next();
}

export function requiereAdministrador(req, res, next) {
  if (req.usuario?.rol !== 'administrador') {
    return next(new ErrorApi(403, 'SIN_PERMISO', 'No tienes permiso para esta acción'));
  }
  next();
}
