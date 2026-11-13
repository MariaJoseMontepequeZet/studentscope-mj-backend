import pg from 'pg';

export function crearPool(configBaseDatos) {
  return new pg.Pool({
    ...configBaseDatos,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });
}
