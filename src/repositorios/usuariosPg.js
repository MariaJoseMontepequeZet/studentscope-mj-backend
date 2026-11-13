import { ErrorApi } from '../errores.js';

const CLAVE_BLOQUEO_ADMINS = 7001;
const CODIGO_DUPLICADO = '23505';

const COLUMNAS = {
  nombre: 'nombre',
  email: 'email',
  rol: 'rol',
  passwordHash: 'password_hash'
};

function aUsuario(fila) {
  if (!fila) return null;
  return {
    id: Number(fila.id),
    nombre: fila.nombre,
    email: fila.email,
    passwordHash: fila.password_hash,
    rol: fila.rol,
    creadoEn: fila.creado_en,
    actualizadoEn: fila.actualizado_en
  };
}

function traducirError(error) {
  if (error?.code === CODIGO_DUPLICADO) {
    return new ErrorApi(409, 'EMAIL_DUPLICADO', 'Ya existe una cuenta con ese correo');
  }
  return error;
}

export function crearRepositorioUsuariosPg(pool) {
  async function enTransaccion(trabajo) {
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query('SELECT pg_advisory_xact_lock($1)', [CLAVE_BLOQUEO_ADMINS]);
      const resultado = await trabajo(cliente);
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      await cliente.query('ROLLBACK').catch(() => {});
      throw traducirError(error);
    } finally {
      cliente.release();
    }
  }

  async function administradoresRestantes(cliente) {
    const { rows } = await cliente.query(
      "SELECT count(*)::int AS total FROM usuarios WHERE rol = 'administrador'"
    );
    return rows[0].total;
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
      try {
        const { rows } = await pool.query(
          `INSERT INTO usuarios (nombre, email, password_hash, rol)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [nombre, email, passwordHash, rol]
        );
        return aUsuario(rows[0]);
      } catch (error) {
        throw traducirError(error);
      }
    },

    async buscarPorId(id) {
      const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
      return aUsuario(rows[0]);
    },

    async buscarPorEmail(email) {
      const { rows } = await pool.query('SELECT * FROM usuarios WHERE lower(email) = lower($1)', [
        email
      ]);
      return aUsuario(rows[0]);
    },

    async listar() {
      const { rows } = await pool.query('SELECT * FROM usuarios ORDER BY id');
      return rows.map(aUsuario);
    },

    async contarAdministradores() {
      return administradoresRestantes(pool);
    },

    async actualizar(id, cambios) {
      return enTransaccion(async (cliente) => {
        const { rows } = await cliente.query('SELECT * FROM usuarios WHERE id = $1 FOR UPDATE', [id]);
        const actual = aUsuario(rows[0]);
        if (!actual) return null;

        const quitaAdministrador = actual.rol === 'administrador' && cambios.rol === 'usuario';
        if (quitaAdministrador && (await administradoresRestantes(cliente)) <= 1) {
          throw errorUltimoAdministrador();
        }

        const asignaciones = [];
        const valores = [];
        Object.entries(COLUMNAS).forEach(([propiedad, columna]) => {
          if (cambios[propiedad] === undefined) return;
          valores.push(cambios[propiedad]);
          asignaciones.push(`${columna} = $${valores.length}`);
        });
        if (asignaciones.length === 0) return actual;

        valores.push(id);
        const resultado = await cliente.query(
          `UPDATE usuarios SET ${asignaciones.join(', ')}, actualizado_en = now()
           WHERE id = $${valores.length} RETURNING *`,
          valores
        );
        return aUsuario(resultado.rows[0]);
      });
    },

    async eliminar(id) {
      return enTransaccion(async (cliente) => {
        const { rows } = await cliente.query('SELECT * FROM usuarios WHERE id = $1 FOR UPDATE', [id]);
        const actual = aUsuario(rows[0]);
        if (!actual) return false;

        if (actual.rol === 'administrador' && (await administradoresRestantes(cliente)) <= 1) {
          throw errorUltimoAdministrador();
        }
        await cliente.query('DELETE FROM usuarios WHERE id = $1', [id]);
        return true;
      });
    }
  };
}
