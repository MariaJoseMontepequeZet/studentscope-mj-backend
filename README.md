# StudentScope MJ - Backend

API REST de StudentScope MJ, plataforma de gestión educativa.

Hecho por María José Montepeque Zet.

Repositorios del proyecto:

* Frontend: `studentscope-mj-frontend`.
* Backend: `studentscope-mj-backend` (este repositorio).

---

## Estado actual

Esqueleto inicial: un servidor HTTP sin dependencias con un endpoint de salud, pruebas automáticas y una imagen de Docker. Sirve para conectar el despliegue automático desde el primer día. La base de datos, la autenticación y el CRUD de estudiantes se agregan en las siguientes entregas.

---

## Requisitos

* Node.js 22 o superior.
* Docker (opcional, para construir la imagen).

---

## Uso

```bash
npm install
npm test
npm start
```

Scripts disponibles:

| Comando | Descripción |
| :--- | :--- |
| `npm start` | Inicia el servidor. |
| `npm run dev` | Inicia el servidor y lo reinicia al guardar cambios. |
| `npm test` | Ejecuta las pruebas con el ejecutor de pruebas de Node. |

---

## Variables de entorno

| Variable | Valor por defecto | Descripción |
| :--- | :--- | :--- |
| `PORT` | `3100` | Puerto en el que escucha la API. |

El archivo `.env.example` muestra las variables esperadas. Nunca se sube un `.env` real al repositorio.

---

## Endpoints

| Método | Ruta | Respuesta |
| :--- | :--- | :--- |
| GET | `/api/health` | `200` con `{ "estado": "ok" }` |
| Cualquier otra | Cualquier otra | `404` con `{ "error": "No encontrado" }` |

---

## Docker

```bash
docker build -t studentscope-mj-backend .
docker run --rm -p 3100:3100 studentscope-mj-backend
```

La imagen usa `node:24-alpine`, instala solo las dependencias de producción y ejecuta la API con un usuario sin privilegios.

---

## Estructura del proyecto

| Ruta | Descripción |
| :--- | :--- |
| `server.js` | Punto de entrada: levanta el servidor y gestiona el cierre ordenado. |
| `src/app.js` | Creación del servidor y definición de las rutas. |
| `test/` | Pruebas automáticas. |
| `Dockerfile` | Imagen de la API. |

---

## Flujo de trabajo

Cada tarea se hace en una rama propia, con pull request hacia `dev`. Solo `dev` se fusiona a `main`, y el merge a `main` es lo que despliega.

---

## Despliegue

Cada push a `main` despliega la API en el servidor mediante GitHub Actions (`.github/workflows/desplegar.yml`) y un runner propio con la etiqueta `studentscope-mj-backend`.

El workflow copia el código a la carpeta del servidor y ejecuta `desplegar.sh api`, que reconstruye la imagen, inicia la base de datos y espera a que `/api/health` responda sano. La configuración del servidor (Docker Compose, Caddy y el archivo `.env` con los secretos) vive fuera de los repositorios.

---

## Registro de cambios

### Esqueleto inicial
* Servidor HTTP con `GET /api/health` y respuesta 404 en JSON para el resto de rutas.
* Cuatro pruebas automáticas del servidor.
* `Dockerfile`, `.dockerignore`, `.gitignore`, `.editorconfig` y `.env.example`.
* Se agrega el workflow `desplegar.yml`, que despliega en el servidor con cada push a `main`.
