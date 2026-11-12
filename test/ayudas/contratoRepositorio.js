import assert from 'node:assert/strict';
import { test } from 'node:test';

function datos(sufijo, rol = 'usuario') {
  return {
    nombre: `Persona ${sufijo}`,
    email: `persona${sufijo.toLowerCase()}@correo.com`,
    passwordHash: 'hash',
    rol
  };
}

async function rechaza(promesa, codigo) {
  await assert.rejects(promesa, (error) => error.codigo === codigo);
}

export function probarContratoRepositorio(nombre, crearRepositorio) {
  async function nuevo() {
    return crearRepositorio();
  }

  test(`${nombre}: crea y busca por id y por correo sin distinguir mayusculas`, async () => {
    const repo = await nuevo();
    const creado = await repo.crear(datos('A'));

    assert.equal(typeof creado.id, 'number');
    assert.equal((await repo.buscarPorId(creado.id)).email, 'personaa@correo.com');
    assert.equal((await repo.buscarPorEmail('PERSONAA@correo.com')).id, creado.id);
    assert.equal(await repo.buscarPorId(999999), null);
    assert.equal(await repo.buscarPorEmail('nadie@correo.com'), null);
  });

  test(`${nombre}: rechaza un correo duplicado`, async () => {
    const repo = await nuevo();
    await repo.crear(datos('B'));

    await rechaza(repo.crear({ ...datos('B'), email: 'PERSONAB@correo.com' }), 'EMAIL_DUPLICADO');
  });

  test(`${nombre}: lista por orden de creacion`, async () => {
    const repo = await nuevo();
    await repo.crear(datos('C1'));
    await repo.crear(datos('C2'));

    const lista = await repo.listar();
    assert.deepEqual(lista.map((u) => u.email), ['personac1@correo.com', 'personac2@correo.com']);
  });

  test(`${nombre}: actualiza datos y devuelve null si no existe`, async () => {
    const repo = await nuevo();
    const creado = await repo.crear(datos('D'));

    const actualizado = await repo.actualizar(creado.id, { nombre: 'Nuevo nombre', rol: 'administrador' });
    assert.equal(actualizado.nombre, 'Nuevo nombre');
    assert.equal(actualizado.rol, 'administrador');
    assert.equal(await repo.actualizar(999999, { nombre: 'x' }), null);
  });

  test(`${nombre}: no permite repetir un correo al actualizar`, async () => {
    const repo = await nuevo();
    await repo.crear(datos('E1'));
    const segundo = await repo.crear(datos('E2'));

    await rechaza(repo.actualizar(segundo.id, { email: 'personae1@correo.com' }), 'EMAIL_DUPLICADO');
  });

  test(`${nombre}: no deja sin administradores al quitar el rol`, async () => {
    const repo = await nuevo();
    const unico = await repo.crear(datos('F1', 'administrador'));

    await rechaza(repo.actualizar(unico.id, { rol: 'usuario' }), 'ULTIMO_ADMINISTRADOR');
    assert.equal((await repo.buscarPorId(unico.id)).rol, 'administrador');

    const otro = await repo.crear(datos('F2', 'administrador'));
    assert.equal((await repo.actualizar(otro.id, { rol: 'usuario' })).rol, 'usuario');
    assert.equal(await repo.contarAdministradores(), 1);
  });

  test(`${nombre}: no elimina al ultimo administrador`, async () => {
    const repo = await nuevo();
    const unico = await repo.crear(datos('G1', 'administrador'));
    const normal = await repo.crear(datos('G2'));

    await rechaza(repo.eliminar(unico.id), 'ULTIMO_ADMINISTRADOR');
    assert.equal(await repo.eliminar(normal.id), true);
    assert.equal(await repo.eliminar(normal.id), false);
  });

  test(`${nombre}: dos administradores no pueden quitarse el rol a la vez`, async () => {
    const repo = await nuevo();
    const a = await repo.crear(datos('H1', 'administrador'));
    const b = await repo.crear(datos('H2', 'administrador'));

    const resultados = await Promise.allSettled([
      repo.actualizar(a.id, { rol: 'usuario' }),
      repo.actualizar(b.id, { rol: 'usuario' })
    ]);

    assert.equal(resultados.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await repo.contarAdministradores(), 1);
  });
}
