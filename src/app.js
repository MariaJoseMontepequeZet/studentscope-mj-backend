import { createServer } from 'node:http';

const CONTENT_TYPE_JSON = 'application/json; charset=utf-8';

function responderJSON(res, codigo, cuerpo) {
  res.writeHead(codigo, { 'Content-Type': CONTENT_TYPE_JSON });
  res.end(JSON.stringify(cuerpo));
}

export function crearServidor() {
  return createServer((req, res) => {
    const ruta = req.url.split('?')[0];

    if (req.method === 'GET' && ruta === '/api/health') {
      responderJSON(res, 200, { estado: 'ok' });
      return;
    }

    responderJSON(res, 404, { error: 'No encontrado' });
  });
}
