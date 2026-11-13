import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { completarEnv, generarClave, generarSecreto } from '../scripts/preparar-env.mjs';
import { errorPassword } from '../src/validacion.js';

const FIJOS = { secreto: () => 'secreto-fijo', clave: () => 'ClaveFija12345' };

function valor(texto, nombre) {
  const linea = texto.split(/\r?\n/).find((l) => l.startsWith(`${nombre}=`));
  return linea === undefined ? undefined : linea.slice(nombre.length + 1);
}

describe('completar el archivo .env', () => {
  test('rellena lo que falta en un archivo con el ejemplo antiguo', () => {
    const antiguo = [
      'PORT=3100',
      'NODE_ENV=development',
      'DATABASE_URL=postgres://usuario:clave@localhost:5432/studentscope_mj',
      'JWT_SECRET=',
      'ADMIN_EMAIL=yo@correo.com',
      'ADMIN_PASSWORD=',
      ''
    ].join('\r\n');

    const { texto, cambios } = completarEnv(antiguo, FIJOS);

    assert.equal(valor(texto, 'DATABASE_URL'), undefined);
    assert.equal(valor(texto, 'DB_PORT'), '5433');
    assert.equal(valor(texto, 'DB_NAME'), 'studentscope_mj');
    assert.equal(valor(texto, 'DB_USER'), 'postgres');
    assert.equal(valor(texto, 'DB_PASSWORD'), '');
    assert.equal(valor(texto, 'JWT_SECRET'), 'secreto-fijo');
    assert.equal(valor(texto, 'ADMIN_PASSWORD'), 'ClaveFija12345');
    assert.ok(cambios.includes('JWT_SECRET'));
    assert.ok(cambios.includes('ADMIN_PASSWORD'));
  });

  test('conserva el correo y cualquier valor que el usuario ya puso', () => {
    const original = 'ADMIN_EMAIL=yo@correo.com\nDB_USER=studentscope\nDB_PASSWORD=mia\nJWT_SECRET=ya-tengo-uno\nADMIN_PASSWORD=MiClave123\n';
    const { texto, faltaCorreo } = completarEnv(original, FIJOS);

    assert.equal(valor(texto, 'ADMIN_EMAIL'), 'yo@correo.com');
    assert.equal(valor(texto, 'DB_USER'), 'studentscope');
    assert.equal(valor(texto, 'DB_PASSWORD'), 'mia');
    assert.equal(valor(texto, 'JWT_SECRET'), 'ya-tengo-uno');
    assert.equal(valor(texto, 'ADMIN_PASSWORD'), 'MiClave123');
    assert.equal(faltaCorreo, false);
  });

  test('es idempotente: una segunda ejecucion no cambia nada', () => {
    const primera = completarEnv('ADMIN_EMAIL=yo@correo.com\n', FIJOS);
    const segunda = completarEnv(primera.texto, { secreto: () => 'otro', clave: () => 'OtraClave99999' });

    assert.equal(segunda.texto, primera.texto);
    assert.deepEqual(segunda.cambios, []);
  });

  test('respeta una DATABASE_URL real y no agrega DB_*', () => {
    const { texto } = completarEnv('DATABASE_URL=postgres://yo:abc@servidor:5432/mia\nADMIN_EMAIL=a@b.co\n', FIJOS);

    assert.equal(valor(texto, 'DATABASE_URL'), 'postgres://yo:abc@servidor:5432/mia');
    assert.equal(valor(texto, 'DB_HOST'), undefined);
  });

  test('mantiene los saltos de linea del archivo original', () => {
    const conWindows = completarEnv('ADMIN_EMAIL=a@b.co\r\n', FIJOS).texto;
    const conUnix = completarEnv('ADMIN_EMAIL=a@b.co\n', FIJOS).texto;

    assert.ok(conWindows.includes('\r\n') && !/[^\r]\n/.test(conWindows));
    assert.ok(!conUnix.includes('\r'));
  });

  test('avisa cuando falta el correo del administrador', () => {
    assert.equal(completarEnv('', FIJOS).faltaCorreo, true);
    assert.equal(completarEnv('ADMIN_EMAIL=\n', FIJOS).faltaCorreo, true);
  });

  test('un archivo vacio queda completo y utilizable', () => {
    const { texto } = completarEnv('');

    assert.ok(valor(texto, 'JWT_SECRET').length >= 32);
    assert.equal(errorPassword(valor(texto, 'ADMIN_PASSWORD')), null);
  });
});

describe('valores generados', () => {
  test('el secreto tiene suficiente longitud y no se repite', () => {
    assert.ok(generarSecreto().length >= 32);
    assert.notEqual(generarSecreto(), generarSecreto());
  });

  test('la clave cumple la politica de contraseñas de la API', () => {
    for (let i = 0; i < 50; i += 1) assert.equal(errorPassword(generarClave()), null);
  });
});
