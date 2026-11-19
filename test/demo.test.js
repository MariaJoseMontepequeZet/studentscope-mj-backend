import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { crearPool } from '../src/db/pool.js';
import { restaurarEstudiantesDeEjemplo, sembrarEstudiantesDeEjemplo } from '../src/db/sembrar.js';
import { crearRepositorioUsuariosPg } from '../src/repositorios/usuariosPg.js';
import { EMAIL_DEMO } from '../src/servicios/cuentas.js';
import { reiniciarEsquema } from './ayudas/baseDatos.js';
import { crearCliente, iniciarApp } from './ayudas/entorno.js';

const CLAVE = 'Clave12345';

function crearRepositorioFalso(total = 0) {
  const llamadas = [];
  const respuestas = {
    listar: { estudiantes: [], total },
    buscarPorId: { id: 1 },
    crear: { id: 1 },
    actualizar: { id: 1 },
    eliminar: true,
    listarCursos: [],
    resumen: { total: 0, activos: 0, progresoPromedio: 0, porCiudad: [] },
    reportes: {
      total: 0,
      activos: 0,
      completaron: 0,
      progresoPromedio: 0,
      ingresosUSD: 0,
      porPlan: [],
      rangosProgreso: [],
      top: []
    }
  };
  const repositorio = new Proxy(
    {},
    {
      get: (_, nombre) => async () => {
        llamadas.push(nombre);
        return respuestas[nombre];
      }
    }
  );
  return { repositorio, llamadas };
}

const ESTUDIANTE = {
  nombre: 'Ana',
  apellido: 'Lopez',
  email: 'ana@correo.com',
  ciudad: 'Bogotá',
  cursoId: 1,
  plan: 'Básico',
  progreso: 10,
  fechaInscripcion: '2026-11-10'
};

describe('demo deshabilitada', () => {
  let entorno;
  before(async () => {
    entorno = await iniciarApp();
    await entorno.servicio.asegurarUsuarioDemo();
  });
  after(() => entorno.cerrar());

  test('la entrada de demo responde 404 aunque la cuenta exista', async () => {
    const cliente = crearCliente(entorno.base);
    const respuesta = await cliente.post('/api/auth/demo');

    assert.equal(respuesta.estado, 404);
    assert.equal(respuesta.cuerpo.codigo, 'DEMO_NO_DISPONIBLE');
    assert.equal(respuesta.setCookie.length, 0);
  });
});

describe('demo habilitada', () => {
  let entorno;
  let falso;
  before(async () => {
    falso = crearRepositorioFalso();
    entorno = await iniciarApp({
      env: { DEMO_HABILITADA: 'true', DEMO_MAX_ESTUDIANTES: '3' },
      repositorioEstudiantes: falso.repositorio
    });
    await entorno.servicio.asegurarUsuarioDemo();
  });
  after(() => entorno.cerrar());

  async function entrarComoDemo() {
    const cliente = crearCliente(entorno.base);
    const respuesta = await cliente.post('/api/auth/demo');
    assert.equal(respuesta.estado, 200);
    return { cliente, respuesta };
  }

  test('entra sin credenciales con el rol demo y sin datos sensibles', async () => {
    const { respuesta } = await entrarComoDemo();

    assert.equal(respuesta.cuerpo.usuario.rol, 'demo');
    assert.equal(respuesta.cuerpo.usuario.email, EMAIL_DEMO);
    assert.equal(respuesta.cuerpo.usuario.passwordHash, undefined);
  });

  test('la sesión de demo dura dos horas y no más', async () => {
    const { respuesta } = await entrarComoDemo();
    const cookie = respuesta.setCookie.find((c) => c.startsWith('sesion='));

    assert.match(cookie, /Max-Age=7200/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
  });

  test('puede gestionar estudiantes y ver reportes, resumen y cursos', async () => {
    const { cliente } = await entrarComoDemo();

    assert.equal((await cliente.get('/api/estudiantes')).estado, 200);
    assert.equal((await cliente.get('/api/estudiantes/1')).estado, 200);
    assert.equal((await cliente.patch('/api/estudiantes/1', { progreso: 20 })).estado, 200);
    assert.equal((await cliente.delete('/api/estudiantes/1')).estado, 204);
    assert.equal((await cliente.get('/api/reportes')).estado, 200);
    assert.equal((await cliente.get('/api/resumen')).estado, 200);
    assert.equal((await cliente.get('/api/cursos')).estado, 200);
  });

  test('no puede ver ni tocar cuentas', async () => {
    const { cliente } = await entrarComoDemo();

    assert.equal((await cliente.get('/api/usuarios')).estado, 403);
    assert.equal((await cliente.patch('/api/usuarios/1', { rol: 'administrador' })).estado, 403);
    assert.equal((await cliente.delete('/api/usuarios/1')).estado, 403);
  });

  test('no puede cambiar su nombre, avatar ni contraseña', async () => {
    const { cliente } = await entrarComoDemo();

    for (const cuerpo of [
      { nombre: 'Otro' },
      { avatarSemilla: 'abc' },
      { passwordActual: 'x', passwordNueva: 'Nueva123456' }
    ]) {
      const respuesta = await cliente.patch('/api/auth/yo', cuerpo);
      assert.equal(respuesta.estado, 403);
      assert.equal(respuesta.cuerpo.codigo, 'SIN_PERMISO');
    }
  });

  test('no se puede entrar a la cuenta de demo con una contraseña', async () => {
    const cliente = crearCliente(entorno.base);
    for (const password of [CLAVE, 'demo', 'Demo12345', '']) {
      const respuesta = await cliente.post('/api/auth/login', { email: EMAIL_DEMO, password });
      assert.ok([400, 401].includes(respuesta.estado));
    }
  });

  test('limita cuántos estudiantes puede haber', async () => {
    const lleno = crearRepositorioFalso(3);
    const otro = await iniciarApp({
      env: { DEMO_HABILITADA: 'true', DEMO_MAX_ESTUDIANTES: '3' },
      repositorioEstudiantes: lleno.repositorio
    });
    try {
      await otro.servicio.asegurarUsuarioDemo();
      const cliente = crearCliente(otro.base);
      await cliente.post('/api/auth/demo');

      const rechazado = await cliente.post('/api/estudiantes', ESTUDIANTE);
      assert.equal(rechazado.estado, 409);
      assert.equal(rechazado.cuerpo.codigo, 'DEMO_LIMITE');
      assert.ok(!lleno.llamadas.includes('crear'));
    } finally {
      await otro.cerrar();
    }
  });

  test('con espacio libre sí permite crear', async () => {
    const { cliente } = await entrarComoDemo();
    const respuesta = await cliente.post('/api/estudiantes', ESTUDIANTE);

    assert.equal(respuesta.estado, 201);
    assert.ok(falso.llamadas.includes('crear'));
  });

  test('un administrador real no tiene el límite de la demo', async () => {
    const lleno = crearRepositorioFalso(500);
    const otro = await iniciarApp({
      env: { DEMO_HABILITADA: 'true', DEMO_MAX_ESTUDIANTES: '3' },
      repositorioEstudiantes: lleno.repositorio
    });
    try {
      const cliente = crearCliente(otro.base);
      const registro = await cliente.post('/api/auth/registro', {
        nombre: 'Jefa',
        email: 'jefa@correo.com',
        password: CLAVE
      });
      await otro.repositorio.actualizar(registro.cuerpo.usuario.id, { rol: 'administrador' });

      assert.equal((await cliente.post('/api/estudiantes', ESTUDIANTE)).estado, 201);
    } finally {
      await otro.cerrar();
    }
  });
});

describe('cuenta de demo', () => {
  test('quien registró antes ese correo pierde el acceso con su contraseña', async () => {
    const entorno = await iniciarApp({ env: { DEMO_HABILITADA: 'true' } });
    try {
      const intruso = crearCliente(entorno.base);
      const registro = await intruso.post('/api/auth/registro', {
        nombre: 'Intruso',
        email: EMAIL_DEMO,
        password: CLAVE
      });
      assert.equal(registro.estado, 201);

      await entorno.servicio.asegurarUsuarioDemo();

      const login = await crearCliente(entorno.base).post('/api/auth/login', {
        email: EMAIL_DEMO,
        password: CLAVE
      });
      assert.equal(login.estado, 401);
      assert.equal((await crearCliente(entorno.base).post('/api/auth/demo')).cuerpo.usuario.rol, 'demo');
    } finally {
      await entorno.cerrar();
    }
  });

  test('prepararla dos veces no crea otra cuenta', async () => {
    const entorno = await iniciarApp({ env: { DEMO_HABILITADA: 'true' } });
    try {
      await entorno.servicio.asegurarUsuarioDemo();
      await entorno.servicio.asegurarUsuarioDemo();
      const demos = (await entorno.servicio.listar()).filter((u) => u.rol === 'demo');
      assert.equal(demos.length, 1);
    } finally {
      await entorno.cerrar();
    }
  });

  test('un administrador no puede ascender a nadie a demo', async () => {
    const entorno = await iniciarApp();
    try {
      const cliente = crearCliente(entorno.base);
      const registro = await cliente.post('/api/auth/registro', {
        nombre: 'Jefa',
        email: 'jefa@correo.com',
        password: CLAVE
      });
      await entorno.repositorio.actualizar(registro.cuerpo.usuario.id, { rol: 'administrador' });

      const respuesta = await cliente.patch(`/api/usuarios/${registro.cuerpo.usuario.id}`, { rol: 'demo' });
      assert.equal(respuesta.estado, 400);
    } finally {
      await entorno.cerrar();
    }
  });
});

const urlPruebas = process.env.TEST_DATABASE_URL;

if (!urlPruebas) {
  test('demo con postgres: omitido porque falta TEST_DATABASE_URL', { skip: true }, () => {});
} else {
  describe('demo con postgres', () => {
    const pool = crearPool({ connectionString: urlPruebas });

    before(() => reiniciarEsquema(pool));
    after(() => pool.end());

    test('la base acepta el rol demo y rechaza otros desconocidos', async () => {
      const repo = crearRepositorioUsuariosPg(pool);
      await pool.query('TRUNCATE usuarios RESTART IDENTITY');

      const demo = await repo.crear({ nombre: 'Demo', email: EMAIL_DEMO, passwordHash: 'h', rol: 'demo' });
      assert.equal(demo.rol, 'demo');
      await assert.rejects(
        repo.crear({ nombre: 'X', email: 'x@correo.com', passwordHash: 'h', rol: 'superusuario' }),
        /check|violates/i
      );
    });

    test('restaurar deja exactamente los estudiantes de ejemplo y reinicia los ids', async () => {
      await pool.query('TRUNCATE estudiantes RESTART IDENTITY');
      assert.equal(await sembrarEstudiantesDeEjemplo(pool), 35);

      await pool.query('DELETE FROM estudiantes WHERE id <= 10');
      await pool.query("UPDATE estudiantes SET nombre = 'Vandalizado', progreso = 0");
      await pool.query(
        `INSERT INTO estudiantes (nombre, apellido, email, ciudad, curso_id, plan, progreso, fecha_inscripcion)
         VALUES ('Extra', 'Visitante', 'extra@correo.com', 'Cali', 1, 'Premium', 5, '2025-01-01')`
      );

      assert.equal(await restaurarEstudiantesDeEjemplo(pool), 35);

      const { rows } = await pool.query(
        `SELECT count(*)::int AS total, min(id)::int AS minimo, max(id)::int AS maximo,
                count(*) FILTER (WHERE nombre = 'Vandalizado' OR email = 'extra@correo.com')::int AS rastros
         FROM estudiantes`
      );
      assert.deepEqual(rows[0], { total: 35, minimo: 1, maximo: 35, rastros: 0 });
    });

    test('restaurar no toca las cuentas', async () => {
      await pool.query('TRUNCATE usuarios RESTART IDENTITY');
      const repo = crearRepositorioUsuariosPg(pool);
      await repo.crear({ nombre: 'Ana', email: 'ana@correo.com', passwordHash: 'h', rol: 'usuario' });

      await restaurarEstudiantesDeEjemplo(pool);

      const { rows } = await pool.query('SELECT count(*)::int AS total FROM usuarios');
      assert.equal(rows[0].total, 1);
    });

    test('dos restauraciones a la vez terminan con los 35 sin duplicados', async () => {
      await Promise.all([restaurarEstudiantesDeEjemplo(pool), restaurarEstudiantesDeEjemplo(pool)]);

      const { rows } = await pool.query('SELECT count(*)::int AS total FROM estudiantes');
      assert.equal(rows[0].total, 35);
    });
  });
}
