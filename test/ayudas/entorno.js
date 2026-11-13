import { crearApp } from '../../src/app.js';
import { leerConfig } from '../../src/config.js';
import { crearRepositorioUsuariosMemoria } from '../../src/repositorios/usuariosMemoria.js';

export const SECRETO = 'secreto-de-pruebas-con-mas-de-32-caracteres';

export function configuracion(extra = {}) {
  return leerConfig({
    JWT_SECRET: SECRETO,
    DATABASE_URL: 'postgres://sin-uso',
    BCRYPT_COSTE: '4',
    ...extra
  });
}

export async function iniciarApp({ env = {}, ...opciones } = {}) {
  const config = configuracion(env);
  const repositorio = crearRepositorioUsuariosMemoria();
  const { app, servicio } = crearApp({
    repositorio,
    config,
    registrarError: () => {},
    ...opciones
  });
  const servidor = await new Promise((resolver) => {
    const instancia = app.listen(0, '127.0.0.1', () => resolver(instancia));
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  return {
    base,
    config,
    repositorio,
    servicio,
    cerrar: () =>
      new Promise((resolver) => {
        servidor.closeAllConnections();
        servidor.close(resolver);
      })
  };
}

export function crearCliente(base) {
  let cookie = '';

  function actualizarCookie(encabezados) {
    encabezados.forEach((linea) => {
      const [par] = linea.split(';');
      const [nombre, valor] = par.split('=');
      if (nombre !== 'sesion') return;
      cookie = valor === '' || /expires=Thu, 01 Jan 1970/i.test(linea) ? '' : par;
    });
  }

  async function pedir(metodo, ruta, cuerpo, cabeceras = {}) {
    const respuesta = await fetch(base + ruta, {
      method: metodo,
      headers: {
        ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...cabeceras
      },
      body: typeof cuerpo === 'string' ? cuerpo : cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
    });
    const encabezadosCookie = respuesta.headers.getSetCookie();
    actualizarCookie(encabezadosCookie);

    const texto = await respuesta.text();
    let json = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = null;
    }
    return { estado: respuesta.status, cuerpo: json, cabeceras: respuesta.headers, setCookie: encabezadosCookie };
  }

  return {
    get: (ruta, cabeceras) => pedir('GET', ruta, undefined, cabeceras),
    post: (ruta, cuerpo, cabeceras) => pedir('POST', ruta, cuerpo ?? {}, cabeceras),
    patch: (ruta, cuerpo, cabeceras) => pedir('PATCH', ruta, cuerpo, cabeceras),
    delete: (ruta, cabeceras) => pedir('DELETE', ruta, undefined, cabeceras),
    cookie: () => cookie,
    fijarCookie: (valor) => {
      cookie = valor;
    }
  };
}

export const REGISTRO = {
  nombre: 'Ana Pérez',
  email: 'ana@correo.com',
  password: 'Clave12345'
};
