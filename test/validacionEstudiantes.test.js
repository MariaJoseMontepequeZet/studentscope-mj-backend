import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fechaMaximaPermitida,
  validarCambiosEstudiante,
  validarEstudianteNuevo,
  validarFiltros
} from '../src/validacionEstudiantes.js';

const CONTEXTO = { fechaMaxima: '2026-11-14' };

const VALIDO = {
  nombre: '  Ana  ',
  apellido: ' Lopez ',
  email: '  ANA@Correo.com ',
  ciudad: ' Bogotá ',
  cursoId: 3,
  plan: 'Premium',
  progreso: 40,
  fechaInscripcion: '2026-11-13',
  activo: false
};

function camposDelError(funcion) {
  try {
    funcion();
  } catch (error) {
    return error.campos;
  }
  assert.fail('se esperaba un error de validacion');
}

describe('estudiante nuevo', () => {
  test('normaliza los textos y conserva los valores correctos', () => {
    assert.deepEqual(validarEstudianteNuevo(VALIDO, CONTEXTO), {
      nombre: 'Ana',
      apellido: 'Lopez',
      email: 'ana@correo.com',
      ciudad: 'Bogotá',
      cursoId: 3,
      plan: 'Premium',
      progreso: 40,
      fechaInscripcion: '2026-11-13',
      activo: false
    });
  });

  test('activo es verdadero por defecto', () => {
    const { activo, ...sinActivo } = VALIDO;

    assert.equal(validarEstudianteNuevo(sinActivo, CONTEXTO).activo, true);
  });

  test('ignora los campos que no se pueden elegir', () => {
    const resultado = validarEstudianteNuevo({ ...VALIDO, id: 99, montoUSD: 1, rol: 'administrador' }, CONTEXTO);

    assert.deepEqual(Object.keys(resultado).sort(), [
      'activo', 'apellido', 'ciudad', 'cursoId', 'email', 'fechaInscripcion', 'nombre', 'plan', 'progreso'
    ]);
  });

  test('informa todos los campos que faltan a la vez', () => {
    const campos = camposDelError(() => validarEstudianteNuevo({}, CONTEXTO));

    assert.deepEqual(Object.keys(campos).sort(), [
      'apellido', 'ciudad', 'cursoId', 'email', 'fechaInscripcion', 'nombre', 'plan', 'progreso'
    ]);
  });

  test('rechaza textos vacios o demasiado largos', () => {
    assert.ok(camposDelError(() => validarEstudianteNuevo({ ...VALIDO, nombre: '   ' }, CONTEXTO)).nombre);
    assert.ok(camposDelError(() => validarEstudianteNuevo({ ...VALIDO, apellido: 'x'.repeat(101) }, CONTEXTO)).apellido);
    assert.ok(camposDelError(() => validarEstudianteNuevo({ ...VALIDO, ciudad: 'x'.repeat(61) }, CONTEXTO)).ciudad);
    assert.ok(camposDelError(() => validarEstudianteNuevo({ ...VALIDO, nombre: 123 }, CONTEXTO)).nombre);
  });

  test('rechaza un correo con formato incorrecto', () => {
    assert.ok(camposDelError(() => validarEstudianteNuevo({ ...VALIDO, email: 'sin-arroba' }, CONTEXTO)).email);
  });

  test('el progreso debe ser un entero de 0 a 100', () => {
    [101, -1, 50.5, '50', null, NaN].forEach((progreso) => {
      assert.ok(camposDelError(() => validarEstudianteNuevo({ ...VALIDO, progreso }, CONTEXTO)).progreso, String(progreso));
    });
    [0, 100].forEach((progreso) => {
      assert.equal(validarEstudianteNuevo({ ...VALIDO, progreso }, CONTEXTO).progreso, progreso);
    });
  });

  test('el plan debe ser uno de los tres oficiales', () => {
    assert.ok(camposDelError(() => validarEstudianteNuevo({ ...VALIDO, plan: 'Platino' }, CONTEXTO)).plan);
    assert.ok(camposDelError(() => validarEstudianteNuevo({ ...VALIDO, plan: 'premium' }, CONTEXTO)).plan);
  });

  test('el curso debe ser un entero positivo', () => {
    ['abc', 0, -2, 1.5, null].forEach((cursoId) => {
      assert.ok(camposDelError(() => validarEstudianteNuevo({ ...VALIDO, cursoId }, CONTEXTO)).cursoId, String(cursoId));
    });
    assert.equal(validarEstudianteNuevo({ ...VALIDO, cursoId: '7' }, CONTEXTO).cursoId, 7);
  });

  test('la fecha debe existir, estar desde 2023-01-01 y no pasar de hoy', () => {
    ['2026-11-15', '2022-12-31', '2023-02-30', '15/06/2024', '2024-6-1', 20240101, null].forEach((fecha) => {
      assert.ok(
        camposDelError(() => validarEstudianteNuevo({ ...VALIDO, fechaInscripcion: fecha }, CONTEXTO)).fechaInscripcion,
        String(fecha)
      );
    });
    ['2023-01-01', '2024-02-29', '2026-11-14'].forEach((fecha) => {
      assert.equal(validarEstudianteNuevo({ ...VALIDO, fechaInscripcion: fecha }, CONTEXTO).fechaInscripcion, fecha);
    });
  });

  test('activo debe ser un booleano estricto', () => {
    ['true', 1, 0, null].forEach((activo) => {
      assert.ok(camposDelError(() => validarEstudianteNuevo({ ...VALIDO, activo }, CONTEXTO)).activo, String(activo));
    });
  });
});

describe('cambios de un estudiante', () => {
  test('acepta solo los campos enviados', () => {
    assert.deepEqual(validarCambiosEstudiante({ progreso: 80, nombre: ' Luis ' }, CONTEXTO), {
      nombre: 'Luis',
      progreso: 80
    });
  });

  test('rechaza un cuerpo sin cambios o con campos que no se editan', () => {
    assert.ok(camposDelError(() => validarCambiosEstudiante({}, CONTEXTO)).general);
    assert.ok(camposDelError(() => validarCambiosEstudiante({ id: 5, montoUSD: 3 }, CONTEXTO)).general);
  });

  test('valida cada campo enviado', () => {
    const campos = camposDelError(() =>
      validarCambiosEstudiante({ progreso: 200, plan: 'X', fechaInscripcion: '2099-01-01' }, CONTEXTO)
    );

    assert.deepEqual(Object.keys(campos).sort(), ['fechaInscripcion', 'plan', 'progreso']);
  });

  test('permite poner progreso en 0 y activo en false (valores falsos pero validos)', () => {
    assert.deepEqual(validarCambiosEstudiante({ progreso: 0, activo: false }, CONTEXTO), {
      progreso: 0,
      activo: false
    });
  });
});

describe('filtros del listado', () => {
  test('usa 12 por pagina y la pagina 1 por defecto', () => {
    assert.deepEqual(validarFiltros({}), { pagina: 1, limite: 12 });
  });

  test('convierte y normaliza los filtros', () => {
    assert.deepEqual(
      validarFiltros({ buscar: ' ana ', ciudad: 'Cali', plan: 'Premium', curso: '4', estado: 'inactivo', pagina: '2', limite: '5' }),
      { buscar: 'ana', ciudad: 'Cali', plan: 'Premium', cursoId: 4, activo: false, pagina: 2, limite: 5 }
    );
    assert.equal(validarFiltros({ estado: 'activo' }).activo, true);
  });

  test('ignora los filtros vacios', () => {
    assert.deepEqual(validarFiltros({ buscar: '', ciudad: '', plan: '', curso: '', estado: '' }), {
      pagina: 1,
      limite: 12
    });
  });

  test('rechaza valores invalidos', () => {
    const campos = camposDelError(() =>
      validarFiltros({ plan: 'X', curso: 'abc', estado: 'otro', pagina: '0', limite: '101' })
    );

    assert.deepEqual(Object.keys(campos).sort(), ['curso', 'estado', 'limite', 'pagina', 'plan']);
    assert.ok(camposDelError(() => validarFiltros({ limite: '-5' })).limite);
    assert.ok(camposDelError(() => validarFiltros({ pagina: '1.5' })).pagina);
  });

  test('rechaza parametros repetidos (que llegan como arreglo)', () => {
    assert.ok(camposDelError(() => validarFiltros({ buscar: ['a', 'b'] })).buscar);
    assert.ok(camposDelError(() => validarFiltros({ ciudad: { x: 1 } })).ciudad);
  });
});

describe('fecha maxima permitida', () => {
  test('es el dia siguiente en UTC, para tolerar husos horarios por delante', () => {
    assert.equal(fechaMaximaPermitida(new Date('2026-11-14T03:00:00Z')), '2026-11-15');
    assert.equal(fechaMaximaPermitida(new Date('2026-12-31T23:59:59Z')), '2027-01-01');
    assert.equal(fechaMaximaPermitida(new Date('2024-02-28T10:00:00Z')), '2024-02-29');
  });
});
