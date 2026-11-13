import { ErrorApi } from '../errores.js';

export function crearRepositorioUsuariosMemoria() {
  const usuarios = new Map();
  let siguienteId = 1;

  const copia = (usuario) => (usuario ? { ...usuario } : null);
  const administradores = () => [...usuarios.values()].filter((u) => u.rol === 'administrador');
  const emailEnUso = (email, ignorarId) =>
    [...usuarios.values()].some((u) => u.id !== ignorarId && u.email.toLowerCase() === email.toLowerCase());

  function errorEmailDuplicado() {
    return new ErrorApi(409, 'EMAIL_DUPLICADO', 'Ya existe una cuenta con ese correo');
  }

  function errorUltimoAdministrador() {
    return new ErrorApi(
      409,
      'ULTIMO_ADMINISTRADOR',
      'Debe quedar al menos un administrador en el sistema'
    );
  }

  return {
    async crear({ nombre, email, passwordHash, rol }) {
      if (emailEnUso(email)) throw errorEmailDuplicado();
      const ahora = new Date();
      const usuario = {
        id: siguienteId++,
        nombre,
        email,
        passwordHash,
        rol,
        creadoEn: ahora,
        actualizadoEn: ahora
      };
      usuarios.set(usuario.id, usuario);
      return copia(usuario);
    },

    async buscarPorId(id) {
      return copia(usuarios.get(id));
    },

    async buscarPorEmail(email) {
      const buscado = email.toLowerCase();
      return copia([...usuarios.values()].find((u) => u.email.toLowerCase() === buscado));
    },

    async listar() {
      return [...usuarios.values()].sort((a, b) => a.id - b.id).map(copia);
    },

    async contarAdministradores() {
      return administradores().length;
    },

    async actualizar(id, cambios) {
      const actual = usuarios.get(id);
      if (!actual) return null;

      if (actual.rol === 'administrador' && cambios.rol === 'usuario' && administradores().length <= 1) {
        throw errorUltimoAdministrador();
      }
      if (cambios.email !== undefined && emailEnUso(cambios.email, id)) throw errorEmailDuplicado();

      ['nombre', 'email', 'rol', 'passwordHash'].forEach((campo) => {
        if (cambios[campo] !== undefined) actual[campo] = cambios[campo];
      });
      actual.actualizadoEn = new Date();
      return copia(actual);
    },

    async eliminar(id) {
      const actual = usuarios.get(id);
      if (!actual) return false;
      if (actual.rol === 'administrador' && administradores().length <= 1) {
        throw errorUltimoAdministrador();
      }
      usuarios.delete(id);
      return true;
    }
  };
}
