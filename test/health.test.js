import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/app.js';

async function conServidor(prueba) {
  const servidor = crearServidor();
  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  const { port } = servidor.address();

  try {
    await prueba(`http://127.0.0.1:${port}`);
  } finally {
    servidor.closeAllConnections();
    await new Promise((resolver) => servidor.close(resolver));
  }
}

test('GET /api/health responde 200 con estado ok', async () => {
  await conServidor(async (base) => {
    const respuesta = await fetch(`${base}/api/health`);

    assert.equal(respuesta.status, 200);
    assert.match(respuesta.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await respuesta.json(), { estado: 'ok' });
  });
});

test('GET /api/health ignora la cadena de consulta', async () => {
  await conServidor(async (base) => {
    const respuesta = await fetch(`${base}/api/health?x=1`);

    assert.equal(respuesta.status, 200);
  });
});

test('una ruta desconocida responde 404 en JSON', async () => {
  await conServidor(async (base) => {
    const respuesta = await fetch(`${base}/api/no-existe`);

    assert.equal(respuesta.status, 404);
    assert.deepEqual(await respuesta.json(), { error: 'No encontrado' });
  });
});

test('POST /api/health responde 404', async () => {
  await conServidor(async (base) => {
    const respuesta = await fetch(`${base}/api/health`, { method: 'POST' });

    assert.equal(respuesta.status, 404);
  });
});
