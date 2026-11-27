import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteRiesgo } from '../src/servicios/riesgo.js';
import { errorPassword } from '../src/validacion.js';
import { crearCliente, iniciarApp } from './ayudas/entorno.js';

const CLAVE = 'Clave12345';
const ENORME = '99999999999999999999';
const SIN_ESTUDIANTES = {
  listar: async () => ({ estudiantes: [], total: 0 }),
  buscarPorId: async () => null
};

async function crearCuenta(entorno, email, rol) {
  const cliente = crearCliente(entorno.base);
  const registro = await cliente.post('/api/auth/registro', { nombre: 'Persona', email, password: CLAVE });
  const { id } = registro.cuerpo.usuario;
  if (rol) await entorno.repositorio.actualizar(id, { rol });
  return { cliente, id };
}

describe('hallazgos de la revision de calidad', () => {
  let entorno;
  let admin;
  before(async () => {
    entorno = await iniciarApp({ repositorioEstudiantes: SIN_ESTUDIANTES });
    admin = (await crearCuenta(entorno, 'admin@qa.com', 'administrador')).cliente;
  });
  after(() => entorno.cerrar());

  test('un identificador o una pagina enormes responden 400 y no 500', async () => {
    for (const ruta of [`/api/estudiantes/${ENORME}`, `/api/estudiantes?pagina=${ENORME}`, `/api/estudiantes?curso=${ENORME}`]) {
      assert.equal((await admin.get(ruta)).estado, 400, ruta);
    }
    assert.equal((await admin.delete(`/api/usuarios/${ENORME}`)).estado, 400);
    assert.equal((await admin.delete('/api/usuarios/1e3')).estado, 400);
  });

  test('la contraseña no puede pasar de 72 bytes aunque tenga menos de 72 caracteres', () => {
    assert.equal(errorPassword(`a1${'ñ'.repeat(35)}`), null);
    assert.match(errorPassword(`a1${'ñ'.repeat(36)}`), /demasiado larga/);
  });

  test('la cuenta de demostracion no se puede editar ni eliminar', async () => {
    const demo = await crearCuenta(entorno, 'demo@qa.com', 'demo');

    const editar = await admin.patch(`/api/usuarios/${demo.id}`, { rol: 'administrador' });
    const eliminar = await admin.delete(`/api/usuarios/${demo.id}`);

    assert.equal(editar.estado, 409);
    assert.equal(editar.cuerpo.codigo, 'CUENTA_DEMO');
    assert.equal(eliminar.estado, 409);
    assert.equal((await entorno.repositorio.buscarPorId(demo.id)).rol, 'demo');
  });

  test('una codificacion de cuerpo no admitida no es un error interno', async () => {
    const respuesta = await crearCliente(entorno.base).post('/api/auth/login', '{}', {
      'Content-Type': 'application/json; charset=latin-9'
    });

    assert.equal(respuesta.estado, 415);
    assert.equal(respuesta.cuerpo.codigo, 'SOLICITUD_INVALIDA');
  });

  test('si el servicio de riesgo devuelve algo que no es JSON responde 502', async () => {
    const cliente = crearClienteRiesgo({
      url: 'http://riesgo',
      peticion: async () => ({ ok: true, json: async () => JSON.parse('<html>') })
    });

    await assert.rejects(cliente.evaluar({}), { estado: 502, codigo: 'RIESGO_ERROR' });
  });
});
