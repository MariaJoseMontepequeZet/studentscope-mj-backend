import { readdirSync } from 'node:fs';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { crearPool } from '../src/db/pool.js';
import { migrar } from '../src/db/migrar.js';
import { crearRepositorioUsuariosMemoria } from '../src/repositorios/usuariosMemoria.js';
import { crearRepositorioUsuariosPg } from '../src/repositorios/usuariosPg.js';
import { reiniciarEsquema } from './ayudas/baseDatos.js';
import { probarContratoRepositorio } from './ayudas/contratoRepositorio.js';

probarContratoRepositorio('memoria', () => crearRepositorioUsuariosMemoria());

const urlPruebas = process.env.TEST_DATABASE_URL;

if (!urlPruebas) {
  test('postgres: omitido porque falta TEST_DATABASE_URL', { skip: true }, () => {});
} else {
  const pool = crearPool({ connectionString: urlPruebas });

  before(() => reiniciarEsquema(pool));

  after(() => pool.end());

  probarContratoRepositorio('postgres', async () => {
    await pool.query('TRUNCATE usuarios RESTART IDENTITY');
    return crearRepositorioUsuariosPg(pool);
  });

  test('postgres: la base rechaza semillas de avatar inválidas', async () => {
    const repo = crearRepositorioUsuariosPg(pool);
    await pool.query('TRUNCATE usuarios RESTART IDENTITY');
    const usuario = await repo.crear({ nombre: 'Ana', email: 'ana@correo.com', passwordHash: 'h', rol: 'usuario' });

    for (const semilla of ['', 'con espacio', 'a'.repeat(41), "x'; DROP TABLE usuarios;--"]) {
      await assert.rejects(repo.actualizar(usuario.id, { avatarSemilla: semilla }), /check|violates|too long/i);
    }
  });

  test('postgres: las migraciones se aplican una sola vez', async () => {
    const segundaVez = await migrar(pool);
    const { rows } = await pool.query('SELECT count(*)::int AS total FROM migraciones');

    const archivos = readdirSync(new URL('../src/db/migraciones/', import.meta.url)).filter((f) =>
      f.endsWith('.sql')
    );

    assert.deepEqual(segundaVez, []);
    assert.equal(rows[0].total, archivos.length);
  });

  test('postgres: la base rechaza roles invalidos y nombres vacios', async () => {
    await assert.rejects(
      pool.query(
        "INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ('A', 'rol@x.com', 'h', 'dios')"
      )
    );
    await assert.rejects(
      pool.query("INSERT INTO usuarios (nombre, email, password_hash) VALUES ('   ', 'vacio@x.com', 'h')")
    );
  });
}
