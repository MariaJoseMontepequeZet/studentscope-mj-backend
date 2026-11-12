import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { describirErrorInicio } from '../src/errorInicio.js';

describe('mensajes de error al iniciar', () => {
  test('explica una contrasena o usuario incorrectos', () => {
    const texto = describirErrorInicio(
      Object.assign(new Error('password authentication failed'), { code: '28P01' })
    );

    assert.match(texto, /password authentication failed/);
    assert.match(texto, /usuario y la contraseña/);
  });

  test('explica una base de datos inexistente', () => {
    const texto = describirErrorInicio(Object.assign(new Error('no existe'), { code: '3D000' }));

    assert.match(texto, /CREATE DATABASE/);
  });

  test('explica un PostgreSQL apagado, incluso con un AggregateError sin mensaje', () => {
    const error = Object.assign(new AggregateError([new Error('connect ECONNREFUSED 127.0.0.1:5432')]), {
      code: 'ECONNREFUSED'
    });
    const texto = describirErrorInicio(error);

    assert.match(texto, /ECONNREFUSED 127\.0\.0\.1:5432/);
    assert.match(texto, /en ejecución/);
  });

  test('deja el mensaje tal cual cuando no conoce el codigo', () => {
    assert.equal(describirErrorInicio(new Error('algo raro')), 'algo raro');
    assert.equal(describirErrorInicio(undefined), 'error desconocido');
  });

  test('nunca incluye contrasenas: solo el mensaje y la pista', () => {
    const texto = describirErrorInicio(Object.assign(new Error('falla'), { code: '28P01', password: 'secreta' }));

    assert.doesNotMatch(texto, /secreta/);
  });
});
