import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ARCHIVO = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'datos',
  'estudiantes-ejemplo.json'
);
const CLAVE_BLOQUEO = 7003;

async function cargarEjemplo(cliente) {
  const ejemplo = JSON.parse(await readFile(ARCHIVO, 'utf8'));
  for (const e of ejemplo) {
    await cliente.query(
      `INSERT INTO estudiantes
         (nombre, apellido, email, ciudad, curso_id, plan, progreso, fecha_inscripcion, activo)
       VALUES ($1, $2, $3, $4, (SELECT id FROM cursos WHERE nombre = $5), $6, $7, $8, $9)`,
      [e.nombre, e.apellido, e.email, e.ciudad, e.curso, e.plan, e.progreso, e.fechaInscripcion, e.activo]
    );
  }
  return ejemplo.length;
}

export async function restaurarEstudiantesDeEjemplo(pool, registrar = () => {}) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query('SELECT pg_advisory_xact_lock($1)', [CLAVE_BLOQUEO]);
    await cliente.query('TRUNCATE estudiantes RESTART IDENTITY');
    const total = await cargarEjemplo(cliente);
    await cliente.query('COMMIT');
    registrar(`Se restauraron los ${total} estudiantes de ejemplo`);
    return total;
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}

export async function sembrarEstudiantesDeEjemplo(pool, registrar = () => {}) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query('SELECT pg_advisory_xact_lock($1)', [CLAVE_BLOQUEO]);

    const { rows } = await cliente.query('SELECT count(*)::int AS total FROM estudiantes');
    if (rows[0].total > 0) {
      await cliente.query('ROLLBACK');
      return 0;
    }

    const total = await cargarEjemplo(cliente);
    await cliente.query('COMMIT');
    registrar(`Se cargaron ${total} estudiantes de ejemplo`);
    return total;
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }
}
