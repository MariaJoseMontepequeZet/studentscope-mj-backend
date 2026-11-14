import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { crearPool } from '../src/db/pool.js';
import { sembrarEstudiantesDeEjemplo } from '../src/db/sembrar.js';
import { reiniciarEsquema } from './ayudas/baseDatos.js';

const urlPruebas = process.env.TEST_DATABASE_URL;

if (!urlPruebas) {
  test('esquema de estudiantes: omitido porque falta TEST_DATABASE_URL', { skip: true }, () => {});
} else {
  const pool = crearPool({ connectionString: urlPruebas });

  const ESTUDIANTE = {
    nombre: 'Ana',
    apellido: 'Lopez',
    email: 'ana@correo.com',
    ciudad: 'Bogotá',
    plan: 'Básico',
    progreso: 50,
    fecha: '2024-06-15'
  };

  async function insertar(cliente, cambios = {}) {
    const e = { ...ESTUDIANTE, ...cambios };
    return cliente.query(
      `INSERT INTO estudiantes (nombre, apellido, email, ciudad, curso_id, plan, progreso, fecha_inscripcion)
       VALUES ($1, $2, $3, $4, COALESCE($5, (SELECT min(id) FROM cursos)), $6, $7, $8) RETURNING id`,
      [e.nombre, e.apellido, e.email, e.ciudad, e.cursoId ?? null, e.plan, e.progreso, e.fecha]
    );
  }

  async function dentroDeTransaccion(trabajo) {
    const cliente = await pool.connect();
    try {
      await cliente.query('BEGIN');
      await trabajo(cliente);
    } finally {
      await cliente.query('ROLLBACK').catch(() => {});
      cliente.release();
    }
  }

  async function rechaza(cambios, patron) {
    await dentroDeTransaccion(async (cliente) => {
      await assert.rejects(insertar(cliente, cambios), patron);
    });
  }

  before(() => reiniciarEsquema(pool));
  after(() => pool.end());

  describe('planes y cursos', () => {
    test('hay tres planes con su precio', async () => {
      const { rows } = await pool.query('SELECT nombre, precio_usd::text AS precio FROM planes ORDER BY precio_usd');

      assert.deepEqual(rows, [
        { nombre: 'Básico', precio: '29.99' },
        { nombre: 'Estándar', precio: '59.99' },
        { nombre: 'Premium', precio: '99.99' }
      ]);
    });

    test('la base rechaza un plan con precio cero o negativo', async () => {
      await dentroDeTransaccion(async (cliente) => {
        await assert.rejects(cliente.query("INSERT INTO planes (nombre, precio_usd) VALUES ('Gratis', 0)"), /precio_usd/);
      });
      await dentroDeTransaccion(async (cliente) => {
        await assert.rejects(cliente.query("INSERT INTO planes (nombre, precio_usd) VALUES ('Raro', -5)"), /precio_usd/);
      });
    });

    test('hay 30 cursos con nombres unicos y datos validos', async () => {
      const { rows } = await pool.query('SELECT * FROM cursos ORDER BY id');

      assert.equal(rows.length, 30);
      assert.equal(new Set(rows.map((c) => c.nombre.toLowerCase())).size, 30);
      assert.ok(rows.every((c) => c.semanas > 0 && c.instructor && c.descripcion));
      assert.equal(rows[0].nombre, 'Desarrollo Web');
    });

    test('la base rechaza un curso repetido, una categoria o un nivel invalidos', async () => {
      await dentroDeTransaccion(async (cliente) => {
        await assert.rejects(
          cliente.query(
            `INSERT INTO cursos (nombre, categoria, nivel, semanas, plan, instructor, descripcion)
             VALUES ('DESARROLLO WEB', 'web', 'Básico', 4, 'Básico', 'X', 'Y')`
          ),
          /cursos_nombre_unico/
        );
      });
      await dentroDeTransaccion(async (cliente) => {
        await assert.rejects(
          cliente.query(
            `INSERT INTO cursos (nombre, categoria, nivel, semanas, plan, instructor, descripcion)
             VALUES ('Otro', 'cocina', 'Básico', 4, 'Básico', 'X', 'Y')`
          )
        );
      });
      await dentroDeTransaccion(async (cliente) => {
        await assert.rejects(
          cliente.query(
            `INSERT INTO cursos (nombre, categoria, nivel, semanas, plan, instructor, descripcion)
             VALUES ('Otro', 'web', 'Experto', 4, 'Básico', 'X', 'Y')`
          )
        );
      });
    });
  });

  describe('restricciones de estudiantes', () => {
    test('acepta un estudiante correcto', async () => {
      await dentroDeTransaccion(async (cliente) => {
        const { rows } = await insertar(cliente);
        assert.ok(rows[0].id > 0);
      });
    });

    test('rechaza un progreso fuera de 0 a 100', async () => {
      await rechaza({ progreso: 101 }, /progreso/);
      await rechaza({ progreso: -1 }, /progreso/);
    });

    test('acepta los limites 0 y 100', async () => {
      await dentroDeTransaccion(async (cliente) => {
        await insertar(cliente, { progreso: 0, email: 'cero@correo.com' });
        await insertar(cliente, { progreso: 100, email: 'cien@correo.com' });
      });
    });

    test('rechaza fechas anteriores al 2023-01-01 y acepta esa fecha', async () => {
      await rechaza({ fecha: '2022-12-31' }, /fecha_inscripcion/);
      await dentroDeTransaccion(async (cliente) => {
        await insertar(cliente, { fecha: '2023-01-01' });
      });
    });

    test('rechaza fechas que no existen', async () => {
      await rechaza({ fecha: '2023-02-30' });
    });

    test('rechaza nombres, apellidos o ciudades vacios', async () => {
      await rechaza({ nombre: '   ' }, /nombre/);
      await rechaza({ apellido: '' }, /apellido/);
      await rechaza({ ciudad: ' ' }, /ciudad/);
    });

    test('rechaza un correo repetido aunque cambien las mayusculas', async () => {
      await dentroDeTransaccion(async (cliente) => {
        await insertar(cliente, { email: 'repetido@correo.com' });
        await assert.rejects(insertar(cliente, { email: 'REPETIDO@Correo.com' }), /estudiantes_email_unico/);
      });
    });

    test('rechaza un plan o un curso que no existen', async () => {
      await rechaza({ plan: 'Platino' }, /plan/);
      await rechaza({ cursoId: 999999 }, /curso_id/);
    });

    test('un curso con estudiantes no se puede eliminar', async () => {
      await dentroDeTransaccion(async (cliente) => {
        const { rows } = await insertar(cliente);
        const { rows: curso } = await cliente.query('SELECT curso_id FROM estudiantes WHERE id = $1', [rows[0].id]);
        await assert.rejects(cliente.query('DELETE FROM cursos WHERE id = $1', [curso[0].curso_id]), /estudiantes_curso_id_fkey/);
      });
    });
  });

  describe('datos de ejemplo', () => {
    test('se cargan 35 estudiantes y quedan enlazados con su curso y su plan', async () => {
      const cargados = await sembrarEstudiantesDeEjemplo(pool);
      const { rows } = await pool.query(
        `SELECT e.email, c.nombre AS curso, p.precio_usd::text AS precio
         FROM estudiantes e JOIN cursos c ON c.id = e.curso_id JOIN planes p ON p.nombre = e.plan
         WHERE e.email = 'pjuan5058@gmail.com'`
      );

      assert.equal(cargados, 35);
      assert.deepEqual(rows, [{ email: 'pjuan5058@gmail.com', curso: 'Desarrollo Web', precio: '99.99' }]);
    });

    test('es idempotente: una segunda carga no duplica nada', async () => {
      assert.equal(await sembrarEstudiantesDeEjemplo(pool), 0);
      const { rows } = await pool.query('SELECT count(*)::int AS total FROM estudiantes');
      assert.equal(rows[0].total, 35);
    });

    test('dos cargas simultaneas dejan una sola copia', async () => {
      await pool.query('TRUNCATE estudiantes RESTART IDENTITY');
      const resultados = await Promise.all([sembrarEstudiantesDeEjemplo(pool), sembrarEstudiantesDeEjemplo(pool)]);
      const { rows } = await pool.query('SELECT count(*)::int AS total FROM estudiantes');

      assert.deepEqual(resultados.sort((a, b) => a - b), [0, 35]);
      assert.equal(rows[0].total, 35);
    });

    test('espera el bloqueo de otra instancia antes de cargar', async () => {
      await pool.query('TRUNCATE estudiantes RESTART IDENTITY');
      const otraInstancia = await pool.connect();
      try {
        await otraInstancia.query('SELECT pg_advisory_lock(7003)');
        let terminada = false;
        const carga = sembrarEstudiantesDeEjemplo(pool).then((cargados) => {
          terminada = true;
          return cargados;
        });

        await new Promise((resolver) => setTimeout(resolver, 400));
        assert.equal(terminada, false);

        await otraInstancia.query('SELECT pg_advisory_unlock(7003)');
        assert.equal(await carga, 35);
      } finally {
        otraInstancia.release();
      }
    });

    test('si falta un curso, no queda nada a medias', async () => {
      await pool.query('TRUNCATE estudiantes RESTART IDENTITY');
      await pool.query("DELETE FROM cursos WHERE nombre = 'DevOps y Cloud'");

      await assert.rejects(sembrarEstudiantesDeEjemplo(pool), /curso_id/);
      const { rows } = await pool.query('SELECT count(*)::int AS total FROM estudiantes');
      assert.equal(rows[0].total, 0);
    });
  });
}
