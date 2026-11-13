const PISTAS = {
  '28P01': 'Revisa el usuario y la contraseña de la base de datos en el archivo .env',
  28000: 'Revisa el usuario de la base de datos en el archivo .env',
  '3D000': 'La base de datos no existe. Créala antes de iniciar, por ejemplo con CREATE DATABASE studentscope_mj;',
  ECONNREFUSED:
    'No se pudo conectar. Comprueba que PostgreSQL está en ejecución y que el host y el puerto del archivo .env son correctos',
  ENOTFOUND: 'No se encontró el servidor de base de datos. Revisa DB_HOST o DATABASE_URL en el archivo .env',
  ETIMEDOUT: 'La base de datos no respondió a tiempo. Revisa el host y el puerto del archivo .env'
};

function mensajeDe(error) {
  return error?.message || error?.errors?.[0]?.message || String(error?.code ?? 'error desconocido');
}

export function describirErrorInicio(error) {
  const mensaje = mensajeDe(error);
  const pista = PISTAS[error?.code];
  return pista ? `${mensaje}\n${pista}` : mensaje;
}
