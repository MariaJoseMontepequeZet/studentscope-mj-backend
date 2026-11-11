import { crearServidor } from './src/app.js';

const puerto = Number(process.env.PORT) || 3100;
const servidor = crearServidor();

servidor.listen(puerto, '0.0.0.0', () => {
  console.log(`API escuchando en el puerto ${puerto}`);
});

function cerrar() {
  servidor.close(() => process.exit(0));
  servidor.closeIdleConnections();
}

process.on('SIGTERM', cerrar);
process.on('SIGINT', cerrar);
