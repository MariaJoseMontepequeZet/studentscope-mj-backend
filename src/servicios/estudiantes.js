import { ErrorApi } from '../errores.js';

function noEncontrado() {
  return new ErrorApi(404, 'ESTUDIANTE_NO_ENCONTRADO', 'El estudiante no existe');
}

export function crearServicioEstudiantes({ repositorio }) {
  return {
    async listar(filtros) {
      const { estudiantes, total } = await repositorio.listar(filtros);
      return {
        estudiantes,
        total,
        pagina: filtros.pagina,
        limite: filtros.limite,
        paginas: Math.ceil(total / filtros.limite)
      };
    },

    async obtener(id) {
      const estudiante = await repositorio.buscarPorId(id);
      if (!estudiante) throw noEncontrado();
      return estudiante;
    },

    async crear(datos, { maximo } = {}) {
      if (maximo !== undefined) {
        const { total } = await repositorio.listar({ pagina: 1, limite: 1 });
        if (total >= maximo) {
          throw new ErrorApi(409, 'DEMO_LIMITE', `La demo admite hasta ${maximo} estudiantes`);
        }
      }
      return repositorio.crear(datos);
    },

    async actualizar(id, cambios) {
      const estudiante = await repositorio.actualizar(id, cambios);
      if (!estudiante) throw noEncontrado();
      return estudiante;
    },

    async eliminar(id) {
      if (!(await repositorio.eliminar(id))) throw noEncontrado();
    },

    listarCursos() {
      return repositorio.listarCursos();
    },

    async resumen() {
      const datos = await repositorio.resumen();
      return { ...datos, inactivos: datos.total - datos.activos };
    },

    async reportes() {
      const datos = await repositorio.reportes();
      return {
        ...datos,
        retencionPorcentaje: datos.total > 0 ? Math.round((datos.activos / datos.total) * 100) : 0
      };
    }
  };
}
