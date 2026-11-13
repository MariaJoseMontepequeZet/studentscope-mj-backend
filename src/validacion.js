import { ErrorApi } from './errores.js';

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ROLES = ['usuario', 'administrador'];
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;

function fallar(campos) {
  throw new ErrorApi(400, 'DATOS_INVALIDOS', 'Revisa los datos enviados', campos);
}

export function normalizarEmail(valor) {
  return typeof valor === 'string' ? valor.trim().toLowerCase() : '';
}

export function errorNombre(valor) {
  if (typeof valor !== 'string' || valor.trim().length === 0) return 'El nombre es obligatorio';
  if (valor.trim().length > 100) return 'El nombre no puede superar 100 caracteres';
  return null;
}

export function errorEmail(valor) {
  const email = normalizarEmail(valor);
  if (!REGEX_EMAIL.test(email) || email.length > 254) return 'El correo no es válido';
  return null;
}

export function errorPassword(valor) {
  if (typeof valor !== 'string') return 'La contraseña es obligatoria';
  if (valor.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres`;
  if (valor.length > PASSWORD_MAX) return `La contraseña no puede superar ${PASSWORD_MAX} caracteres`;
  if (!/[A-Za-z]/.test(valor) || !/\d/.test(valor)) {
    return 'La contraseña debe incluir letras y números';
  }
  return null;
}

function reunir(errores) {
  const campos = {};
  Object.entries(errores).forEach(([campo, mensaje]) => {
    if (mensaje) campos[campo] = mensaje;
  });
  return campos;
}

export function validarRegistro(cuerpo = {}) {
  const campos = reunir({
    nombre: errorNombre(cuerpo.nombre),
    email: errorEmail(cuerpo.email),
    password: errorPassword(cuerpo.password)
  });
  if (Object.keys(campos).length > 0) fallar(campos);

  return {
    nombre: cuerpo.nombre.trim(),
    email: normalizarEmail(cuerpo.email),
    password: cuerpo.password
  };
}

export function validarLogin(cuerpo = {}) {
  const email = normalizarEmail(cuerpo.email);
  if (!email || typeof cuerpo.password !== 'string' || cuerpo.password.length === 0) {
    fallar({ email: 'Ingresa tu correo', password: 'Ingresa tu contraseña' });
  }
  return { email, password: cuerpo.password };
}

export function validarCambiosAdmin(cuerpo = {}) {
  const cambios = {};
  const errores = {};

  if (cuerpo.nombre !== undefined) {
    errores.nombre = errorNombre(cuerpo.nombre);
    cambios.nombre = typeof cuerpo.nombre === 'string' ? cuerpo.nombre.trim() : cuerpo.nombre;
  }
  if (cuerpo.email !== undefined) {
    errores.email = errorEmail(cuerpo.email);
    cambios.email = normalizarEmail(cuerpo.email);
  }
  if (cuerpo.rol !== undefined) {
    errores.rol = ROLES.includes(cuerpo.rol) ? null : 'El rol no es válido';
    cambios.rol = cuerpo.rol;
  }
  if (cuerpo.password !== undefined) {
    errores.password = errorPassword(cuerpo.password);
    cambios.password = cuerpo.password;
  }

  const campos = reunir(errores);
  if (Object.keys(campos).length > 0) fallar(campos);
  if (Object.keys(cambios).length === 0) fallar({ general: 'No hay cambios que aplicar' });
  return cambios;
}

export function validarCambiosPerfil(cuerpo = {}) {
  const cambios = {};
  const errores = {};

  if (cuerpo.nombre !== undefined) {
    errores.nombre = errorNombre(cuerpo.nombre);
    cambios.nombre = typeof cuerpo.nombre === 'string' ? cuerpo.nombre.trim() : cuerpo.nombre;
  }
  if (cuerpo.passwordNueva !== undefined) {
    errores.passwordNueva = errorPassword(cuerpo.passwordNueva);
    if (typeof cuerpo.passwordActual !== 'string' || cuerpo.passwordActual.length === 0) {
      errores.passwordActual = 'Ingresa tu contraseña actual';
    }
    cambios.passwordNueva = cuerpo.passwordNueva;
    cambios.passwordActual = cuerpo.passwordActual;
  }

  const campos = reunir(errores);
  if (Object.keys(campos).length > 0) fallar(campos);
  if (Object.keys(cambios).length === 0) fallar({ general: 'No hay cambios que aplicar' });
  return cambios;
}

export function validarIdUsuario(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ErrorApi(400, 'ID_INVALIDO', 'El identificador no es válido');
  }
  return id;
}
