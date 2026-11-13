import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const carpetaDatos = path.join(raiz, '.postgres-dev');
const PUERTO = 5433;
const BASE = 'studentscope_mj';
const USUARIO = 'postgres';
const esWindows = process.platform === 'win32';

function ejecutable(nombre) {
  return esWindows ? `${nombre}.exe` : nombre;
}

function carpetaBin() {
  const candidatas = [];
  if (process.env.PG_BIN) candidatas.push(process.env.PG_BIN);
  if (esWindows) {
    const base = 'C:\\Program Files\\PostgreSQL';
    if (existsSync(base)) {
      readdirSync(base)
        .sort((a, b) => Number(b) - Number(a))
        .forEach((version) => candidatas.push(path.join(base, version, 'bin')));
    }
  }
  return candidatas.find((c) => existsSync(path.join(c, ejecutable('pg_ctl')))) ?? null;
}

const bin = carpetaBin();

function herramienta(nombre) {
  return bin ? path.join(bin, ejecutable(nombre)) : nombre;
}

function ejecutar(nombre, args, opciones = {}) {
  return spawnSync(herramienta(nombre), args, { encoding: 'utf8', ...opciones });
}

function fallar(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

function comprobarHerramientas() {
  const prueba = ejecutar('pg_ctl', ['--version']);
  if (prueba.error) {
    fallar(
      'No se encontró PostgreSQL. Instálalo o indica la carpeta de sus programas con la variable PG_BIN.'
    );
  }
}

function estaEnEjecucion() {
  return ejecutar('pg_ctl', ['-D', carpetaDatos, 'status']).status === 0;
}

function psql(sql) {
  return ejecutar('psql', ['-h', '127.0.0.1', '-p', String(PUERTO), '-U', USUARIO, '-d', 'postgres', '-Atc', sql]);
}

function iniciar() {
  comprobarHerramientas();

  if (!existsSync(path.join(carpetaDatos, 'PG_VERSION'))) {
    console.log('Creando la base de datos de desarrollo en .postgres-dev ...');
    const resultado = ejecutar('initdb', ['-D', carpetaDatos, '-U', USUARIO, '-A', 'trust', '-E', 'UTF8', '--locale=C']);
    if (resultado.status !== 0) fallar(`No se pudo crear la base de datos:\n${resultado.stderr}`);
  }

  if (!estaEnEjecucion()) {
    const arranque = ejecutar(
      'pg_ctl',
      [
        '-D', carpetaDatos,
        '-o', `-p ${PUERTO} -c listen_addresses=127.0.0.1`,
        '-l', path.join(carpetaDatos, 'registro.log'),
        '-w', 'start'
      ],
      { stdio: 'ignore' }
    );
    if (arranque.status !== 0) {
      fallar(`No se pudo iniciar PostgreSQL. Revisa ${path.join(carpetaDatos, 'registro.log')}`);
    }
  }

  const existe = psql(`SELECT 1 FROM pg_database WHERE datname = '${BASE}'`);
  if (existe.status !== 0) fallar(`No se pudo conectar a PostgreSQL en el puerto ${PUERTO}:\n${existe.stderr}`);
  if (existe.stdout.trim() !== '1') {
    const creacion = psql(`CREATE DATABASE ${BASE}`);
    if (creacion.status !== 0) fallar(`No se pudo crear la base ${BASE}:\n${creacion.stderr}`);
  }

  console.log(`Base de datos lista: ${BASE} en 127.0.0.1:${PUERTO} (usuario ${USUARIO}, sin contraseña).`);
}

function detener() {
  comprobarHerramientas();
  if (!estaEnEjecucion()) {
    console.log('La base de datos de desarrollo ya está detenida.');
    return;
  }
  const resultado = ejecutar('pg_ctl', ['-D', carpetaDatos, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
  if (resultado.status !== 0) fallar('No se pudo detener PostgreSQL.');
  console.log('Base de datos de desarrollo detenida.');
}

function estado() {
  comprobarHerramientas();
  console.log(estaEnEjecucion() ? `En ejecución en 127.0.0.1:${PUERTO}` : 'Detenida');
}

const ACCIONES = { iniciar, detener, estado };
const accion = ACCIONES[process.argv[2]];
if (!accion) fallar('Uso: node scripts/db-local.mjs <iniciar|detener|estado>');
accion();
