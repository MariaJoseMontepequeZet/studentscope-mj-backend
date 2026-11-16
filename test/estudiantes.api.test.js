import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearPool } from '../src/db/pool.js';
import { sembrarEstudiantesDeEjemplo } from '../src/db/sembrar.js';
import { crearRepositorioEstudiantesPg } from '../src/repositorios/estudiantesPg.js';
import { reiniciarEsquema } from './ayudas/baseDatos.js';
import { crearCliente, iniciarApp } from './ayudas/entorno.js';

const urlPruebas = process.env.TEST_DATABASE_URL;

if (!urlPruebas) {
  test('API de estudiantes: omitida porque falta TEST_DATABASE_URL', { skip: true }, () => {});
} else {
  const EJEMPLO = JSON.parse(
    readFileSync(new URL('../src/db/datos/estudiantes-ejemplo.json', import.meta.url), 'utf8')
  );
  const PRECIOS = { Básico: 29.99, Estándar: 59.99, Premium: 99.99 };
  const CLAVE = 'Clave12345';

  const pool = crearPool({ connectionString: urlPruebas });
  let entorno;
  let admin;
  let usuario;
  let cursos;

  const cuantos = (condicion) => EJEMPLO.filter(condicion).length;
  const idDelCurso = (nombre) => cursos.find((c) => c.nombre === nombre).id;

  async function reponerEjemplo() {
    await pool.query('TRUNCATE estudiantes RESTART IDENTITY');
    await sembrarEstudiantesDeEjemplo(pool);
  }

  async function iniciarSesion(correo, rol) {
    const cliente = crearCliente(entorno.base);
    const respuesta = await cliente.post('/api/auth/registro', { nombre: 'Persona', email: correo, password: CLAVE });
    if (rol === 'administrador') await entorno.repositorio.actualizar(respuesta.cuerpo.usuario.id, { rol });
    return cliente;
  }

  before(async () => {
    await reiniciarEsquema(pool);
    entorno = await iniciarApp({ repositorioEstudiantes: crearRepositorioEstudiantesPg(pool) });
    admin = await iniciarSesion('admin@correo.com', 'administrador');
    usuario = await iniciarSesion('usuario@correo.com', 'usuario');
    cursos = (await admin.get('/api/cursos')).cuerpo.cursos;
  });
  after(async () => {
    await entorno.cerrar();
    await pool.end();
  });

  describe('listado', () => {
    before(reponerEjemplo);

    test('devuelve la primera pagina de 12 con los totales', async () => {
      const { estado, cuerpo } = await admin.get('/api/estudiantes');

      assert.equal(estado, 200);
      assert.equal(cuerpo.total, 35);
      assert.equal(cuerpo.estudiantes.length, 12);
      assert.deepEqual([cuerpo.pagina, cuerpo.limite, cuerpo.paginas], [1, 12, 3]);
      assert.deepEqual(cuerpo.estudiantes.map((e) => e.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    });

    test('la ultima pagina trae los que sobran y una pagina de mas viene vacia', async () => {
      assert.equal((await admin.get('/api/estudiantes?pagina=3')).cuerpo.estudiantes.length, 11);
      const fuera = await admin.get('/api/estudiantes?pagina=9');
      assert.equal(fuera.estado, 200);
      assert.deepEqual(fuera.cuerpo.estudiantes, []);
      assert.equal(fuera.cuerpo.total, 35);
    });

    test('respeta el limite pedido', async () => {
      const { cuerpo } = await admin.get('/api/estudiantes?limite=5&pagina=2');

      assert.equal(cuerpo.estudiantes.length, 5);
      assert.equal(cuerpo.paginas, 7);
      assert.equal(cuerpo.estudiantes[0].id, 6);
    });

    test('cada estudiante trae su curso, su plan y el monto del plan', async () => {
      const { cuerpo } = await admin.get('/api/estudiantes/1');

      assert.deepEqual(cuerpo.estudiante, {
        id: 1,
        nombre: 'Juan',
        apellido: 'Pérez',
        email: 'pjuan5058@gmail.com',
        ciudad: 'Bogotá',
        curso: { id: idDelCurso('Desarrollo Web'), nombre: 'Desarrollo Web' },
        plan: 'Premium',
        montoUSD: 99.99,
        progreso: 75,
        fechaInscripcion: '2023-01-15',
        activo: true
      });
    });

    test('filtra por ciudad, plan y estado', async () => {
      assert.equal((await admin.get('/api/estudiantes?ciudad=Bogot%C3%A1')).cuerpo.total, cuantos((e) => e.ciudad === 'Bogotá'));
      assert.equal((await admin.get('/api/estudiantes?plan=Premium')).cuerpo.total, cuantos((e) => e.plan === 'Premium'));
      assert.equal((await admin.get('/api/estudiantes?estado=activo')).cuerpo.total, 27);
      assert.equal((await admin.get('/api/estudiantes?estado=inactivo')).cuerpo.total, 8);
    });

    test('filtra por curso', async () => {
      const id = idDelCurso('Desarrollo Web');
      const { cuerpo } = await admin.get(`/api/estudiantes?curso=${id}`);

      assert.equal(cuerpo.total, cuantos((e) => e.curso === 'Desarrollo Web'));
      assert.ok(cuerpo.estudiantes.every((e) => e.curso.id === id));
    });

    test('combina varios filtros', async () => {
      const esperado = cuantos((e) => e.ciudad === 'Bogotá' && e.plan === 'Básico' && e.activo);
      const { cuerpo } = await admin.get('/api/estudiantes?ciudad=Bogot%C3%A1&plan=B%C3%A1sico&estado=activo');

      assert.equal(cuerpo.total, esperado);
      assert.ok(cuerpo.estudiantes.every((e) => e.ciudad === 'Bogotá' && e.plan === 'Básico' && e.activo));
    });

    test('busca por nombre, apellido, nombre completo y correo sin distinguir mayusculas', async () => {
      assert.equal((await admin.get('/api/estudiantes?buscar=JUAN')).cuerpo.estudiantes[0].nombre, 'Juan');
      assert.ok((await admin.get('/api/estudiantes?buscar=g%C3%B3mez')).cuerpo.total >= 1);
      assert.equal((await admin.get('/api/estudiantes?buscar=Luis%20Garc%C3%ADa')).cuerpo.total, 1);
      assert.equal((await admin.get('/api/estudiantes?buscar=danielavargas14')).cuerpo.total, 1);
    });

    test('los comodines de LIKE se buscan como texto, no como patron', async () => {
      assert.equal((await admin.get('/api/estudiantes?buscar=%25')).cuerpo.total, 0);
      assert.equal((await admin.get('/api/estudiantes?buscar=_')).cuerpo.total, 0);
      assert.equal((await admin.get('/api/estudiantes?buscar=%5C')).cuerpo.total, 0);
    });

    test('una busqueda con comillas y SQL no rompe ni devuelve de mas', async () => {
      const { estado, cuerpo } = await admin.get("/api/estudiantes?buscar=' OR 1=1; DROP TABLE estudiantes; --");

      assert.equal(estado, 200);
      assert.equal(cuerpo.total, 0);
      assert.equal((await admin.get('/api/estudiantes')).cuerpo.total, 35);
    });

    test('un id inexistente responde 404', async () => {
      const respuesta = await admin.get('/api/estudiantes/99999');

      assert.equal(respuesta.estado, 404);
      assert.equal(respuesta.cuerpo.codigo, 'ESTUDIANTE_NO_ENCONTRADO');
    });
  });

  describe('crear, editar y eliminar', () => {
    beforeEach(reponerEjemplo);

    const NUEVO = () => ({
      nombre: 'Prueba',
      apellido: 'Nueva',
      email: 'nueva@correo.com',
      ciudad: 'Cali',
      cursoId: idDelCurso('Ethical Hacking'),
      plan: 'Estándar',
      progreso: 30,
      fechaInscripcion: '2024-05-01'
    });

    test('crea un estudiante y calcula el monto desde el plan', async () => {
      const respuesta = await admin.post('/api/estudiantes', { ...NUEVO(), montoUSD: 1, id: 999, activo: undefined });

      assert.equal(respuesta.estado, 201);
      assert.equal(respuesta.cuerpo.estudiante.montoUSD, 59.99);
      assert.equal(respuesta.cuerpo.estudiante.id, 36);
      assert.equal(respuesta.cuerpo.estudiante.activo, true);
      assert.equal(respuesta.cuerpo.estudiante.curso.nombre, 'Ethical Hacking');
      assert.equal((await admin.get('/api/estudiantes')).cuerpo.total, 36);
    });

    test('el correo se normaliza y no se repite aunque cambien las mayusculas', async () => {
      const primero = await admin.post('/api/estudiantes', { ...NUEVO(), email: '  NUEVA@Correo.com ' });
      const repetido = await admin.post('/api/estudiantes', { ...NUEVO(), email: 'nueva@CORREO.com' });
      const delEjemplo = await admin.post('/api/estudiantes', { ...NUEVO(), email: 'PJUAN5058@gmail.com' });

      assert.equal(primero.cuerpo.estudiante.email, 'nueva@correo.com');
      assert.equal(repetido.estado, 409);
      assert.equal(repetido.cuerpo.codigo, 'EMAIL_DUPLICADO');
      assert.ok(repetido.cuerpo.campos.email);
      assert.equal(delEjemplo.estado, 409);
    });

    test('un curso que no existe responde 400 en el campo cursoId', async () => {
      const respuesta = await admin.post('/api/estudiantes', { ...NUEVO(), cursoId: 99999 });

      assert.equal(respuesta.estado, 400);
      assert.ok(respuesta.cuerpo.campos.cursoId);
    });

    test('edita solo los campos enviados', async () => {
      const respuesta = await admin.patch('/api/estudiantes/2', { progreso: 95, activo: false });
      const antes = EJEMPLO[1];

      assert.equal(respuesta.estado, 200);
      assert.equal(respuesta.cuerpo.estudiante.progreso, 95);
      assert.equal(respuesta.cuerpo.estudiante.activo, false);
      assert.equal(respuesta.cuerpo.estudiante.nombre, antes.nombre);
      assert.equal(respuesta.cuerpo.estudiante.email, antes.email);
    });

    test('cambiar de plan cambia el monto', async () => {
      const respuesta = await admin.patch('/api/estudiantes/2', { plan: 'Premium' });

      assert.equal(respuesta.cuerpo.estudiante.montoUSD, 99.99);
    });

    test('permite poner progreso en 0 y cambiar de curso', async () => {
      const respuesta = await admin.patch('/api/estudiantes/2', { progreso: 0, cursoId: idDelCurso('Ethical Hacking') });

      assert.equal(respuesta.cuerpo.estudiante.progreso, 0);
      assert.equal(respuesta.cuerpo.estudiante.curso.nombre, 'Ethical Hacking');
    });

    test('no deja quedarse con el correo de otro estudiante', async () => {
      const respuesta = await admin.patch('/api/estudiantes/2', { email: EJEMPLO[2].email.toUpperCase() });

      assert.equal(respuesta.estado, 409);
      assert.equal((await admin.get('/api/estudiantes/2')).cuerpo.estudiante.email, EJEMPLO[1].email);
    });

    test('puede conservar su propio correo al editar', async () => {
      const respuesta = await admin.patch('/api/estudiantes/2', { email: EJEMPLO[1].email, nombre: 'Maria Jose' });

      assert.equal(respuesta.estado, 200);
    });

    test('editar un estudiante que no existe responde 404', async () => {
      assert.equal((await admin.patch('/api/estudiantes/99999', { progreso: 5 })).estado, 404);
    });

    test('elimina un estudiante y luego responde 404', async () => {
      assert.equal((await admin.delete('/api/estudiantes/3')).estado, 204);
      assert.equal((await admin.get('/api/estudiantes/3')).estado, 404);
      assert.equal((await admin.delete('/api/estudiantes/3')).estado, 404);
      assert.equal((await admin.get('/api/estudiantes')).cuerpo.total, 34);
    });

    test('un usuario normal no puede crear, editar ni eliminar', async () => {
      assert.equal((await usuario.post('/api/estudiantes', NUEVO())).estado, 403);
      assert.equal((await usuario.patch('/api/estudiantes/2', { progreso: 1 })).estado, 403);
      assert.equal((await usuario.delete('/api/estudiantes/2')).estado, 403);
      assert.equal((await admin.get('/api/estudiantes')).cuerpo.total, 35);
    });
  });

  describe('cursos, resumen y reportes', () => {
    before(reponerEjemplo);

    test('el catalogo trae los 30 cursos con su numero real de inscritos', async () => {
      const { cuerpo } = await usuario.get('/api/cursos');
      const porCurso = (nombre) => cuantos((e) => e.curso === nombre);

      assert.equal(cuerpo.cursos.length, 30);
      assert.equal(cuerpo.cursos.reduce((suma, c) => suma + c.inscritos, 0), 35);
      assert.equal(cuerpo.cursos.find((c) => c.nombre === 'Desarrollo Web').inscritos, porCurso('Desarrollo Web'));
      assert.equal(cuerpo.cursos.find((c) => c.nombre === 'TypeScript Avanzado').inscritos, 0);
      assert.deepEqual(Object.keys(cuerpo.cursos[0]).sort(), [
        'categoria', 'descripcion', 'id', 'inscritos', 'instructor', 'nivel', 'nombre', 'plan', 'precioUSD', 'semanas'
      ]);
    });

    test('el resumen trae numeros agregados y ningun dato personal', async () => {
      const { estado, cuerpo } = await usuario.get('/api/resumen');

      assert.equal(estado, 200);
      assert.deepEqual(
        { total: cuerpo.total, activos: cuerpo.activos, inactivos: cuerpo.inactivos, promedio: cuerpo.progresoPromedio },
        { total: 35, activos: 27, inactivos: 8, promedio: 65 }
      );
      assert.equal(cuerpo.porCiudad.reduce((suma, c) => suma + c.total, 0), 35);
      assert.equal(cuerpo.porCiudad[0].ciudad, 'Bogotá');
      assert.doesNotMatch(JSON.stringify(cuerpo), /apellido|email|Juan/);
    });

    test('el resumen de una base vacia no da NaN ni falla', async () => {
      await pool.query('TRUNCATE estudiantes RESTART IDENTITY');
      const { cuerpo } = await usuario.get('/api/resumen');
      const reportes = (await admin.get('/api/reportes')).cuerpo;
      await reponerEjemplo();

      assert.deepEqual([cuerpo.total, cuerpo.activos, cuerpo.progresoPromedio, cuerpo.porCiudad], [0, 0, 0, []]);
      assert.equal(reportes.retencionPorcentaje, 0);
      assert.equal(reportes.ingresosUSD, 0);
      assert.deepEqual(reportes.top, []);
    });

    test('los reportes calculan ingresos, retencion, planes, rangos y el top 10', async () => {
      const { estado, cuerpo } = await admin.get('/api/reportes');
      const ingresos = Math.round(EJEMPLO.reduce((s, e) => s + PRECIOS[e.plan], 0) * 100) / 100;

      assert.equal(estado, 200);
      assert.equal(cuerpo.ingresosUSD, ingresos);
      assert.equal(cuerpo.ingresosUSD, 2259.65);
      assert.equal(cuerpo.completaron, cuantos((e) => e.progreso === 100));
      assert.equal(cuerpo.retencionPorcentaje, 77);
      assert.equal(cuerpo.progresoPromedio, 65);
      assert.deepEqual(cuerpo.porPlan.map((p) => p.plan), ['Básico', 'Estándar', 'Premium']);
      assert.equal(cuerpo.porPlan.reduce((s, p) => s + p.total, 0), 35);
      assert.deepEqual(cuerpo.rangosProgreso.map((r) => r.rango), ['0-24%', '25-49%', '50-74%', '75-99%', '100%']);
      assert.equal(cuerpo.rangosProgreso.reduce((s, r) => s + r.total, 0), 35);
      assert.equal(cuerpo.rangosProgreso[4].total, cuerpo.completaron);
    });

    test('el top 10 va de mayor a menor progreso y desempata por orden de alta', async () => {
      const { cuerpo } = await admin.get('/api/reportes');
      const esperado = [...EJEMPLO.map((e, i) => ({ ...e, id: i + 1 }))]
        .sort((a, b) => b.progreso - a.progreso || a.id - b.id)
        .slice(0, 10)
        .map((e) => e.id);

      assert.deepEqual(cuerpo.top.map((e) => e.id), esperado);
      assert.equal(cuerpo.top.length, 10);
    });

    test('los reportes siguen los cambios de los datos', async () => {
      await admin.patch('/api/estudiantes/1', { plan: 'Básico' });
      const { cuerpo } = await admin.get('/api/reportes');
      await reponerEjemplo();

      assert.equal(cuerpo.ingresosUSD, 2259.65 - 99.99 + 29.99);
    });
  });
}
