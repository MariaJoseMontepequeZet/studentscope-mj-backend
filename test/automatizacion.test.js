import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cargar = (nombre) =>
  JSON.parse(readFileSync(new URL(`../docs/automatizacion/n8n/${nombre}.json`, import.meta.url), 'utf8'));

const flujos = {
  'reporte-semanal': cargar('reporte-semanal'),
  'aviso-inactivos': cargar('aviso-inactivos')
};

function ejecutarCodigo(flujo, nodo, nodosAnteriores) {
  const codigo = flujo.nodes.find((n) => n.name === nodo).parameters.jsCode;
  const $ = (nombre) => ({ first: () => ({ json: nodosAnteriores[nombre] }) });
  return new Function('$', codigo)($)[0].json;
}

describe('plantillas de n8n', () => {
  for (const [nombre, flujo] of Object.entries(flujos)) {
    test(`${nombre}: las conexiones apuntan a nodos que existen`, () => {
      const nombres = new Set(flujo.nodes.map((n) => n.name));

      for (const [origen, salidas] of Object.entries(flujo.connections)) {
        assert.ok(nombres.has(origen), `origen ${origen}`);
        for (const destino of salidas.main.flat()) assert.ok(nombres.has(destino.node), `destino ${destino.node}`);
      }
    });

    test(`${nombre}: no trae contraseñas ni credenciales guardadas`, () => {
      const texto = JSON.stringify(flujo);

      assert.equal(/"credentials"/.test(texto), false);
      assert.ok(texto.includes('$env.STUDENTSCOPE_PASSWORD'));
      assert.equal(/password"\s*:\s*"[^"{=]/i.test(texto), false);
    });

    test(`${nombre}: arranca desactivado`, () => {
      assert.equal(flujo.active, false);
    });
  }

  test('reporte-semanal: el correo trae los números del reporte', () => {
    const mensaje = ejecutarCodigo(flujos['reporte-semanal'], 'Armar mensaje', {
      Reportes: {
        total: 35,
        activos: 27,
        completaron: 5,
        progresoPromedio: 65,
        retencionPorcentaje: 77,
        ingresosUSD: 2259.65,
        porPlan: [{ plan: 'Básico', total: 12 }, { plan: 'Premium', total: 13 }],
        rangosProgreso: [{ rango: '0-24%', total: 2 }]
      }
    });

    assert.match(mensaje.asunto, /^StudentScope MJ: reporte semanal del \d{2}\/\d{2}\/\d{4}$/);
    for (const esperado of ['35 (27 activos, 8 inactivos)', 'Progreso promedio: 65%', 'Completaron el curso: 5', 'Retención: 77%', 'US$ 2259.65', 'Básico: 12', '0-24%: 2']) {
      assert.ok(mensaje.texto.includes(esperado), esperado);
    }
  });

  test('aviso-inactivos: avisa solo de quienes no terminaron, de menos a más progreso', () => {
    const estudiante = (nombre, progreso) => ({
      nombre,
      apellido: 'Prueba',
      email: `${nombre.toLowerCase()}@correo.com`,
      curso: { nombre: 'Desarrollo Web' },
      progreso
    });
    const aviso = ejecutarCodigo(flujos['aviso-inactivos'], 'Armar aviso', {
      Inactivos: { total: 3, estudiantes: [estudiante('Ana', 45), estudiante('Beto', 100), estudiante('Carla', 25)] }
    });

    assert.equal(aviso.cantidad, 2);
    assert.match(aviso.asunto, /2 estudiantes inactivos/);
    assert.ok(aviso.texto.indexOf('Carla') < aviso.texto.indexOf('Ana'));
    assert.equal(aviso.texto.includes('Beto'), false);
  });

  test('aviso-inactivos: sin inactivos sin terminar la cantidad es cero', () => {
    const aviso = ejecutarCodigo(flujos['aviso-inactivos'], 'Armar aviso', {
      Inactivos: { total: 1, estudiantes: [{ nombre: 'Beto', apellido: 'X', email: 'b@c.com', curso: { nombre: 'Y' }, progreso: 100 }] }
    });

    assert.equal(aviso.cantidad, 0);
  });

  test('aviso-inactivos: avisa cuando la lista está recortada', () => {
    const lista = Array.from({ length: 2 }, (_, i) => ({ nombre: `E${i}`, apellido: 'X', email: `e${i}@c.com`, curso: { nombre: 'Y' }, progreso: 10 }));
    const aviso = ejecutarCodigo(flujos['aviso-inactivos'], 'Armar aviso', { Inactivos: { total: 250, estudiantes: lista } });

    assert.match(aviso.texto, /Hay más inactivos/);
  });
});
