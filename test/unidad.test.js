import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { leerConfig } from '../src/config.js';
import { crearLimiteIntentos } from '../src/middleware/limiteIntentos.js';
import { hashearPassword, verificarPassword } from '../src/seguridad/password.js';
import { firmarToken, leerToken } from '../src/seguridad/token.js';
import { errorEmail, errorNombre, errorPassword, normalizarEmail } from '../src/validacion.js';
import { SECRETO } from './ayudas/entorno.js';

describe('configuracion', () => {
  const base = { JWT_SECRET: SECRETO, DB_HOST: 'db', DB_NAME: 'n', DB_USER: 'u', DB_PASSWORD: 'p' };

  test('lee los valores y aplica los predeterminados', () => {
    const config = leerConfig(base);

    assert.equal(config.puerto, 3100);
    assert.equal(config.produccion, false);
    assert.equal(config.sesionHoras, 8);
    assert.equal(config.costeBcrypt, 12);
    assert.deepEqual(config.basedatos, { host: 'db', port: 5432, database: 'n', user: 'u', password: 'p' });
  });

  test('prefiere DATABASE_URL y normaliza el correo del administrador', () => {
    const config = leerConfig({ ...base, DATABASE_URL: 'postgres://a@b/c', ADMIN_EMAIL: '  Jefa@Correo.com ', NODE_ENV: 'production' });

    assert.deepEqual(config.basedatos, { connectionString: 'postgres://a@b/c' });
    assert.equal(config.adminEmail, 'jefa@correo.com');
    assert.equal(config.produccion, true);
  });

  test('exige un secreto JWT de al menos 32 caracteres', () => {
    assert.throws(() => leerConfig({ ...base, JWT_SECRET: 'corto' }), /JWT_SECRET/);
    assert.throws(() => leerConfig({ ...base, JWT_SECRET: undefined }), /JWT_SECRET/);
  });

  test('exige datos de la base de datos', () => {
    assert.throws(() => leerConfig({ JWT_SECRET: SECRETO }), /DATABASE_URL o DB_HOST/);
  });

  test('ignora numeros invalidos', () => {
    assert.equal(leerConfig({ ...base, PORT: 'abc' }).puerto, 3100);
    assert.equal(leerConfig({ ...base, PORT: '' }).puerto, 3100);
    assert.equal(leerConfig({ ...base, PORT: '4000' }).puerto, 4000);
  });
});

describe('validacion de campos', () => {
  test('nombre', () => {
    assert.equal(errorNombre('Ana'), null);
    assert.ok(errorNombre(''));
    assert.ok(errorNombre('   '));
    assert.ok(errorNombre(undefined));
    assert.ok(errorNombre('x'.repeat(101)));
    assert.equal(errorNombre('x'.repeat(100)), null);
  });

  test('correo', () => {
    assert.equal(errorEmail('ana@correo.com'), null);
    assert.equal(errorEmail('  ANA@Correo.com '), null);
    assert.ok(errorEmail('ana@correo'));
    assert.ok(errorEmail('ana correo@x.com'));
    assert.ok(errorEmail(''));
    assert.ok(errorEmail(null));
  });

  test('contraseña', () => {
    assert.equal(errorPassword('Clave1234'), null);
    assert.ok(errorPassword('Cl1'));
    assert.ok(errorPassword('sinnumeros'));
    assert.ok(errorPassword('12345678'));
    assert.ok(errorPassword(12345678));
    assert.equal(errorPassword(`a1${'x'.repeat(70)}`), null);
    assert.ok(errorPassword(`a1${'x'.repeat(71)}`));
  });

  test('normalizarEmail devuelve vacio si no es texto', () => {
    assert.equal(normalizarEmail('  A@B.co '), 'a@b.co');
    assert.equal(normalizarEmail(undefined), '');
  });
});

describe('contraseñas con hash', () => {
  test('verifica la correcta y rechaza la incorrecta', async () => {
    const hash = await hashearPassword('Clave12345', 4);

    assert.equal(await verificarPassword('Clave12345', hash), true);
    assert.equal(await verificarPassword('Otra12345', hash), false);
  });

  test('el mismo texto genera hashes distintos', async () => {
    const a = await hashearPassword('Clave12345', 4);
    const b = await hashearPassword('Clave12345', 4);

    assert.notEqual(a, b);
  });

  test('sin hash guardado siempre falla', async () => {
    assert.equal(await verificarPassword('Clave12345', undefined), false);
  });
});

describe('token de sesion', () => {
  test('firma y lee el identificador', () => {
    assert.equal(leerToken(firmarToken(42, SECRETO, 1), SECRETO), 42);
  });

  test('rechaza otro secreto, basura y un sub que no es numero', () => {
    const token = firmarToken(42, SECRETO, 1);

    assert.equal(leerToken(token, 'otro-secreto-de-mas-de-32-caracteres!!!'), null);
    assert.equal(leerToken('basura', SECRETO), null);
    assert.equal(leerToken(jwt.sign({ sub: 'abc' }, SECRETO), SECRETO), null);
  });
});

describe('limite de intentos', () => {
  test('bloquea al llegar al maximo y libera al pasar la ventana', () => {
    let ahora = 1000;
    const limite = crearLimiteIntentos({ maximo: 2, ventanaMs: 100, ahora: () => ahora });

    limite.registrarFallo('a');
    assert.equal(limite.bloqueado('a'), false);
    limite.registrarFallo('a');
    assert.equal(limite.bloqueado('a'), true);
    assert.equal(limite.bloqueado('b'), false);

    ahora += 101;
    assert.equal(limite.bloqueado('a'), false);
  });

  test('limpiar reinicia el contador', () => {
    const limite = crearLimiteIntentos({ maximo: 1 });

    limite.registrarFallo('a');
    limite.limpiar('a');

    assert.equal(limite.bloqueado('a'), false);
  });
});
