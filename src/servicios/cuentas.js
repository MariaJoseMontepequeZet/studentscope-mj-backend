import { ErrorApi } from '../errores.js';
import {
  gastarTiempoDeVerificacion,
  hashearPassword,
  verificarPassword
} from '../seguridad/password.js';
import { errorEmail, errorPassword } from '../validacion.js';

export function aPublico(usuario) {
  if (!usuario) return null;
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
    creadoEn: usuario.creadoEn
  };
}

function credencialesInvalidas() {
  return new ErrorApi(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos');
}

function noEncontrado() {
  return new ErrorApi(404, 'USUARIO_NO_ENCONTRADO', 'La cuenta no existe');
}

export function crearServicioCuentas({ repositorio, config }) {
  const hashear = (password) => hashearPassword(password, config.costeBcrypt);

  return {
    async registrar({ nombre, email, password }) {
      const usuario = await repositorio.crear({
        nombre,
        email,
        passwordHash: await hashear(password),
        rol: 'usuario'
      });
      return aPublico(usuario);
    },

    async iniciarSesion({ email, password }) {
      const usuario = await repositorio.buscarPorEmail(email);
      if (!usuario) {
        await gastarTiempoDeVerificacion(password);
        throw credencialesInvalidas();
      }
      if (!(await verificarPassword(password, usuario.passwordHash))) throw credencialesInvalidas();
      return aPublico(usuario);
    },

    async listar() {
      const usuarios = await repositorio.listar();
      return usuarios.map(aPublico);
    },

    async actualizarComoAdministrador(id, cambios) {
      const datos = {};
      ['nombre', 'email', 'rol'].forEach((campo) => {
        if (cambios[campo] !== undefined) datos[campo] = cambios[campo];
      });
      if (cambios.password !== undefined) datos.passwordHash = await hashear(cambios.password);

      const usuario = await repositorio.actualizar(id, datos);
      if (!usuario) throw noEncontrado();
      return aPublico(usuario);
    },

    async eliminarComoAdministrador(idActor, id) {
      if (idActor === id) {
        throw new ErrorApi(409, 'NO_AUTOELIMINAR', 'No puedes eliminar tu propia cuenta');
      }
      if (!(await repositorio.eliminar(id))) throw noEncontrado();
    },

    async actualizarPerfil(id, cambios) {
      const datos = {};
      if (cambios.nombre !== undefined) datos.nombre = cambios.nombre;

      if (cambios.passwordNueva !== undefined) {
        const actual = await repositorio.buscarPorId(id);
        if (!actual) throw noEncontrado();
        if (!(await verificarPassword(cambios.passwordActual, actual.passwordHash))) {
          throw new ErrorApi(400, 'DATOS_INVALIDOS', 'Revisa los datos enviados', {
            passwordActual: 'La contraseña actual no es correcta'
          });
        }
        datos.passwordHash = await hashear(cambios.passwordNueva);
      }

      const usuario = await repositorio.actualizar(id, datos);
      if (!usuario) throw noEncontrado();
      return aPublico(usuario);
    },

    async asegurarAdministradorInicial({ email, password }, registrar = () => {}) {
      if (!email || !password) return 'omitido';
      if ((await repositorio.contarAdministradores()) > 0) return 'existente';

      const existente = await repositorio.buscarPorEmail(email);
      if (existente) {
        await repositorio.actualizar(existente.id, { rol: 'administrador' });
        registrar(`La cuenta ${email} se promovió a administrador`);
        return 'promovido';
      }

      const problema = errorEmail(email) ?? errorPassword(password);
      if (problema) throw new Error(`ADMIN_EMAIL o ADMIN_PASSWORD no son válidos: ${problema}`);

      await repositorio.crear({
        nombre: 'Administrador',
        email,
        passwordHash: await hashear(password),
        rol: 'administrador'
      });
      registrar(`Administrador inicial creado: ${email}`);
      return 'creado';
    }
  };
}
