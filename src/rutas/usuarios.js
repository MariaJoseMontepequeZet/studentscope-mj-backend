import { Router } from 'express';
import { requiereAdministrador } from '../middleware/sesion.js';
import { validarCambiosAdmin, validarIdUsuario } from '../validacion.js';

export function crearRutasUsuarios({ servicio, requiereSesion }) {
  const rutas = Router();
  rutas.use(requiereSesion, requiereAdministrador);

  rutas.get('/', async (req, res) => {
    res.json({ usuarios: await servicio.listar() });
  });

  rutas.patch('/:id', async (req, res) => {
    const id = validarIdUsuario(req.params.id);
    const usuario = await servicio.actualizarComoAdministrador(id, validarCambiosAdmin(req.body));
    res.json({ usuario });
  });

  rutas.delete('/:id', async (req, res) => {
    const id = validarIdUsuario(req.params.id);
    await servicio.eliminarComoAdministrador(req.usuario.id, id);
    res.status(204).end();
  });

  return rutas;
}
