import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crearPool } from '../src/db/pool.js';
import { sembrarEstudiantesDeEjemplo } from '../src/db/sembrar.js';
import { reiniciarEsquema } from './ayudas/baseDatos.js';

const urlPruebas = process.env.TEST_DATABASE_URL;

if (!urlPruebas) {
  test('vistas de análisis: omitidas porque falta TEST_DATABASE_URL', { skip: true }, () => {});
} else {
  const pool = crearPool({ connectionString: urlPruebas });

  before(async () => {
    await reiniciarEsquema(pool);
    await sembrarEstudiantesDeEjemplo(pool, () => {});
  });
  after(() => pool.end());

  const numero = async (consulta) => Number((await pool.query(consulta)).rows[0].n);

  describe('vw_bi_estudiantes', () => {
    test('tiene una fila por estudiante y ningún dato personal', async () => {
      const { rows, fields } = await pool.query('SELECT * FROM vw_bi_estudiantes');
      const columnas = fields.map((f) => f.name);

      assert.equal(rows.length, 35);
      for (const personal of ['nombre', 'apellido', 'email']) {
        assert.equal(columnas.includes(personal), false, `no debe exponer ${personal}`);
      }
    });

    test('el estado reparte a todos sin solaparse', async () => {
      const total = await numero("SELECT count(*) AS n FROM vw_bi_estudiantes WHERE estado IN ('Completó', 'En curso', 'Abandonó')");
      const completaron = await numero("SELECT count(*) AS n FROM vw_bi_estudiantes WHERE estado = 'Completó'");
      const abandonaron = await numero("SELECT count(*) AS n FROM vw_bi_estudiantes WHERE estado = 'Abandonó'");

      assert.equal(total, 35);
      assert.equal(completaron, await numero('SELECT count(*) AS n FROM estudiantes WHERE progreso = 100'));
      assert.equal(abandonaron, await numero('SELECT count(*) AS n FROM estudiantes WHERE NOT activo AND progreso < 100'));
    });

    test('el monto sale del plan', async () => {
      const mal = await numero(
        'SELECT count(*) AS n FROM vw_bi_estudiantes v JOIN planes p ON p.nombre = v.plan WHERE v.monto_usd <> p.precio_usd'
      );

      assert.equal(mal, 0);
    });
  });

  describe('vw_bi_cursos', () => {
    test('tiene los 30 cursos y sus inscritos suman los estudiantes', async () => {
      assert.equal(await numero('SELECT count(*) AS n FROM vw_bi_cursos'), 30);
      assert.equal(await numero('SELECT sum(inscritos) AS n FROM vw_bi_cursos'), 35);
    });

    test('los ingresos coinciden con los de los estudiantes', async () => {
      const porCursos = await numero('SELECT sum(ingresos_usd) AS n FROM vw_bi_cursos');
      const porEstudiantes = await numero('SELECT sum(monto_usd) AS n FROM vw_bi_estudiantes');

      assert.equal(porCursos, porEstudiantes);
    });

    test('un curso sin estudiantes aparece con ceros', async () => {
      const { rows } = await pool.query('SELECT * FROM vw_bi_cursos WHERE inscritos = 0 LIMIT 1');

      assert.equal(rows.length, 1);
      assert.equal(Number(rows[0].progreso_promedio), 0);
      assert.equal(Number(rows[0].ingresos_usd), 0);
    });
  });

  describe('vw_bi_resumen_mensual', () => {
    test('las inscripciones por mes suman todos los estudiantes', async () => {
      assert.equal(await numero('SELECT sum(inscripciones) AS n FROM vw_bi_resumen_mensual'), 35);
    });
  });

  describe('usuario de solo lectura', () => {
    test('el guion crea un usuario que lee las vistas pero no las tablas', async () => {
      const guion = await readFile(new URL('../docs/automatizacion/power-bi/crear-usuario-lectura.sql', import.meta.url), 'utf8');
      const cliente = await pool.connect();
      try {
        await cliente.query('BEGIN');
        await cliente.query(guion);
        await cliente.query('SET LOCAL ROLE bi_lectura');

        const vista = await cliente.query('SELECT count(*)::int AS n FROM vw_bi_estudiantes');
        assert.equal(vista.rows[0].n, 35);

        await cliente.query('SAVEPOINT antes');
        await assert.rejects(cliente.query('SELECT * FROM estudiantes'), /permission denied|permiso denegado/i);
        await cliente.query('ROLLBACK TO SAVEPOINT antes');
        await assert.rejects(cliente.query("UPDATE usuarios SET nombre = 'x'"), /permission denied|permiso denegado/i);
      } finally {
        await cliente.query('ROLLBACK').catch(() => {});
        cliente.release();
      }
    });
  });
}
