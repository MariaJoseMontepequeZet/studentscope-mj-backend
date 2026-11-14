import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ejemplo = JSON.parse(
  readFileSync(new URL('../src/db/datos/estudiantes-ejemplo.json', import.meta.url), 'utf8')
);
const migracion = readFileSync(
  new URL('../src/db/migraciones/002_cursos_estudiantes.sql', import.meta.url),
  'utf8'
);

const PLANES = ['Básico', 'Estándar', 'Premium'];
const nombresDeCursos = [...migracion.matchAll(/^ {2}\('([^']+)', '[a-z]+', '/gm)].map((m) => m[1]);

function esFechaReal(texto) {
  const [anio, mes, dia] = texto.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

describe('datos de ejemplo', () => {
  test('hay 35 estudiantes y 30 cursos', () => {
    assert.equal(ejemplo.length, 35);
    assert.equal(nombresDeCursos.length, 30);
    assert.equal(new Set(nombresDeCursos).size, 30);
  });

  test('cada estudiante tiene todos los campos con el tipo correcto', () => {
    ejemplo.forEach((e) => {
      ['nombre', 'apellido', 'email', 'ciudad', 'curso', 'plan', 'fechaInscripcion'].forEach((campo) => {
        assert.equal(typeof e[campo], 'string', `${campo} de ${e.email}`);
        assert.notEqual(e[campo].trim(), '', `${campo} vacio en ${e.email}`);
      });
      assert.ok(Number.isInteger(e.progreso) && e.progreso >= 0 && e.progreso <= 100, e.email);
      assert.equal(typeof e.activo, 'boolean', e.email);
    });
  });

  test('los correos no se repiten, ni siquiera cambiando mayusculas', () => {
    const correos = ejemplo.map((e) => e.email.toLowerCase());
    assert.equal(new Set(correos).size, correos.length);
  });

  test('los planes, los cursos y las fechas son validos', () => {
    ejemplo.forEach((e) => {
      assert.ok(PLANES.includes(e.plan), `plan de ${e.email}`);
      assert.ok(nombresDeCursos.includes(e.curso), `curso "${e.curso}" de ${e.email}`);
      assert.match(e.fechaInscripcion, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(esFechaReal(e.fechaInscripcion), `fecha de ${e.email}`);
      assert.ok(e.fechaInscripcion >= '2023-01-01', `fecha de ${e.email}`);
    });
  });

  test('la migracion no guarda montos: el precio sale del plan', () => {
    assert.doesNotMatch(migracion, /monto/i);
    assert.match(migracion, /INSERT INTO planes/);
  });
});
