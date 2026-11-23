import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { crearCliente, iniciarApp, REGISTRO, SECRETO } from './ayudas/entorno.js';

function cookieAnterior(id) {
  const emitidoEn = Math.floor(Date.now() / 1000) - 120;
  return `sesion=${jwt.sign({ sub: String(id), iat: emitidoEn }, SECRETO, { algorithm: 'HS256' })}`;
}

async function registrar(entorno, email) {
  const cliente = crearCliente(entorno.base);
  const respuesta = await cliente.post('/api/auth/registro', { ...REGISTRO, email });
  return { cliente, usuario: respuesta.cuerpo.usuario };
}

describe('sesiones y cambio de contraseña', () => {
  let entorno;
  before(async () => {
    entorno = await iniciarApp();
  });
  after(() => entorno.cerrar());

  test('una sesión abierta antes de cambiar la contraseña deja de servir', async () => {
    const { cliente, usuario } = await registrar(entorno, 'propia@correo.com');
    const otroDispositivo = crearCliente(entorno.base);
    otroDispositivo.fijarCookie(cookieAnterior(usuario.id));
    assert.equal((await otroDispositivo.get('/api/auth/yo')).estado, 200);

    const cambio = await cliente.patch('/api/auth/yo', {
      passwordActual: REGISTRO.password,
      passwordNueva: 'Nueva123456'
    });

    assert.equal(cambio.estado, 200);
    assert.equal((await otroDispositivo.get('/api/auth/yo')).estado, 401);
    assert.equal((await cliente.get('/api/auth/yo')).estado, 200);
  });

  test('cambiar solo el nombre no cierra otras sesiones', async () => {
    const { cliente, usuario } = await registrar(entorno, 'nombre@correo.com');
    const otroDispositivo = crearCliente(entorno.base);
    otroDispositivo.fijarCookie(cookieAnterior(usuario.id));

    await cliente.patch('/api/auth/yo', { nombre: 'Otro Nombre' });

    assert.equal((await otroDispositivo.get('/api/auth/yo')).estado, 200);
  });

  test('si un administrador cambia la contraseña de otra cuenta, sus sesiones se cierran', async () => {
    const { cliente: admin, usuario: cuentaAdmin } = await registrar(entorno, 'admin@correo.com');
    await entorno.repositorio.actualizar(cuentaAdmin.id, { rol: 'administrador' });
    const { usuario } = await registrar(entorno, 'victima@correo.com');
    const sesionVieja = crearCliente(entorno.base);
    sesionVieja.fijarCookie(cookieAnterior(usuario.id));
    assert.equal((await sesionVieja.get('/api/auth/yo')).estado, 200);

    const cambio = await admin.patch(`/api/usuarios/${usuario.id}`, { password: 'Restablecida123' });

    assert.equal(cambio.estado, 200);
    assert.equal((await sesionVieja.get('/api/auth/yo')).estado, 401);
    const nueva = crearCliente(entorno.base);
    const entrada = await nueva.post('/api/auth/login', { email: 'victima@correo.com', password: 'Restablecida123' });
    assert.equal(entrada.estado, 200);
  });

  test('un administrador que cambia su propia contraseña conserva su sesión', async () => {
    const { cliente, usuario } = await registrar(entorno, 'admin2@correo.com');
    await entorno.repositorio.actualizar(usuario.id, { rol: 'administrador' });

    const cambio = await cliente.patch(`/api/usuarios/${usuario.id}`, { password: 'Restablecida123' });

    assert.equal(cambio.estado, 200);
    assert.equal((await cliente.get('/api/auth/yo')).estado, 200);
  });
});
