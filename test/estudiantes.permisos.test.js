import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { crearCliente, iniciarApp } from './ayudas/entorno.js';

const CLAVE = 'Clave12345';

function crearRepositorioFalso() {
  const llamadas = [];
  const respuestas = {
    listar: { estudiantes: [], total: 0 },
    buscarPorId: { id: 1 },
    crear: { id: 1 },
    actualizar: { id: 1 },
    eliminar: true,
    listarCursos: [],
    resumen: { total: 0, activos: 0, progresoPromedio: 0, porCiudad: [] },
    reportes: { total: 0, activos: 0, completaron: 0, progresoPromedio: 0, ingresosUSD: 0, porPlan: [], rangosProgreso: [], top: [] }
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

const VALIDO = {
  nombre: 'Ana',
  apellido: 'Lopez',
  email: 'ana@correo.com',
  ciudad: 'Bogotá',
  cursoId: 1,
  plan: 'Básico',
  progreso: 10,
  fechaInscripcion: '2026-11-10'
};

const ACCIONES = [
  ['GET', '/api/estudiantes', undefined, 200],
  ['GET', '/api/estudiantes/1', undefined, 200],
  ['POST', '/api/estudiantes', VALIDO, 201],
  ['PATCH', '/api/estudiantes/1', { progreso: 20 }, 200],
  ['DELETE', '/api/estudiantes/1', undefined, 204]
];

function llamar(cliente, metodo, ruta, cuerpo) {
  const funcion = { GET: cliente.get, POST: cliente.post, PATCH: cliente.patch, DELETE: cliente.delete }[metodo];
  return metodo === 'POST' || metodo === 'PATCH' ? funcion(ruta, cuerpo) : funcion(ruta);
}

async function iniciarSesion(entorno, correo, rol) {
  const cliente = crearCliente(entorno.base);
  const respuesta = await cliente.post('/api/auth/registro', { nombre: 'Persona', email: correo, password: CLAVE });
  if (rol === 'administrador') await entorno.repositorio.actualizar(respuesta.cuerpo.usuario.id, { rol });
  return cliente;
}

describe('permisos de la API de estudiantes', () => {
  let entorno;
  let falso;
  let anonimo;
  let usuario;
  let admin;

  before(async () => {
    falso = crearRepositorioFalso();
    entorno = await iniciarApp({
      repositorioEstudiantes: falso.repositorio,
      ahora: () => new Date('2026-11-14T12:00:00Z')
    });
    anonimo = crearCliente(entorno.base);
    usuario = await iniciarSesion(entorno, 'usuario@correo.com', 'usuario');
    admin = await iniciarSesion(entorno, 'admin@correo.com', 'administrador');
  });
  after(() => entorno.cerrar());

  test('sin sesion todo responde 401 y no se consulta la base', async () => {
    falso.llamadas.length = 0;
    for (const [metodo, ruta, cuerpo] of ACCIONES) {
      const respuesta = await llamar(anonimo, metodo, ruta, cuerpo);
      assert.equal(respuesta.estado, 401, `${metodo} ${ruta}`);
    }
    for (const ruta of ['/api/cursos', '/api/resumen', '/api/reportes']) {
      assert.equal((await anonimo.get(ruta)).estado, 401, ruta);
    }
    assert.deepEqual(falso.llamadas, []);
  });

  test('un usuario normal recibe 403 en estudiantes y reportes, y no se consulta la base', async () => {
    falso.llamadas.length = 0;
    for (const [metodo, ruta, cuerpo] of ACCIONES) {
      const respuesta = await llamar(usuario, metodo, ruta, cuerpo);
      assert.equal(respuesta.estado, 403, `${metodo} ${ruta}`);
      assert.equal(respuesta.cuerpo.codigo, 'SIN_PERMISO');
    }
    assert.equal((await usuario.get('/api/reportes')).estado, 403);
    assert.deepEqual(falso.llamadas, []);
  });

  test('un usuario normal si puede ver el catalogo y el resumen', async () => {
    assert.equal((await usuario.get('/api/cursos')).estado, 200);
    assert.equal((await usuario.get('/api/resumen')).estado, 200);
  });

  test('un administrador puede usar todas las rutas', async () => {
    for (const [metodo, ruta, cuerpo, esperado] of ACCIONES) {
      const respuesta = await llamar(admin, metodo, ruta, cuerpo);
      assert.equal(respuesta.estado, esperado, `${metodo} ${ruta}`);
    }
    assert.equal((await admin.get('/api/reportes')).estado, 200);
    assert.equal((await admin.get('/api/cursos')).estado, 200);
  });

  test('si una cuenta pierde el rol de administrador, pierde el acceso con la misma sesion', async () => {
    const otro = await iniciarSesion(entorno, 'otro@correo.com', 'administrador');
    assert.equal((await otro.get('/api/estudiantes')).estado, 200);

    const cuenta = await entorno.repositorio.buscarPorEmail('otro@correo.com');
    await entorno.repositorio.actualizar(cuenta.id, { rol: 'usuario' });

    assert.equal((await otro.get('/api/estudiantes')).estado, 403);
  });
});

describe('validacion antes de tocar la base', () => {
  let entorno;
  let falso;
  let admin;

  before(async () => {
    falso = crearRepositorioFalso();
    entorno = await iniciarApp({
      repositorioEstudiantes: falso.repositorio,
      ahora: () => new Date('2026-11-14T12:00:00Z')
    });
    admin = await iniciarSesion(entorno, 'admin@correo.com', 'administrador');
  });
  after(() => entorno.cerrar());

  test('un cuerpo invalido responde 400 con los campos y no consulta la base', async () => {
    falso.llamadas.length = 0;
    const respuesta = await admin.post('/api/estudiantes', { ...VALIDO, progreso: 150, plan: 'X', email: 'mal' });

    assert.equal(respuesta.estado, 400);
    assert.equal(respuesta.cuerpo.codigo, 'DATOS_INVALIDOS');
    assert.deepEqual(Object.keys(respuesta.cuerpo.campos).sort(), ['email', 'plan', 'progreso']);
    assert.deepEqual(falso.llamadas, []);
  });

  test('la fecha limite sigue al reloj del servidor, con un dia de tolerancia', async () => {
    assert.equal((await admin.post('/api/estudiantes', { ...VALIDO, fechaInscripcion: '2026-11-15' })).estado, 201);
    assert.equal((await admin.post('/api/estudiantes', { ...VALIDO, fechaInscripcion: '2026-11-16' })).estado, 400);
  });

  test('los filtros y los ids invalidos responden 400', async () => {
    assert.equal((await admin.get('/api/estudiantes?pagina=0')).estado, 400);
    assert.equal((await admin.get('/api/estudiantes?limite=500')).estado, 400);
    assert.equal((await admin.get('/api/estudiantes?plan=Platino')).estado, 400);
    assert.equal((await admin.get('/api/estudiantes/abc')).estado, 400);
    assert.equal((await admin.patch('/api/estudiantes/-1', { progreso: 1 })).estado, 400);
    assert.equal((await admin.delete('/api/estudiantes/0')).estado, 400);
  });

  test('un cambio vacio responde 400', async () => {
    const respuesta = await admin.patch('/api/estudiantes/1', {});

    assert.equal(respuesta.estado, 400);
    assert.ok(respuesta.cuerpo.campos.general);
  });
});

describe('sin repositorio de estudiantes', () => {
  test('un administrador recibe 503 en lugar de un error interno', async () => {
    const entorno = await iniciarApp();
    const admin = await iniciarSesion(entorno, 'admin@correo.com', 'administrador');
    const respuesta = await admin.get('/api/estudiantes');
    await entorno.cerrar();

    assert.equal(respuesta.estado, 503);
    assert.equal(respuesta.cuerpo.codigo, 'NO_DISPONIBLE');
  });
});
