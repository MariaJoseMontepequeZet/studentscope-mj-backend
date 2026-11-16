import { Router } from 'express';
import { requiereAdministrador } from '../middleware/sesion.js';
import { validarIdUsuario } from '../validacion.js';
import {
  fechaMaximaPermitida,
  validarCambiosEstudiante,
  validarEstudianteNuevo,
  validarFiltros
} from '../validacionEstudiantes.js';

export function crearRutasEstudiantes({ servicio, requiereSesion, ahora }) {
  const rutas = Router();
  rutas.use(requiereSesion, requiereAdministrador);

  const contexto = () => ({ fechaMaxima: fechaMaximaPermitida(ahora()) });

  rutas.get('/', async (req, res) => {
    res.json(await servicio.listar(validarFiltros(req.query)));
  });

  rutas.get('/:id', async (req, res) => {
    const estudiante = await servicio.obtener(validarIdUsuario(req.params.id));
    res.json({ estudiante });
  });

  rutas.post('/', async (req, res) => {
    const estudiante = await servicio.crear(validarEstudianteNuevo(req.body, contexto()));
    res.status(201).json({ estudiante });
  });

  rutas.patch('/:id', async (req, res) => {
    const id = validarIdUsuario(req.params.id);
    const estudiante = await servicio.actualizar(id, validarCambiosEstudiante(req.body, contexto()));
    res.json({ estudiante });
  });

  rutas.delete('/:id', async (req, res) => {
    await servicio.eliminar(validarIdUsuario(req.params.id));
    res.status(204).end();
  });

  return rutas;
}

export function crearRutasPanel({ servicio, requiereSesion }) {
  const rutas = Router();

  rutas.get('/cursos', requiereSesion, async (req, res) => {
    res.json({ cursos: await servicio.listarCursos() });
  });

  rutas.get('/resumen', requiereSesion, async (req, res) => {
    res.json(await servicio.resumen());
  });

  rutas.get('/reportes', requiereSesion, requiereAdministrador, async (req, res) => {
    res.json(await servicio.reportes());
  });

  return rutas;
}
