import { Router } from 'express';
import { emitirCookie, requiereAdministrador } from '../middleware/sesion.js';
import { firmarToken } from '../seguridad/token.js';
import { validarCambiosAdmin, validarIdUsuario } from '../validacion.js';

export function crearRutasUsuarios({ servicio, requiereSesion, config }) {
  const rutas = Router();
  rutas.use(requiereSesion, requiereAdministrador);

  rutas.get('/', async (req, res) => {
    res.json({ usuarios: await servicio.listar() });
  });

  rutas.patch('/:id', async (req, res) => {
    const id = validarIdUsuario(req.params.id);
    const cambios = validarCambiosAdmin(req.body);
    const usuario = await servicio.actualizarComoAdministrador(id, cambios);
    if (id === req.usuario.id && cambios.password !== undefined) {
      emitirCookie(res, firmarToken(usuario.id, config.jwtSecreto, config.sesionHoras), config);
    }
    res.json({ usuario });
  });

  rutas.delete('/:id', async (req, res) => {
    const id = validarIdUsuario(req.params.id);
    await servicio.eliminarComoAdministrador(req.usuario.id, id);
    res.status(204).end();
  });

  return rutas;
}
