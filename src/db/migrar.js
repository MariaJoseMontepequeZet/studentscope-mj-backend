import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CARPETA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migraciones');
const CLAVE_BLOQUEO = 7002;

export async function migrar(pool, registrar = () => {}) {
  const cliente = await pool.connect();
  try {
    await cliente.query('SELECT pg_advisory_lock($1)', [CLAVE_BLOQUEO]);
    await cliente.query(`
      CREATE TABLE IF NOT EXISTS migraciones (
        nombre TEXT PRIMARY KEY,
        aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await cliente.query('SELECT nombre FROM migraciones');
    const aplicadas = new Set(rows.map((fila) => fila.nombre));
    const archivos = (await readdir(CARPETA)).filter((nombre) => nombre.endsWith('.sql')).sort();
    const nuevas = [];

    for (const archivo of archivos) {
      if (aplicadas.has(archivo)) continue;
      const sql = await readFile(path.join(CARPETA, archivo), 'utf8');

      try {
        await cliente.query('BEGIN');
        await cliente.query(sql);
        await cliente.query('INSERT INTO migraciones (nombre) VALUES ($1)', [archivo]);
        await cliente.query('COMMIT');
      } catch (error) {
        await cliente.query('ROLLBACK');
        throw new Error(`La migración ${archivo} falló: ${error.message}`);
      }
      nuevas.push(archivo);
      registrar(`Migración aplicada: ${archivo}`);
    }
    return nuevas;
  } finally {
    await cliente.query('SELECT pg_advisory_unlock($1)', [CLAVE_BLOQUEO]).catch(() => {});
    cliente.release();
  }
}
