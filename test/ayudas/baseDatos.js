import { migrar } from '../../src/db/migrar.js';

export async function reiniciarEsquema(pool) {
  const { rows } = await pool.query('SELECT current_database() AS nombre');
  if (!/test/i.test(rows[0].nombre)) {
    throw new Error(
      `Se niega a borrar la base "${rows[0].nombre}": el nombre debe contener "test" para usarla en pruebas`
    );
  }

  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
  return migrar(pool);
}
