function numero(valor, porDefecto) {
  const convertido = Number(valor);
  return Number.isFinite(convertido) && valor !== undefined && valor !== '' ? convertido : porDefecto;
}

function leerBaseDatos(env) {
  if (env.DATABASE_URL) return { connectionString: env.DATABASE_URL };
  if (!env.DB_HOST) throw new Error('Falta DATABASE_URL o DB_HOST');

  return {
    host: env.DB_HOST,
    port: numero(env.DB_PORT, 5432),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD
  };
}

export function leerConfig(env = process.env) {
  const jwtSecreto = env.JWT_SECRET ?? '';
  if (jwtSecreto.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
  }

  return {
    puerto: numero(env.PORT, 3100),
    produccion: env.NODE_ENV === 'production',
    basedatos: leerBaseDatos(env),
    jwtSecreto,
    sesionHoras: numero(env.SESION_HORAS, 8),
    costeBcrypt: numero(env.BCRYPT_COSTE, 12),
    adminEmail: env.ADMIN_EMAIL?.trim().toLowerCase() || null,
    adminPassword: env.ADMIN_PASSWORD || null
  };
}
