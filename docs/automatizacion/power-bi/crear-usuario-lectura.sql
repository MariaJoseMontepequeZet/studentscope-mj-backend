-- Crea un usuario que solo puede leer las vistas de análisis (sin acceso a las tablas ni a los datos personales).
-- Cambia la contraseña antes de ejecutarlo y no la subas al repositorio.
-- Ejecútalo conectado como administrador de la base, por ejemplo:
--   docker compose exec -T db psql -U $DB_USER -d $DB_NAME < docs/automatizacion/power-bi/crear-usuario-lectura.sql

CREATE ROLE bi_lectura LOGIN PASSWORD 'CAMBIA_ESTA_CLAVE';

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO bi_lectura', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO bi_lectura;
GRANT SELECT ON vw_bi_estudiantes, vw_bi_cursos, vw_bi_resumen_mensual TO bi_lectura;
