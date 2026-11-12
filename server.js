import { crearApp } from './src/app.js';
import { leerConfig } from './src/config.js';
import { crearPool } from './src/db/pool.js';
import { migrar } from './src/db/migrar.js';
import { describirErrorInicio } from './src/errorInicio.js';
import { crearRepositorioUsuariosPg } from './src/repositorios/usuariosPg.js';

async function iniciar() {
  const config = leerConfig();
  const pool = crearPool(config.basedatos);

  try {
    await migrar(pool, console.log);

    const { app, servicio } = crearApp({
      repositorio: crearRepositorioUsuariosPg(pool),
      config,
      comprobarSalud: async () => {
        await pool.query('SELECT 1');
        return true;
      }
    });

    await servicio.asegurarAdministradorInicial(
      { email: config.adminEmail, password: config.adminPassword },
      console.log
    );

    const servidor = app.listen(config.puerto, '0.0.0.0', () => {
      console.log(`API escuchando en el puerto ${config.puerto}`);
    });

    function cerrar() {
      servidor.close(async () => {
        await pool.end();
        process.exit(0);
      });
      servidor.closeIdleConnections();
    }

    process.on('SIGTERM', cerrar);
    process.on('SIGINT', cerrar);
  } catch (error) {
    await pool.end().catch(() => {});
    throw error;
  }
}

iniciar().catch((error) => {
  console.error(`No se pudo iniciar la API: ${describirErrorInicio(error)}`);
  process.exit(1);
});
