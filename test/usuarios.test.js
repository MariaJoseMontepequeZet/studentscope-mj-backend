import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { crearCliente, iniciarApp } from './ayudas/entorno.js';

const CLAVE = 'Clave12345';

async function registrar(entorno, email, nombre = 'Persona') {
  const cliente = crearCliente(entorno.base);
  const respuesta = await cliente.post('/api/auth/registro', { nombre, email, password: CLAVE });
  return { cliente, usuario: respuesta.cuerpo.usuario };
}

async function crearAdministrador(entorno, email = 'admin@correo.com') {
  const { cliente, usuario } = await registrar(entorno, email, 'Administradora');
  await entorno.repositorio.actualizar(usuario.id, { rol: 'administrador' });
  return { cliente, usuario: { ...usuario, rol: 'administrador' } };
}

describe('acceso a la gestion de cuentas', () => {
  let entorno;
  before(async () => {
    entorno = await iniciarApp();
  });
  after(() => entorno.cerrar());

  test('sin sesion responde 401', async () => {
    const respuesta = await crearCliente(entorno.base).get('/api/usuarios');

    assert.equal(respuesta.estado, 401);
  });

  test('un usuario normal recibe 403 en todas las operaciones', async () => {
    const { cliente, usuario } = await registrar(entorno, 'normal@correo.com');

    assert.equal((await cliente.get('/api/usuarios')).estado, 403);
    assert.equal((await cliente.patch(`/api/usuarios/${usuario.id}`, { nombre: 'Otro' })).estado, 403);
    assert.equal((await cliente.delete(`/api/usuarios/${usuario.id}`)).estado, 403);
  });

  test('un administrador puede listar sin ver contraseñas', async () => {
    const { cliente } = await crearAdministrador(entorno);
    const respuesta = await cliente.get('/api/usuarios');

    assert.equal(respuesta.estado, 200);
    assert.ok(respuesta.cuerpo.usuarios.length >= 2);
    assert.ok(respuesta.cuerpo.usuarios.every((u) => u.passwordHash === undefined && u.password === undefined));
    assert.deepEqual(Object.keys(respuesta.cuerpo.usuarios[0]).sort(), ['creadoEn', 'email', 'id', 'nombre', 'rol']);
  });
});

describe('edicion de cuentas', () => {
  let entorno;
  before(async () => {
    entorno = await iniciarApp();
  });
  after(() => entorno.cerrar());

  test('edita el nombre y el correo de otra cuenta', async () => {
    const { cliente: admin } = await crearAdministrador(entorno);
    const { usuario } = await registrar(entorno, 'editar@correo.com');

    const respuesta = await admin.patch(`/api/usuarios/${usuario.id}`, { nombre: 'Nombre Nuevo', email: 'NUEVO@correo.com' });

    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cuerpo.usuario.nombre, 'Nombre Nuevo');
    assert.equal(respuesta.cuerpo.usuario.email, 'nuevo@correo.com');
  });

  test('rechaza un correo que ya usa otra cuenta', async () => {
    const { cliente: admin } = await crearAdministrador(entorno, 'admin2@correo.com');
    const { usuario } = await registrar(entorno, 'repetido@correo.com');

    const respuesta = await admin.patch(`/api/usuarios/${usuario.id}`, { email: 'admin2@correo.com' });

    assert.equal(respuesta.estado, 409);
    assert.equal(respuesta.cuerpo.codigo, 'EMAIL_DUPLICADO');
  });

  test('valida los campos enviados', async () => {
    const { cliente: admin } = await crearAdministrador(entorno, 'admin3@correo.com');
    const { usuario } = await registrar(entorno, 'valida@correo.com');

    const rolInvalido = await admin.patch(`/api/usuarios/${usuario.id}`, { rol: 'superman' });
    const sinCambios = await admin.patch(`/api/usuarios/${usuario.id}`, {});
    const nombreVacio = await admin.patch(`/api/usuarios/${usuario.id}`, { nombre: '   ' });
    const emailMalo = await admin.patch(`/api/usuarios/${usuario.id}`, { email: 'nada' });

    assert.equal(rolInvalido.estado, 400);
    assert.ok(rolInvalido.cuerpo.campos.rol);
    assert.equal(sinCambios.estado, 400);
    assert.ok(nombreVacio.cuerpo.campos.nombre);
    assert.ok(emailMalo.cuerpo.campos.email);
  });

  test('responde 404 si la cuenta no existe y 400 si el id no es valido', async () => {
    const { cliente: admin } = await crearAdministrador(entorno, 'admin4@correo.com');

    assert.equal((await admin.patch('/api/usuarios/99999', { nombre: 'X' })).estado, 404);
    assert.equal((await admin.patch('/api/usuarios/abc', { nombre: 'X' })).estado, 400);
    assert.equal((await admin.patch('/api/usuarios/-3', { nombre: 'X' })).estado, 400);
  });

  test('restablece la contraseña de otra cuenta', async () => {
    const { cliente: admin } = await crearAdministrador(entorno, 'admin5@correo.com');
    const { usuario } = await registrar(entorno, 'olvido@correo.com');

    const respuesta = await admin.patch(`/api/usuarios/${usuario.id}`, { password: 'Restablecida99' });
    const viejo = await crearCliente(entorno.base).post('/api/auth/login', { email: 'olvido@correo.com', password: CLAVE });
    const nuevo = await crearCliente(entorno.base).post('/api/auth/login', { email: 'olvido@correo.com', password: 'Restablecida99' });

    assert.equal(respuesta.estado, 200);
    assert.equal(viejo.estado, 401);
    assert.equal(nuevo.estado, 200);
  });

  test('rechaza una contraseña débil al restablecer', async () => {
    const { cliente: admin } = await crearAdministrador(entorno, 'admin6@correo.com');
    const { usuario } = await registrar(entorno, 'debil@correo.com');

    const respuesta = await admin.patch(`/api/usuarios/${usuario.id}`, { password: 'corta' });

    assert.equal(respuesta.estado, 400);
    assert.ok(respuesta.cuerpo.campos.password);
  });
});

describe('promover y degradar administradores', () => {
  let entorno;
  before(async () => {
    entorno = await iniciarApp();
  });
  after(() => entorno.cerrar());

  test('al promover una cuenta, sus permisos cambian de inmediato', async () => {
    const { cliente: admin } = await crearAdministrador(entorno);
    const { cliente: normal, usuario } = await registrar(entorno, 'promover@correo.com');
    assert.equal((await normal.get('/api/usuarios')).estado, 403);

    const promocion = await admin.patch(`/api/usuarios/${usuario.id}`, { rol: 'administrador' });

    assert.equal(promocion.cuerpo.usuario.rol, 'administrador');
    assert.equal((await normal.get('/api/usuarios')).estado, 200);
  });

  test('al degradar una cuenta, pierde los permisos con la misma sesion', async () => {
    const { cliente: admin } = await crearAdministrador(entorno, 'jefa@correo.com');
    const { cliente: otro, usuario } = await registrar(entorno, 'degradar@correo.com');
    await admin.patch(`/api/usuarios/${usuario.id}`, { rol: 'administrador' });
    assert.equal((await otro.get('/api/usuarios')).estado, 200);

    const degradacion = await admin.patch(`/api/usuarios/${usuario.id}`, { rol: 'usuario' });

    assert.equal(degradacion.cuerpo.usuario.rol, 'usuario');
    assert.equal((await otro.get('/api/usuarios')).estado, 403);
  });

  test('no se puede degradar al ultimo administrador', async () => {
    const solo = await iniciarApp();
    const { cliente: admin, usuario } = await crearAdministrador(solo, 'unico@correo.com');

    const respuesta = await admin.patch(`/api/usuarios/${usuario.id}`, { rol: 'usuario' });
    await solo.cerrar();

    assert.equal(respuesta.estado, 409);
    assert.equal(respuesta.cuerpo.codigo, 'ULTIMO_ADMINISTRADOR');
  });
});

describe('eliminacion de cuentas', () => {
  let entorno;
  before(async () => {
    entorno = await iniciarApp();
  });
  after(() => entorno.cerrar());

  test('elimina otra cuenta y su sesion deja de valer', async () => {
    const { cliente: admin } = await crearAdministrador(entorno);
    const { cliente: victima, usuario } = await registrar(entorno, 'borrar@correo.com');

    const respuesta = await admin.delete(`/api/usuarios/${usuario.id}`);

    assert.equal(respuesta.estado, 204);
    assert.equal((await victima.get('/api/auth/yo')).estado, 401);
    assert.equal((await admin.delete(`/api/usuarios/${usuario.id}`)).estado, 404);
  });

  test('no permite que un administrador elimine su propia cuenta', async () => {
    const { cliente: admin, usuario } = await crearAdministrador(entorno, 'propio@correo.com');

    const respuesta = await admin.delete(`/api/usuarios/${usuario.id}`);

    assert.equal(respuesta.estado, 409);
    assert.equal(respuesta.cuerpo.codigo, 'NO_AUTOELIMINAR');
  });

  test('un administrador puede eliminar a otro mientras quede alguno', async () => {
    const { cliente: admin } = await crearAdministrador(entorno, 'jefe1@correo.com');
    const { usuario } = await crearAdministrador(entorno, 'jefe2@correo.com');

    assert.equal((await admin.delete(`/api/usuarios/${usuario.id}`)).estado, 204);
  });

  test('rechaza ids no validos', async () => {
    const { cliente: admin } = await crearAdministrador(entorno, 'jefe3@correo.com');

    assert.equal((await admin.delete('/api/usuarios/abc')).estado, 400);
    assert.equal((await admin.delete('/api/usuarios/0')).estado, 400);
  });
});

describe('administrador inicial', () => {
  const CLAVE_ADMIN = 'AdminInicial123';

  test('lo crea cuando no existe ningun administrador', async () => {
    const entorno = await iniciarApp();
    const resultado = await entorno.servicio.asegurarAdministradorInicial({ email: 'jefa@empresa.com', password: CLAVE_ADMIN });
    const login = await crearCliente(entorno.base).post('/api/auth/login', { email: 'jefa@empresa.com', password: CLAVE_ADMIN });
    await entorno.cerrar();

    assert.equal(resultado, 'creado');
    assert.equal(login.cuerpo.usuario.rol, 'administrador');
  });

  test('no hace nada si ya hay un administrador', async () => {
    const entorno = await iniciarApp();
    await crearAdministrador(entorno);
    const resultado = await entorno.servicio.asegurarAdministradorInicial({ email: 'otra@empresa.com', password: CLAVE_ADMIN });
    await entorno.cerrar();

    assert.equal(resultado, 'existente');
  });

  test('promueve a una cuenta existente con ese correo', async () => {
    const entorno = await iniciarApp();
    await registrar(entorno, 'ya@empresa.com');
    const resultado = await entorno.servicio.asegurarAdministradorInicial({ email: 'ya@empresa.com', password: CLAVE_ADMIN });
    const usuario = await entorno.repositorio.buscarPorEmail('ya@empresa.com');
    await entorno.cerrar();

    assert.equal(resultado, 'promovido');
    assert.equal(usuario.rol, 'administrador');
  });

  test('se omite si faltan las variables', async () => {
    const entorno = await iniciarApp();
    const resultado = await entorno.servicio.asegurarAdministradorInicial({ email: null, password: null });
    await entorno.cerrar();

    assert.equal(resultado, 'omitido');
  });

  test('falla con un correo o una contraseña no validos', async () => {
    const entorno = await iniciarApp();
    await assert.rejects(entorno.servicio.asegurarAdministradorInicial({ email: 'no-es-correo', password: CLAVE_ADMIN }), /no son v/);
    await assert.rejects(entorno.servicio.asegurarAdministradorInicial({ email: 'ok@empresa.com', password: 'corta' }), /no son v/);
    await entorno.cerrar();
  });
});
