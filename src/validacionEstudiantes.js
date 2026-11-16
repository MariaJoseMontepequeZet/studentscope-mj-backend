import { ErrorApi } from './errores.js';
import { errorEmail, errorNombre, normalizarEmail } from './validacion.js';

export const PLANES = ['Básico', 'Estándar', 'Premium'];
export const FECHA_MINIMA = '2023-01-01';

const LIMITE_POR_DEFECTO = 12;
const LIMITE_MAXIMO = 100;
const CAMPOS_EDITABLES = [
  'nombre',
  'apellido',
  'email',
  'ciudad',
  'cursoId',
  'plan',
  'progreso',
  'fechaInscripcion',
  'activo'
];

function fallar(campos) {
  throw new ErrorApi(400, 'DATOS_INVALIDOS', 'Revisa los datos enviados', campos);
}

function reunir(errores) {
  const campos = {};
  Object.entries(errores).forEach(([campo, mensaje]) => {
    if (mensaje) campos[campo] = mensaje;
  });
  return campos;
}

function esEnteroPositivo(valor) {
  if (typeof valor === 'number') return Number.isInteger(valor) && valor > 0;
  return typeof valor === 'string' && /^\d+$/.test(valor) && Number(valor) > 0;
}

function esFechaReal(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [anio, mes, dia] = texto.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
}

function errorTexto(valor, articulo, nombre, maximo) {
  if (typeof valor !== 'string' || valor.trim().length === 0) {
    return `${articulo} ${nombre} es obligatori${articulo === 'La' ? 'a' : 'o'}`;
  }
  if (valor.trim().length > maximo) return `${articulo} ${nombre} no puede superar ${maximo} caracteres`;
  return null;
}

function errorPlan(valor) {
  return PLANES.includes(valor) ? null : `El plan debe ser uno de: ${PLANES.join(', ')}`;
}

function errorProgreso(valor) {
  const valido = typeof valor === 'number' && Number.isInteger(valor) && valor >= 0 && valor <= 100;
  return valido ? null : 'El progreso debe ser un entero entre 0 y 100';
}

function errorFecha(valor, fechaMaxima) {
  if (!esFechaReal(valor)) return 'La fecha debe tener el formato AAAA-MM-DD y existir en el calendario';
  if (valor < FECHA_MINIMA) return `La fecha no puede ser anterior al ${FECHA_MINIMA}`;
  if (valor > fechaMaxima) return 'La fecha no puede ser posterior a hoy';
  return null;
}

function validadoresDeCampo(fechaMaxima) {
  return {
    nombre: (v) => errorNombre(v),
    apellido: (v) => errorTexto(v, 'El', 'apellido', 100),
    email: (v) => errorEmail(v),
    ciudad: (v) => errorTexto(v, 'La', 'ciudad', 60),
    cursoId: (v) => (esEnteroPositivo(v) ? null : 'El curso no es válido'),
    plan: errorPlan,
    progreso: errorProgreso,
    fechaInscripcion: (v) => errorFecha(v, fechaMaxima),
    activo: (v) => (typeof v === 'boolean' ? null : 'El estado debe ser verdadero o falso')
  };
}

function normalizar(campo, valor) {
  if (campo === 'nombre' || campo === 'apellido' || campo === 'ciudad') return valor.trim();
  if (campo === 'email') return normalizarEmail(valor);
  if (campo === 'cursoId') return Number(valor);
  return valor;
}

export function validarEstudianteNuevo(cuerpo = {}, { fechaMaxima }) {
  const validadores = validadoresDeCampo(fechaMaxima);
  const origen = { ...cuerpo, activo: cuerpo.activo === undefined ? true : cuerpo.activo };

  const campos = reunir(
    Object.fromEntries(CAMPOS_EDITABLES.map((campo) => [campo, validadores[campo](origen[campo])]))
  );
  if (Object.keys(campos).length > 0) fallar(campos);

  return Object.fromEntries(CAMPOS_EDITABLES.map((campo) => [campo, normalizar(campo, origen[campo])]));
}

export function validarCambiosEstudiante(cuerpo = {}, { fechaMaxima }) {
  const validadores = validadoresDeCampo(fechaMaxima);
  const presentes = CAMPOS_EDITABLES.filter((campo) => cuerpo[campo] !== undefined);
  if (presentes.length === 0) fallar({ general: 'No hay cambios que aplicar' });

  const campos = reunir(Object.fromEntries(presentes.map((campo) => [campo, validadores[campo](cuerpo[campo])])));
  if (Object.keys(campos).length > 0) fallar(campos);

  return Object.fromEntries(presentes.map((campo) => [campo, normalizar(campo, cuerpo[campo])]));
}

function errorTextoDeFiltro(valor, maximo, nombre) {
  if (typeof valor !== 'string') return `${nombre} no es válido`;
  return valor.length > maximo ? `${nombre} no puede superar ${maximo} caracteres` : null;
}

export function validarFiltros(consulta = {}) {
  const errores = {};
  const filtros = {};

  [['buscar', 100], ['ciudad', 60]].forEach(([campo, maximo]) => {
    if (consulta[campo] === undefined || consulta[campo] === '') return;
    errores[campo] = errorTextoDeFiltro(consulta[campo], maximo, `El filtro ${campo}`);
    filtros[campo] = typeof consulta[campo] === 'string' ? consulta[campo].trim() : consulta[campo];
  });

  if (consulta.plan !== undefined && consulta.plan !== '') {
    errores.plan = errorPlan(consulta.plan);
    filtros.plan = consulta.plan;
  }

  if (consulta.curso !== undefined && consulta.curso !== '') {
    errores.curso = esEnteroPositivo(consulta.curso) ? null : 'El curso no es válido';
    filtros.cursoId = Number(consulta.curso);
  }

  if (consulta.estado !== undefined && consulta.estado !== '') {
    const valido = consulta.estado === 'activo' || consulta.estado === 'inactivo';
    errores.estado = valido ? null : 'El estado debe ser activo o inactivo';
    filtros.activo = consulta.estado === 'activo';
  }

  filtros.pagina = 1;
  if (consulta.pagina !== undefined) {
    errores.pagina = esEnteroPositivo(consulta.pagina) ? null : 'La página debe ser un entero positivo';
    filtros.pagina = Number(consulta.pagina);
  }

  filtros.limite = LIMITE_POR_DEFECTO;
  if (consulta.limite !== undefined) {
    const valido = esEnteroPositivo(consulta.limite) && Number(consulta.limite) <= LIMITE_MAXIMO;
    errores.limite = valido ? null : `El límite debe estar entre 1 y ${LIMITE_MAXIMO}`;
    filtros.limite = Number(consulta.limite);
  }

  const campos = reunir(errores);
  if (Object.keys(campos).length > 0) fallar(campos);
  return filtros;
}

export function fechaMaximaPermitida(ahora = new Date()) {
  const manana = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() + 1));
  return manana.toISOString().slice(0, 10);
}
