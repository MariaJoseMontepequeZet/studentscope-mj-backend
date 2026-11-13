import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { crearLimiteIntentos } from '../src/middleware/limiteIntentos.js';
import { crearCliente, iniciarApp, REGISTRO, SECRETO } from './ayudas/entorno.js';

describe('registro', () => {
  let entorno;
  before(async () => {
    entorno = await iniciarApp();
  });
  after(() => entorno.cerrar());

  test('crea una cuenta con rol usuario y abre la sesion', async () => {
    const cliente = crearCliente(entorno.base);
    const respuesta = await cliente.post('/api/auth/registro', REGISTRO);

    assert.equal(respuesta.estado, 201);
    assert.equal(respuesta.cuerpo.usuario.rol, 'usuario');
    assert.equal(respuesta.cuerpo.usuario.email, 'ana@correo.com');
    assert.equal(respuesta.cuerpo.usuario.passwordHash, undefined);
    assert.equal(respuesta.cuerpo.usuario.password, undefined);
    assert.ok(cliente.cookie().startsWith('sesion='));
  });

  test('la cookie es HttpOnly y SameSite Strict', async () => {
    const cliente = crearCliente(entorno.base);
    const respuesta = await cliente.post('/api/auth/registro', { ...REGISTRO, email: 'cookie@correo.com' });
    const cookie = respuesta.setCookie.find((c) => c.startsWith('sesion='));

    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.doesNotMatch(cookie, /Secure/i);
  });

  test('no permite elegirse el rol al registrarse', async () => {
    const cliente = crearCliente(entorno.base);
    const respuesta = await cliente.post('/api/auth/registro', {
      ...REGISTRO,
      email: 'listo@correo.com',
      rol: 'administrador'
    });

    assert.equal(respuesta.estado, 201);
    assert.equal(respuesta.cuerpo.usuario.rol, 'usuario');
  });

  test('normaliza el correo a minusculas y rechaza duplicados sin distinguir mayusculas', async () => {
    const cliente = crearCliente(entorno.base);
    const primera = await cliente.post('/api/auth/registro', { ...REGISTRO, email: 'Mixto@Correo.com' });
    const segunda = await cliente.post('/api/auth/registro', { ...REGISTRO, email: 'mixto@correo.COM' });

    assert.equal(primera.cuerpo.usuario.email, 'mixto@correo.com');
    assert.equal(segunda.estado, 409);
    assert.equal(segunda.cuerpo.codigo, 'EMAIL_DUPLICADO');
  });

  test('valida nombre, correo y contraseña', async () => {
    const cliente = crearCliente(entorno.base);
    const respuesta = await cliente.post('/api/auth/registro', { nombre: '  ', email: 'no-es-correo', password: 'corta' });

    assert.equal(respuesta.estado, 400);
    assert.equal(respuesta.cuerpo.codigo, 'DATOS_INVALIDOS');
    assert.ok(respuesta.cuerpo.campos.nombre);
    assert.ok(respuesta.cuerpo.campos.email);
    assert.ok(respuesta.cuerpo.campos.password);
  });

  test('exige letras y numeros en la contraseña', async () => {
    const cliente = crearCliente(entorno.base);
    const soloLetras = await cliente.post('/api/auth/registro', { ...REGISTRO, email: 'a1@correo.com', password: 'sololetras' });
    const soloNumeros = await cliente.post('/api/auth/registro', { ...REGISTRO, email: 'a2@correo.com', password: '1234567890' });

    assert.equal(soloLetras.estado, 400);
    assert.equal(soloNumeros.estado, 400);
  });

  test('rechaza contraseñas de mas de 72 caracteres', async () => {
    const cliente = crearCliente(entorno.base);
    const respuesta = await cliente.post('/api/auth/registro', { ...REGISTRO, email: 'larga@correo.com', password: `a1${'x'.repeat(80)}` });

    assert.equal(respuesta.estado, 400);
  });

  test('guarda la contraseña con hash y nunca en texto plano', async () => {
    const cliente = crearCliente(entorno.base);
    await cliente.post('/api/auth/registro', { ...REGISTRO, email: 'hash@correo.com' });
    const guardado = await entorno.repositorio.buscarPorEmail('hash@correo.com');

    assert.notEqual(guardado.passwordHash, REGISTRO.password);
    assert.match(guardado.passwordHash, /^\$2[aby]\$/);
  });
});

describe('login y sesion', () => {
  let entorno;
  before(async () => {
    entorno = await iniciarApp({ limiteLogin: crearLimiteIntentos({ maximo: 3 }) });
    await crearCliente(entorno.base).post('/api/auth/registro', REGISTRO);
  });
  after(() => entorno.cerrar());

  test('inicia sesion con credenciales correctas', async () => {
    const cliente = crearCliente(entorno.base);
    const respuesta = await cliente.post('/api/auth/login', { email: 'ANA@correo.com', password: REGISTRO.password });

    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cuerpo.usuario.email, 'ana@correo.com');
    assert.ok(cliente.cookie());
  });

  test('responde igual con correo inexistente y con contraseña incorrecta', async () => {
    const cliente = crearCliente(entorno.base);
    const mal = await cliente.post('/api/auth/login', { email: 'ana@correo.com', password: 'Incorrecta1' });
    const inexistente = await cliente.post('/api/auth/login', { email: 'nadie@correo.com', password: 'Incorrecta1' });

    assert.equal(mal.estado, 401);
    assert.equal(inexistente.estado, 401);
    assert.deepEqual(mal.cuerpo, inexistente.cuerpo);
  });

  test('exige correo y contraseña', async () => {
    const respuesta = await crearCliente(entorno.base).post('/api/auth/login', {});

    assert.equal(respuesta.estado, 400);
  });

  test('GET /api/auth/yo requiere sesion', async () => {
    const respuesta = await crearCliente(entorno.base).get('/api/auth/yo');

    assert.equal(respuesta.estado, 401);
    assert.equal(respuesta.cuerpo.codigo, 'NO_AUTENTICADO');
  });

  test('GET /api/auth/yo devuelve la cuenta con sesion', async () => {
    const cliente = crearCliente(entorno.base);
    await cliente.post('/api/auth/login', { email: 'ana@correo.com', password: REGISTRO.password });
    const respuesta = await cliente.get('/api/auth/yo');

    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cuerpo.usuario.nombre, 'Ana Pérez');
  });

  test('logout cierra la sesion', async () => {
    const cliente = crearCliente(entorno.base);
    await cliente.post('/api/auth/login', { email: 'ana@correo.com', password: REGISTRO.password });
    const salida = await cliente.post('/api/auth/logout');

    assert.equal(salida.estado, 204);
    assert.equal(cliente.cookie(), '');
    assert.equal((await cliente.get('/api/auth/yo')).estado, 401);
  });

  test('rechaza una cookie firmada con otro secreto', async () => {
    const cliente = crearCliente(entorno.base);
    const falso = jwt.sign({ sub: '1' }, 'otro-secreto-distinto-de-32-caracteres!!', { algorithm: 'HS256' });
    cliente.fijarCookie(`sesion=${falso}`);

    assert.equal((await cliente.get('/api/auth/yo')).estado, 401);
  });

  test('rechaza un token sin firma (alg none) y uno vencido', async () => {
    const cliente = crearCliente(entorno.base);
    const sinFirma = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"1"}').toString('base64url')}.`;
    cliente.fijarCookie(`sesion=${sinFirma}`);
    assert.equal((await cliente.get('/api/auth/yo')).estado, 401);

    const vencido = jwt.sign({ sub: '1', exp: Math.floor(Date.now() / 1000) - 60 }, SECRETO, { algorithm: 'HS256' });
    cliente.fijarCookie(`sesion=${vencido}`);
    assert.equal((await cliente.get('/api/auth/yo')).estado, 401);
  });

  test('una cuenta eliminada pierde la sesion aunque la cookie siga vigente', async () => {
    const cliente = crearCliente(entorno.base);
    const registro = await cliente.post('/api/auth/registro', { ...REGISTRO, email: 'temporal@correo.com' });
    assert.equal((await cliente.get('/api/auth/yo')).estado, 200);

    await entorno.repositorio.eliminar(registro.cuerpo.usuario.id);
    assert.equal((await cliente.get('/api/auth/yo')).estado, 401);
  });

  test('bloquea el correo tras demasiados intentos fallidos', async () => {
    const cliente = crearCliente(entorno.base);
    for (let i = 0; i < 3; i += 1) {
      await cliente.post('/api/auth/login', { email: 'bloqueo@correo.com', password: 'Incorrecta1' });
    }
    const respuesta = await cliente.post('/api/auth/login', { email: 'bloqueo@correo.com', password: 'Incorrecta1' });

    assert.equal(respuesta.estado, 429);
    assert.equal(respuesta.cuerpo.codigo, 'DEMASIADOS_INTENTOS');
  });

  test('un inicio de sesion correcto reinicia el contador', async () => {
    const cliente = crearCliente(entorno.base);
    await cliente.post('/api/auth/login', { email: 'ana@correo.com', password: 'Incorrecta1' });
    await cliente.post('/api/auth/login', { email: 'ana@correo.com', password: 'Incorrecta1' });
    await cliente.post('/api/auth/login', { email: 'ana@correo.com', password: REGISTRO.password });
    await cliente.post('/api/auth/login', { email: 'ana@correo.com', password: 'Incorrecta1' });
    const respuesta = await cliente.post('/api/auth/login', { email: 'ana@correo.com', password: REGISTRO.password });

    assert.equal(respuesta.estado, 200);
  });
});

describe('perfil propio', () => {
  let entorno;
  before(async () => {
    entorno = await iniciarApp();
  });
  after(() => entorno.cerrar());

  test('cambia el nombre', async () => {
    const cliente = crearCliente(entorno.base);
    await cliente.post('/api/auth/registro', REGISTRO);
    const respuesta = await cliente.patch('/api/auth/yo', { nombre: '  Ana María ' });

    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cuerpo.usuario.nombre, 'Ana María');
  });

  test('cambiar la contraseña exige la actual correcta', async () => {
    const cliente = crearCliente(entorno.base);
    await cliente.post('/api/auth/login', { email: REGISTRO.email, password: REGISTRO.password });

    const mal = await cliente.patch('/api/auth/yo', { passwordActual: 'Equivocada1', passwordNueva: 'Nueva123456' });
    assert.equal(mal.estado, 400);
    assert.ok(mal.cuerpo.campos.passwordActual);

    const sinActual = await cliente.patch('/api/auth/yo', { passwordNueva: 'Nueva123456' });
    assert.equal(sinActual.estado, 400);

    const bien = await cliente.patch('/api/auth/yo', { passwordActual: REGISTRO.password, passwordNueva: 'Nueva123456' });
    assert.equal(bien.estado, 200);

    const nuevoLogin = await crearCliente(entorno.base).post('/api/auth/login', { email: REGISTRO.email, password: 'Nueva123456' });
    const viejoLogin = await crearCliente(entorno.base).post('/api/auth/login', { email: REGISTRO.email, password: REGISTRO.password });
    assert.equal(nuevoLogin.estado, 200);
    assert.equal(viejoLogin.estado, 401);
  });

  test('no permite cambiar el rol desde el perfil', async () => {
    const cliente = crearCliente(entorno.base);
    await cliente.post('/api/auth/login', { email: REGISTRO.email, password: 'Nueva123456' });
    const respuesta = await cliente.patch('/api/auth/yo', { rol: 'administrador' });

    assert.equal(respuesta.estado, 400);
    assert.equal((await cliente.get('/api/auth/yo')).cuerpo.usuario.rol, 'usuario');
  });
});

describe('proteccion general', () => {
  let entorno;
  before(async () => {
    entorno = await iniciarApp();
  });
  after(() => entorno.cerrar());

  test('rechaza peticiones que cambian datos desde otro origen', async () => {
    const cliente = crearCliente(entorno.base);
    const respuesta = await cliente.post('/api/auth/registro', REGISTRO, { Origin: 'https://sitio-malicioso.com' });

    assert.equal(respuesta.estado, 403);
    assert.equal(respuesta.cuerpo.codigo, 'ORIGEN_NO_PERMITIDO');
  });

  test('acepta peticiones del mismo origen', async () => {
    const cliente = crearCliente(entorno.base);
    const respuesta = await cliente.post('/api/auth/registro', REGISTRO, { Origin: entorno.base });

    assert.equal(respuesta.estado, 201);
  });

  test('responde 400 ante un JSON mal formado', async () => {
    const cliente = crearCliente(entorno.base);
    const respuesta = await cliente.post('/api/auth/login', '{"email": ');

    assert.equal(respuesta.estado, 400);
    assert.equal(respuesta.cuerpo.codigo, 'JSON_INVALIDO');
  });

  test('responde 413 ante un cuerpo demasiado grande', async () => {
    const cliente = crearCliente(entorno.base);
    const respuesta = await cliente.post('/api/auth/login', { email: 'a@b.co', password: 'x'.repeat(20000) });

    assert.equal(respuesta.estado, 413);
  });

  test('las rutas inexistentes responden 404 en JSON', async () => {
    const respuesta = await crearCliente(entorno.base).get('/api/no-existe');

    assert.equal(respuesta.estado, 404);
    assert.equal(respuesta.cuerpo.codigo, 'NO_ENCONTRADO');
  });

  test('las respuestas de la API no se guardan en cache ni exponen Express', async () => {
    const respuesta = await crearCliente(entorno.base).get('/api/health');

    assert.equal(respuesta.cabeceras.get('cache-control'), 'no-store');
    assert.equal(respuesta.cabeceras.get('x-powered-by'), null);
  });

  test('un error inesperado responde 500 sin revelar detalles', async () => {
    const roto = await iniciarApp();
    roto.repositorio.buscarPorEmail = async () => {
      throw new Error('detalle interno secreto');
    };
    const respuesta = await crearCliente(roto.base).post('/api/auth/login', { email: 'a@b.co', password: 'Clave12345' });
    await roto.cerrar();

    assert.equal(respuesta.estado, 500);
    assert.doesNotMatch(JSON.stringify(respuesta.cuerpo), /secreto/);
  });
});

describe('salud', () => {
  test('responde ok y degradado segun la base de datos', async () => {
    const sana = await iniciarApp({ comprobarSalud: async () => true });
    const enferma = await iniciarApp({
      comprobarSalud: async () => {
        throw new Error('sin conexion');
      }
    });

    const a = await crearCliente(sana.base).get('/api/health');
    const b = await crearCliente(enferma.base).get('/api/health');
    await sana.cerrar();
    await enferma.cerrar();

    assert.equal(a.estado, 200);
    assert.deepEqual(a.cuerpo, { estado: 'ok' });
    assert.equal(b.estado, 503);
    assert.deepEqual(b.cuerpo, { estado: 'degradado' });
  });

  test('en produccion la cookie lleva el atributo Secure', async () => {
    const produccion = await iniciarApp({ env: { NODE_ENV: 'production' } });
    const respuesta = await crearCliente(produccion.base).post('/api/auth/registro', REGISTRO);
    await produccion.cerrar();

    assert.match(respuesta.setCookie.find((c) => c.startsWith('sesion=')), /Secure/i);
  });
});
