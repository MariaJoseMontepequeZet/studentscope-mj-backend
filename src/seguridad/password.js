import bcrypt from 'bcryptjs';

const HASH_SENUELO = bcrypt.hashSync('contrasena-senuelo', 4);

export function hashearPassword(password, coste) {
  return bcrypt.hash(password, coste);
}

export async function verificarPassword(password, hash) {
  return bcrypt.compare(password, hash ?? HASH_SENUELO);
}

export async function gastarTiempoDeVerificacion(password) {
  await bcrypt.compare(password, HASH_SENUELO);
}
