import { crearApp } from './src/app.js';
import { leerConfig } from './src/config.js';
import { crearPool } from './src/db/pool.js';
import { migrar } from './src/db/migrar.js';
import { restaurarEstudiantesDeEjemplo, sembrarEstudiantesDeEjemplo } from './src/db/sembrar.js';
import { describirErrorInicio } from './src/errorInicio.js';
import { crearRepositorioEstudiantesPg } from './src/repositorios/estudiantesPg.js';
import { crearRepositorioUsuariosPg } from './src/repositorios/usuariosPg.js';

async function iniciar() {
  const config = leerConfig();
  const pool = crearPool(config.basedatos);

  try {
    await migrar(pool, console.log);
    if (config.sembrarEjemplo || config.demoHabilitada) {
      await sembrarEstudiantesDeEjemplo(pool, console.log);
    }

    const { app, servicio } = crearApp({
      repositorio: crearRepositorioUsuariosPg(pool),
      repositorioEstudiantes: crearRepositorioEstudiantesPg(pool),
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

    let temporizadorDemo = null;
    if (config.demoHabilitada) {
      await servicio.asegurarUsuarioDemo(console.log);
      temporizadorDemo = setInterval(
        () => restaurarEstudiantesDeEjemplo(pool, console.log).catch((e) => console.error(e)),
        config.demoReinicioMinutos * 60 * 1000
      );
      temporizadorDemo.unref();
      console.log(`Demo activa: los estudiantes se restauran cada ${config.demoReinicioMinutos} minutos`);
    }

    const servidor = app.listen(config.puerto, '0.0.0.0', () => {
      console.log(`API escuchando en el puerto ${config.puerto}`);
    });

    function cerrar() {
      clearInterval(temporizadorDemo);
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
