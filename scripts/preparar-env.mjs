import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BASE_DESARROLLO = {
  DB_HOST: 'localhost',
  DB_PORT: '5433',
  DB_NAME: 'studentscope_mj',
  DB_USER: 'postgres',
  PORT: '3100',
  NODE_ENV: 'development'
};

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generarSecreto() {
  return randomBytes(48).toString('hex');
}

export function generarClave() {
  let clave = '';
  while (!/[A-Za-z]/.test(clave) || !/\d/.test(clave)) {
    clave = Array.from({ length: 16 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
  }
  return clave;
}

function leerLineas(texto) {
  const saltos = texto.includes('\r\n') ? '\r\n' : '\n';
  return { saltos, lineas: texto.split(/\r?\n/) };
}

function buscar(lineas, nombre) {
  return lineas.findIndex((linea) => linea.startsWith(`${nombre}=`));
}

function valorDe(lineas, nombre) {
  const indice = buscar(lineas, nombre);
  return indice === -1 ? '' : lineas[indice].slice(nombre.length + 1).trim();
}

function asignar(lineas, nombre, valor) {
  const indice = buscar(lineas, nombre);
  if (indice === -1) lineas.push(`${nombre}=${valor}`);
  else lineas[indice] = `${nombre}=${valor}`;
}

export function completarEnv(texto, { secreto = generarSecreto, clave = generarClave } = {}) {
  const { saltos, lineas } = leerLineas(texto);
  const cambios = [];

  const urlEjemplo = buscar(lineas, 'DATABASE_URL');
  if (urlEjemplo !== -1 && lineas[urlEjemplo].includes('usuario:clave')) {
    lineas.splice(urlEjemplo, 1);
    cambios.push('DATABASE_URL (se quitó el valor de ejemplo)');
  }

  const usaUrl = valorDe(lineas, 'DATABASE_URL') !== '';
  Object.entries(BASE_DESARROLLO).forEach(([nombre, valor]) => {
    const esBaseDeDatos = nombre.startsWith('DB_');
    if (esBaseDeDatos && usaUrl) return;
    if (valorDe(lineas, nombre) === '') {
      asignar(lineas, nombre, valor);
      cambios.push(nombre);
    }
  });
  if (!usaUrl && buscar(lineas, 'DB_PASSWORD') === -1) asignar(lineas, 'DB_PASSWORD', '');

  if (valorDe(lineas, 'JWT_SECRET') === '') {
    asignar(lineas, 'JWT_SECRET', secreto());
    cambios.push('JWT_SECRET');
  }
  if (valorDe(lineas, 'ADMIN_PASSWORD') === '') {
    asignar(lineas, 'ADMIN_PASSWORD', clave());
    cambios.push('ADMIN_PASSWORD');
  }
  if (buscar(lineas, 'ADMIN_EMAIL') === -1) asignar(lineas, 'ADMIN_EMAIL', '');

  const resultado = lineas.join(saltos);
  return {
    texto: resultado.endsWith(saltos) ? resultado : resultado + saltos,
    cambios,
    faltaCorreo: valorDe(lineas, 'ADMIN_EMAIL') === ''
  };
}

function principal() {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const archivo = path.join(raiz, '.env');
  const ejemplo = path.join(raiz, '.env.example');

  const origen = existsSync(archivo) ? archivo : ejemplo;
  const { texto, cambios, faltaCorreo } = completarEnv(readFileSync(origen, 'utf8'));
  writeFileSync(archivo, texto);

  if (cambios.length === 0) {
    console.log('El archivo .env ya estaba completo; no se cambió nada.');
  } else {
    console.log('Se completaron estas variables en .env (sus valores no se muestran):');
    cambios.forEach((nombre) => console.log(`  - ${nombre}`));
  }
  if (cambios.includes('ADMIN_PASSWORD')) {
    console.log('La contraseña del administrador se generó al azar: abre .env para verla y cámbiala si quieres.');
  }
  if (faltaCorreo) console.log('Falta ADMIN_EMAIL: escribe tu correo en .env antes de iniciar.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
