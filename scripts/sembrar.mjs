import { leerConfig } from '../src/config.js';
import { migrar } from '../src/db/migrar.js';
import { crearPool } from '../src/db/pool.js';
import { sembrarEstudiantesDeEjemplo } from '../src/db/sembrar.js';
import { describirErrorInicio } from '../src/errorInicio.js';

const pool = crearPool(leerConfig().basedatos);

try {
  await migrar(pool, console.log);
  const cargados = await sembrarEstudiantesDeEjemplo(pool, console.log);
  if (cargados === 0) console.log('Ya hay estudiantes en la base de datos: no se cargó nada.');
} catch (error) {
  console.error(`No se pudieron cargar los datos de ejemplo: ${describirErrorInicio(error)}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
