import { ErrorApi } from '../errores.js';

const CODIGO_DUPLICADO = '23505';
const CODIGO_CLAVE_FORANEA = '23503';

const COLUMNAS = {
  nombre: 'nombre',
  apellido: 'apellido',
  email: 'email',
  ciudad: 'ciudad',
  cursoId: 'curso_id',
  plan: 'plan',
  progreso: 'progreso',
  fechaInscripcion: 'fecha_inscripcion',
  activo: 'activo'
};

const CONSULTA_BASE = `
  SELECT e.id, e.nombre, e.apellido, e.email, e.ciudad, e.progreso, e.activo,
         e.fecha_inscripcion::text AS fecha_inscripcion,
         c.id AS curso_id, c.nombre AS curso_nombre,
         p.nombre AS plan, p.precio_usd::text AS monto_usd
  FROM estudiantes e
  JOIN cursos c ON c.id = e.curso_id
  JOIN planes p ON p.nombre = e.plan`;

function aEstudiante(fila) {
  if (!fila) return null;
  return {
    id: Number(fila.id),
    nombre: fila.nombre,
    apellido: fila.apellido,
    email: fila.email,
    ciudad: fila.ciudad,
    curso: { id: Number(fila.curso_id), nombre: fila.curso_nombre },
    plan: fila.plan,
    montoUSD: Number(fila.monto_usd),
    progreso: fila.progreso,
    fechaInscripcion: fila.fecha_inscripcion,
    activo: fila.activo
  };
}

function traducirError(error) {
  if (error?.code === CODIGO_DUPLICADO) {
    const mensaje = 'Ya existe un estudiante con ese correo';
    return new ErrorApi(409, 'EMAIL_DUPLICADO', mensaje, { email: mensaje });
  }
  if (error?.code === CODIGO_CLAVE_FORANEA) {
    const campos = {};
    if (error.constraint === 'estudiantes_curso_id_fkey') campos.cursoId = 'El curso no existe';
    if (error.constraint === 'estudiantes_plan_fkey') campos.plan = 'El plan no existe';
    if (Object.keys(campos).length > 0) {
      return new ErrorApi(400, 'DATOS_INVALIDOS', 'Revisa los datos enviados', campos);
    }
  }
  return error;
}

function escaparComodines(texto) {
  return texto.replace(/[\\%_]/g, '\\$&');
}

function construirCondiciones(filtros) {
  const condiciones = [];
  const valores = [];

  const agregar = (sql, valor) => {
    valores.push(valor);
    const marcador = `$${valores.length}`;
    condiciones.push(sql.replaceAll('$$', () => marcador));
  };

  if (filtros.buscar) {
    agregar(
      "((e.nombre || ' ' || e.apellido) ILIKE $$ ESCAPE '\\' OR e.email ILIKE $$ ESCAPE '\\')",
      `%${escaparComodines(filtros.buscar)}%`
    );
  }
  if (filtros.ciudad) agregar('e.ciudad = $$', filtros.ciudad);
  if (filtros.plan) agregar('e.plan = $$', filtros.plan);
  if (filtros.cursoId) agregar('e.curso_id = $$', filtros.cursoId);
  if (filtros.activo !== undefined) agregar('e.activo = $$', filtros.activo);

  const donde = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
  return { donde, valores };
}

export function crearRepositorioEstudiantesPg(pool) {
  async function buscarPorId(id) {
    const { rows } = await pool.query(`${CONSULTA_BASE} WHERE e.id = $1`, [id]);
    return aEstudiante(rows[0]);
  }

  return {
    buscarPorId,

    async listar(filtros) {
      const { donde, valores } = construirCondiciones(filtros);
      const { rows: conteo } = await pool.query(
        `SELECT count(*)::int AS total FROM estudiantes e ${donde}`,
        valores
      );
      const { rows } = await pool.query(
        `${CONSULTA_BASE} ${donde} ORDER BY e.id LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
        [...valores, filtros.limite, (filtros.pagina - 1) * filtros.limite]
      );
      return { estudiantes: rows.map(aEstudiante), total: conteo[0].total };
    },

    async crear(datos) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO estudiantes
             (nombre, apellido, email, ciudad, curso_id, plan, progreso, fecha_inscripcion, activo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [
            datos.nombre,
            datos.apellido,
            datos.email,
            datos.ciudad,
            datos.cursoId,
            datos.plan,
            datos.progreso,
            datos.fechaInscripcion,
            datos.activo
          ]
        );
        return buscarPorId(rows[0].id);
      } catch (error) {
        throw traducirError(error);
      }
    },

    async actualizar(id, cambios) {
      const asignaciones = [];
      const valores = [];
      Object.entries(COLUMNAS).forEach(([propiedad, columna]) => {
        if (cambios[propiedad] === undefined) return;
        valores.push(cambios[propiedad]);
        asignaciones.push(`${columna} = $${valores.length}`);
      });
      if (asignaciones.length === 0) return buscarPorId(id);

      valores.push(id);
      try {
        const { rowCount } = await pool.query(
          `UPDATE estudiantes SET ${asignaciones.join(', ')}, actualizado_en = now()
           WHERE id = $${valores.length}`,
          valores
        );
        return rowCount === 0 ? null : buscarPorId(id);
      } catch (error) {
        throw traducirError(error);
      }
    },

    async eliminar(id) {
      const { rowCount } = await pool.query('DELETE FROM estudiantes WHERE id = $1', [id]);
      return rowCount > 0;
    },

    async listarCursos() {
      const { rows } = await pool.query(`
        SELECT c.id, c.nombre, c.categoria, c.nivel, c.semanas, c.plan, p.precio_usd::text AS precio_usd,
               c.instructor, c.descripcion, count(e.id)::int AS inscritos
        FROM cursos c
        JOIN planes p ON p.nombre = c.plan
        LEFT JOIN estudiantes e ON e.curso_id = c.id
        GROUP BY c.id, p.precio_usd
        ORDER BY c.id`);
      return rows.map((fila) => ({
        id: Number(fila.id),
        nombre: fila.nombre,
        categoria: fila.categoria,
        nivel: fila.nivel,
        semanas: fila.semanas,
        plan: fila.plan,
        precioUSD: Number(fila.precio_usd),
        instructor: fila.instructor,
        descripcion: fila.descripcion,
        inscritos: fila.inscritos
      }));
    },

    async resumen() {
      const { rows } = await pool.query(`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE activo)::int AS activos,
               COALESCE(round(avg(progreso)), 0)::int AS progreso_promedio
        FROM estudiantes`);
      const { rows: ciudades } = await pool.query(
        'SELECT ciudad, count(*)::int AS total FROM estudiantes GROUP BY ciudad ORDER BY total DESC, ciudad'
      );
      return {
        total: rows[0].total,
        activos: rows[0].activos,
        progresoPromedio: rows[0].progreso_promedio,
        porCiudad: ciudades
      };
    },

    async reportes() {
      const { rows } = await pool.query(`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE e.activo)::int AS activos,
               count(*) FILTER (WHERE e.progreso = 100)::int AS completaron,
               COALESCE(round(avg(e.progreso)), 0)::int AS progreso_promedio,
               COALESCE(sum(p.precio_usd), 0)::text AS ingresos
        FROM estudiantes e JOIN planes p ON p.nombre = e.plan`);
      const { rows: porPlan } = await pool.query(`
        SELECT p.nombre AS plan, count(e.id)::int AS total
        FROM planes p LEFT JOIN estudiantes e ON e.plan = p.nombre
        GROUP BY p.nombre, p.precio_usd ORDER BY p.precio_usd`);
      const { rows: rangos } = await pool.query(`
        SELECT CASE WHEN progreso < 25 THEN '0-24%'
                    WHEN progreso < 50 THEN '25-49%'
                    WHEN progreso < 75 THEN '50-74%'
                    WHEN progreso < 100 THEN '75-99%'
                    ELSE '100%' END AS rango, count(*)::int AS total
        FROM estudiantes GROUP BY 1`);
      const { rows: filasTop } = await pool.query(
        `${CONSULTA_BASE} ORDER BY e.progreso DESC, e.id LIMIT 10`
      );

      const orden = ['0-24%', '25-49%', '50-74%', '75-99%', '100%'];
      const porRango = Object.fromEntries(rangos.map((r) => [r.rango, r.total]));
      return {
        total: rows[0].total,
        activos: rows[0].activos,
        completaron: rows[0].completaron,
        progresoPromedio: rows[0].progreso_promedio,
        ingresosUSD: Number(rows[0].ingresos),
        porPlan,
        rangosProgreso: orden.map((rango) => ({ rango, total: porRango[rango] ?? 0 })),
        top: filasTop.map(aEstudiante)
      };
    }
  };
}
