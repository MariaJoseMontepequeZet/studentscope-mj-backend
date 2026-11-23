-- Vistas pensadas para herramientas de análisis (Power BI, hojas de cálculo).
-- No incluyen nombre, apellido ni correo: para analizar no hacen falta datos personales.

CREATE VIEW vw_bi_estudiantes AS
SELECT
  e.id,
  e.ciudad,
  c.nombre AS curso,
  c.categoria,
  c.nivel,
  e.plan,
  p.precio_usd AS monto_usd,
  e.progreso,
  e.fecha_inscripcion,
  date_trunc('month', e.fecha_inscripcion)::date AS mes_inscripcion,
  e.activo,
  CASE
    WHEN e.progreso = 100 THEN 'Completó'
    WHEN e.activo THEN 'En curso'
    ELSE 'Abandonó'
  END AS estado
FROM estudiantes e
JOIN cursos c ON c.id = e.curso_id
JOIN planes p ON p.nombre = e.plan;

CREATE VIEW vw_bi_cursos AS
SELECT
  c.id,
  c.nombre AS curso,
  c.categoria,
  c.nivel,
  c.semanas,
  c.plan,
  c.instructor,
  count(e.id)::int AS inscritos,
  count(e.id) FILTER (WHERE e.activo)::int AS activos,
  count(e.id) FILTER (WHERE e.progreso = 100)::int AS completaron,
  coalesce(round(avg(e.progreso), 1), 0) AS progreso_promedio,
  coalesce(sum(p.precio_usd), 0) AS ingresos_usd
FROM cursos c
LEFT JOIN estudiantes e ON e.curso_id = c.id
LEFT JOIN planes p ON p.nombre = e.plan
GROUP BY c.id;

CREATE VIEW vw_bi_resumen_mensual AS
SELECT
  date_trunc('month', e.fecha_inscripcion)::date AS mes,
  count(*)::int AS inscripciones,
  coalesce(sum(p.precio_usd), 0) AS ingresos_usd,
  coalesce(round(avg(e.progreso), 1), 0) AS progreso_promedio
FROM estudiantes e
JOIN planes p ON p.nombre = e.plan
GROUP BY 1
ORDER BY 1;
