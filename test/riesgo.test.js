import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { leerConfig } from '../src/config.js';
import { crearClienteRiesgo } from '../src/servicios/riesgo.js';
import { crearCliente, iniciarApp } from './ayudas/entorno.js';

const ESTUDIANTE = { id: 7, nombre: 'Ana', progreso: 30, plan: 'Básico', fechaInscripcion: '2025-12-01' };
const CLAVE = 'Clave12345';

const repositorioConEstudiante = new Proxy(
  {},
  { get: (_, nombre) => async () => (nombre === 'buscarPorId' ? ESTUDIANTE : null) }
);

async function sesion(entorno, correo, rol) {
  const cliente = crearCliente(entorno.base);
  const registro = await cliente.post('/api/auth/registro', { nombre: 'Persona', email: correo, password: CLAVE });
  if (rol) await entorno.repositorio.actualizar(registro.cuerpo.usuario.id, { rol });
  return cliente;
}

describe('cliente del servicio de riesgo', () => {
  test('envía solo los datos que necesita el modelo', async () => {
    let recibido;
    const cliente = crearClienteRiesgo({
      url: 'http://riesgo:8000',
      peticion: async (url, opciones) => {
        recibido = { url, cuerpo: JSON.parse(opciones.body), metodo: opciones.method };
        return { ok: true, json: async () => ({ nivel: 'alto' }) };
      }
    });

    const resultado = await cliente.evaluar(ESTUDIANTE);

    assert.deepEqual(resultado, { nivel: 'alto' });
    assert.equal(recibido.url, 'http://riesgo:8000/riesgo');
    assert.equal(recibido.metodo, 'POST');
    assert.deepEqual(recibido.cuerpo, { progreso: 30, fechaInscripcion: '2025-12-01', plan: 'Básico' });
  });

  test('sin URL configurada responde 503', async () => {
    await assert.rejects(
      crearClienteRiesgo({ url: null }).evaluar(ESTUDIANTE),
      (error) => error.estado === 503 && error.codigo === 'RIESGO_NO_DISPONIBLE'
    );
  });

  test('si el servicio no responde, responde 502', async () => {
    const cliente = crearClienteRiesgo({
      url: 'http://riesgo:8000',
      peticion: async () => {
        throw new Error('ECONNREFUSED');
      }
    });

    await assert.rejects(cliente.evaluar(ESTUDIANTE), (error) => error.estado === 502 && error.codigo === 'RIESGO_NO_RESPONDE');
  });

  test('si el servicio devuelve un error, responde 502', async () => {
    const cliente = crearClienteRiesgo({ url: 'http://riesgo:8000', peticion: async () => ({ ok: false }) });

    await assert.rejects(cliente.evaluar(ESTUDIANTE), (error) => error.estado === 502 && error.codigo === 'RIESGO_ERROR');
  });
});

describe('configuración', () => {
  test('RIESGO_URL se limpia y es opcional', () => {
    const base = { JWT_SECRET: 'secreto-de-pruebas-con-mas-de-32-caracteres', DATABASE_URL: 'postgres://sin-uso' };

    assert.equal(leerConfig(base).riesgoUrl, null);
    assert.equal(leerConfig({ ...base, RIESGO_URL: ' http://riesgo:8000/// ' }).riesgoUrl, 'http://riesgo:8000');
  });
});

describe('GET /api/estudiantes/:id/riesgo', () => {
  let entorno;
  const pedidos = [];

  before(async () => {
    entorno = await iniciarApp({
      repositorioEstudiantes: repositorioConEstudiante,
      clienteRiesgo: {
        evaluar: async (estudiante) => {
          pedidos.push(estudiante);
          return { nivel: 'medio', probabilidad: 0.5 };
        }
      }
    });
  });
  after(() => entorno.cerrar());

  test('un administrador recibe la estimación del estudiante', async () => {
    const cliente = await sesion(entorno, 'admin@correo.com', 'administrador');

    const respuesta = await cliente.get('/api/estudiantes/7/riesgo');

    assert.equal(respuesta.estado, 200);
    assert.deepEqual(respuesta.cuerpo, { riesgo: { nivel: 'medio', probabilidad: 0.5 } });
    assert.equal(pedidos.at(-1).id, 7);
  });

  test('la demo también puede consultarla', async () => {
    const cliente = await sesion(entorno, 'otra-demo@correo.com', 'demo');

    assert.equal((await cliente.get('/api/estudiantes/7/riesgo')).estado, 200);
  });

  test('un usuario normal recibe 403 y el servicio de riesgo no se consulta', async () => {
    const antes = pedidos.length;
    const cliente = await sesion(entorno, 'normal@correo.com');

    const respuesta = await cliente.get('/api/estudiantes/7/riesgo');

    assert.equal(respuesta.estado, 403);
    assert.equal(pedidos.length, antes);
  });

  test('sin sesión recibe 401', async () => {
    assert.equal((await crearCliente(entorno.base).get('/api/estudiantes/7/riesgo')).estado, 401);
  });

  test('un identificador inválido responde 400', async () => {
    const cliente = await sesion(entorno, 'admin2@correo.com', 'administrador');

    const respuesta = await cliente.get('/api/estudiantes/abc/riesgo');

    assert.equal(respuesta.estado, 400);
    assert.equal(respuesta.cuerpo.codigo, 'ID_INVALIDO');
  });
});
