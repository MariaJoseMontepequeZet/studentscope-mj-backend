# StudentScope MJ - Backend

API REST de StudentScope MJ, plataforma de gestión educativa.

Hecho por María José Montepeque Zet.

Repositorios del proyecto:

* Frontend: `studentscope-mj-frontend`.
* Backend: `studentscope-mj-backend` (este repositorio).

---

## Estado actual

La API gestiona **cuentas de usuario**: registro, inicio y cierre de sesión, perfil propio y administración de cuentas (editar, eliminar, promover y degradar administradores). Los datos viven en PostgreSQL y la sesión se guarda en una cookie segura. El CRUD de estudiantes y los cursos se agregan en las siguientes entregas.

---

## Requisitos

* Node.js 22 o superior.
* PostgreSQL 16 o superior.
* Docker (opcional, para construir la imagen).

---

## Uso

```bash
npm install
cp .env.example .env
npm run start:local
```

1. Crea una base de datos PostgreSQL vacía, por ejemplo: `psql -U postgres -c "CREATE DATABASE studentscope_mj;"` (pedirá la contraseña de tu usuario de PostgreSQL).
2. Copia `.env.example` a `.env` y completa los valores (ver abajo). El archivo `.env` no existe en el repositorio a propósito: está en `.gitignore` y nunca se sube.
3. Genera el secreto de sesión con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` y pégalo en `JWT_SECRET`.
4. Inicia con `npm run start:local`. Al arrancar, la API aplica las migraciones pendientes y crea el administrador inicial si corresponde.

Node no lee el `.env` por sí solo: los scripts `start:local` y `dev` lo cargan con `--env-file=.env`. En el servidor y en Docker las variables llegan desde Docker Compose, por eso `npm start` no carga ningún archivo.

| Comando | Descripción |
| :--- | :--- |
| `npm start` | Inicia el servidor con las variables que ya existan en el entorno (producción y Docker). |
| `npm run start:local` | Inicia el servidor cargando el archivo `.env`. |
| `npm run dev` | Igual que el anterior, y lo reinicia al guardar cambios. |
| `npm test` | Ejecuta las pruebas. |

---

## Variables de entorno

| Variable | Obligatoria | Descripción |
| :--- | :--- | :--- |
| `DATABASE_URL` | Sí* | Cadena de conexión a PostgreSQL. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Sí* | Alternativa a `DATABASE_URL`, que tiene prioridad. |
| `JWT_SECRET` | Sí | Secreto para firmar la sesión. Mínimo 32 caracteres. La API no arranca sin él. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | No | Si no existe ningún administrador, se crea uno con estos datos al iniciar. Si ya existe una cuenta con ese correo, se promueve. |
| `PORT` | No | Puerto de la API. Por defecto `3100`. |
| `NODE_ENV` | No | Con `production` la cookie de sesión lleva el atributo `Secure`. |
| `SESION_HORAS` | No | Duración de la sesión. Por defecto `8`. |
| `BCRYPT_COSTE` | No | Coste del hash de contraseñas. Por defecto `12`. |

\* Basta con una de las dos formas de configurar la base de datos. El archivo `.env` real nunca se sube al repositorio.

---

## Problemas frecuentes al iniciar

Si la API no arranca, el mensaje indica la causa y qué revisar. Los más comunes:

| Mensaje | Causa | Solución |
| :--- | :--- | :--- |
| `la autentificación password falló para el usuario "..."` | `DB_USER` o `DB_PASSWORD` no coinciden con tu PostgreSQL. Con los valores de ejemplo de `.env.example` aparece este error. | Pon en `.env` el usuario y la contraseña reales. Si la contraseña tiene caracteres especiales, usa `DB_PASSWORD` en lugar de `DATABASE_URL`. |
| `ECONNREFUSED` | PostgreSQL no está en ejecución, o el host o el puerto son incorrectos. | Inicia PostgreSQL y revisa `DB_HOST` y `DB_PORT`. |
| `la base de datos "..." no existe` | Falta crear la base. | `CREATE DATABASE studentscope_mj;` |
| `JWT_SECRET debe tener al menos 32 caracteres` | Falta el secreto de sesión. | Genera uno como se explica arriba. |

---

## Cuentas y roles

Hay dos roles: `usuario` y `administrador`.

* Cualquiera puede registrarse; la cuenta nueva siempre es `usuario`. El rol no se puede elegir al registrarse ni desde el perfil.
* Solo un administrador puede ver, editar, eliminar y cambiar el rol de las cuentas.
* Siempre debe quedar al menos un administrador: no se puede degradar ni eliminar al último.
* Un administrador no puede eliminar su propia cuenta.
* Los permisos se leen de la base de datos en cada petición: al promover o degradar a alguien el cambio es inmediato, y al eliminar una cuenta su sesión deja de valer.

### Seguridad

* Las contraseñas se guardan con bcrypt; nunca en texto plano. Deben tener entre 8 y 72 caracteres, con letras y números.
* La sesión es un JWT firmado (HS256) en una cookie `HttpOnly` y `SameSite=Strict`, con `Secure` en producción. El navegador no puede leerla desde JavaScript.
* Las peticiones que cambian datos se rechazan si el encabezado `Origin` no coincide con el sitio.
* El inicio de sesión responde igual con un correo inexistente que con una contraseña incorrecta, y bloquea un correo durante 15 minutos tras 10 intentos fallidos. Este límite se guarda en memoria del proceso.
* Las respuestas de la API no se guardan en caché y los errores inesperados no revelan detalles internos.

---

## Endpoints

| Método | Ruta | Acceso | Descripción |
| :--- | :--- | :--- | :--- |
| GET | `/api/health` | Público | Estado de la API y de la base de datos (`200` o `503`). |
| POST | `/api/auth/registro` | Público | Crea una cuenta con rol `usuario` e inicia sesión. |
| POST | `/api/auth/login` | Público | Inicia sesión. |
| POST | `/api/auth/logout` | Público | Cierra la sesión. |
| GET | `/api/auth/yo` | Sesión | Datos de la cuenta actual. |
| PATCH | `/api/auth/yo` | Sesión | Cambia el nombre o la contraseña (exige la actual). |
| GET | `/api/usuarios` | Administrador | Lista las cuentas. |
| PATCH | `/api/usuarios/:id` | Administrador | Edita nombre, correo, rol o restablece la contraseña. |
| DELETE | `/api/usuarios/:id` | Administrador | Elimina una cuenta. |

Los errores responden `{ "error": "mensaje", "codigo": "CODIGO" }` y, cuando se puede, `campos` con el detalle por campo.

---

## Pruebas

```bash
npm test
```

Las pruebas de rutas y de reglas usan un repositorio en memoria y no necesitan base de datos. Para probar también contra PostgreSQL real, indica una base **vacía y desechable** (las pruebas borran sus tablas):

```bash
TEST_DATABASE_URL=postgres://usuario@localhost:5432/studentscope_test npm test
```

Sin esa variable, las pruebas de PostgreSQL se omiten.

---

## Docker

```bash
docker build -t studentscope-mj-backend .
docker run --rm -p 3100:3100 --env-file .env studentscope-mj-backend
```

La imagen usa `node:24-alpine`, instala solo las dependencias de producción y ejecuta la API con un usuario sin privilegios.

---

## Estructura del proyecto

| Ruta | Descripción |
| :--- | :--- |
| `server.js` | Punto de entrada: migraciones, administrador inicial, servidor y cierre ordenado. |
| `src/app.js` | Creación de la aplicación Express y montaje de rutas. |
| `src/config.js` | Lectura y validación de variables de entorno. |
| `src/rutas/` | Rutas de autenticación y de administración de cuentas. |
| `src/servicios/` | Reglas de negocio de las cuentas. |
| `src/repositorios/` | Acceso a datos: PostgreSQL y una versión en memoria para pruebas. |
| `src/db/` | Conexión, ejecutor de migraciones y archivos SQL en `migraciones/`. |
| `src/middleware/` | Sesión, permisos, comprobación de origen, límite de intentos y errores. |
| `src/seguridad/` | Hash de contraseñas y firma de sesiones. |
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

### Cuentas de usuario
* Se migra el servidor a Express y se conecta a PostgreSQL con migraciones automáticas.
* Registro, inicio y cierre de sesión con cookie segura, y perfil propio.
* Administración de cuentas: listar, editar, eliminar, promover y degradar, con la regla de que siempre quede un administrador.
* Creación del administrador inicial desde `ADMIN_EMAIL` y `ADMIN_PASSWORD`.
* 86 pruebas, incluidas las del repositorio contra PostgreSQL real y una prueba de concurrencia.
* Mensajes de error claros al iniciar (contraseña incorrecta, PostgreSQL apagado o base inexistente) en lugar de un volcado técnico.
* Scripts `start:local` y `dev` que cargan el archivo `.env`.
