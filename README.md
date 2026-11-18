# StudentScope MJ - Backend

API REST de StudentScope MJ, plataforma de gestión educativa.

Hecho por María José Montepeque Zet.

Repositorios del proyecto:

* Frontend: `studentscope-mj-frontend`.
* Backend: `studentscope-mj-backend` (este repositorio).

---

## Estado actual

La API gestiona **cuentas de usuario** y la **API de estudiantes y cursos** sobre PostgreSQL: listado con búsqueda, filtros y paginación en el servidor, alta, edición y baja solo para administradores, catálogo de cursos con inscritos reales, resumen para el dashboard y reportes.

Las cuentas: registro, inicio y cierre de sesión, perfil propio y administración de cuentas (editar, eliminar, promover y degradar administradores). Los datos viven en PostgreSQL y la sesión se guarda en una cookie segura. 
---

## Requisitos

* Node.js 22 o superior.
* PostgreSQL 16 o superior.
* Docker (opcional, para construir la imagen).

---

## Uso

### Opción A: base de datos de desarrollo del proyecto (recomendada)

No necesitas conocer ninguna contraseña. El proyecto crea su propio PostgreSQL de desarrollo en la carpeta `.postgres-dev` (ignorada por Git), que escucha solo en `127.0.0.1:5433` y no usa contraseña.

```bash
npm install
npm run db:iniciar
npm run env:preparar
npm run start:local
```

1. `npm run db:iniciar` crea la base la primera vez, la enciende y crea `studentscope_mj`. Hay que encenderla cada vez que reinicies el equipo.
2. `npm run env:preparar` crea o completa el archivo `.env`: genera `JWT_SECRET` y `ADMIN_PASSWORD` al azar y rellena los datos de la base. No cambia ningún valor que ya hayas puesto y no muestra secretos.
3. Abre `.env`, escribe tu correo en `ADMIN_EMAIL` y consulta ahí la contraseña generada del administrador (puedes cambiarla por otra de al menos 8 caracteres, con letras y números).
4. `npm run start:local` inicia la API.

Esta base es solo para desarrollo: no tiene contraseña, así que no la uses para nada que importe. Para apagarla: `npm run db:detener`.

### Opción B: tu propio PostgreSQL

1. Crea una base de datos vacía, por ejemplo: `psql -U postgres -c "CREATE DATABASE studentscope_mj;"` (pedirá la contraseña de tu usuario de PostgreSQL).
2. Copia `.env.example` a `.env` y completa los valores (ver más abajo). El archivo `.env` no existe en el repositorio a propósito: está en `.gitignore` y nunca se sube.
3. Genera el secreto de sesión con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` y pégalo en `JWT_SECRET`.
4. Inicia con `npm run start:local`.

En ambos casos, al arrancar la API aplica las migraciones pendientes y crea el administrador inicial si corresponde.

Node no lee el `.env` por sí solo: los scripts `start:local` y `dev` lo cargan con `--env-file=.env`. En el servidor y en Docker las variables llegan desde Docker Compose, por eso `npm start` no carga ningún archivo.

| Comando | Descripción |
| :--- | :--- |
| `npm start` | Inicia el servidor con las variables que ya existan en el entorno (producción y Docker). |
| `npm run start:local` | Inicia el servidor cargando el archivo `.env`. |
| `npm run dev` | Igual que el anterior, y lo reinicia al guardar cambios. |
| `npm run db:iniciar` | Crea (si no existe) y enciende la base de datos de desarrollo del proyecto. |
| `npm run db:detener` | Apaga la base de datos de desarrollo. |
| `npm run db:estado` | Indica si la base de desarrollo está encendida. |
| `npm run db:sembrar` | Aplica las migraciones y carga los estudiantes de ejemplo si la tabla está vacía. |
| `npm run env:preparar` | Crea o completa `.env` con valores generados, sin pisar los que ya existan. |
| `npm test` | Ejecuta las pruebas (sin base de datos se omiten las de PostgreSQL). |
| `npm run test:pg` | Ejecuta todas las pruebas, incluidas las de PostgreSQL, contra la base `studentscope_test` de desarrollo. |

---

## Variables de entorno

| Variable | Obligatoria | Descripción |
| :--- | :--- | :--- |
| `DATABASE_URL` | Sí* | Cadena de conexión a PostgreSQL. |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Sí* | Alternativa a `DATABASE_URL`, que tiene prioridad. |
| `JWT_SECRET` | Sí | Secreto para firmar la sesión. Mínimo 32 caracteres. La API no arranca sin él. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | No | Si no existe ningún administrador, se crea uno con estos datos al iniciar. Si ya existe una cuenta con ese correo, se promueve. |
| `SEMBRAR_EJEMPLO` | No | Con `true`, al iniciar carga 35 estudiantes de ejemplo si la tabla de estudiantes está vacía. Por defecto `false`. |
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

## Modelo de datos

Las migraciones están en `src/db/migraciones/` y se aplican solas al iniciar, cada una una sola vez y dentro de una transacción.

| Tabla | Contenido y reglas |
| :--- | :--- |
| `usuarios` | Cuentas. Correo único sin distinguir mayúsculas y rol `usuario` o `administrador`. |
| `planes` | Los tres planes y su precio: Básico 29.99, Estándar 59.99 y Premium 99.99. El precio se lee de aquí; no se guarda en cada estudiante, así que nunca puede contradecir al plan. |
| `cursos` | Catálogo de 30 cursos: categoría, nivel, semanas, plan, instructor y descripción. Nombre único. |
| `estudiantes` | Nombre, apellido, correo único sin distinguir mayúsculas, ciudad, curso, plan, progreso, fecha de inscripción y estado. |

La propia base impone las reglas, además de la API:

* El progreso va de 0 a 100 y la fecha de inscripción no puede ser anterior al 2023-01-01. Que no sea futura lo valida la API, porque una restricción de la base no puede depender de la fecha actual.
* Nombre, apellido y ciudad no pueden estar vacíos.
* El plan y el curso de un estudiante deben existir.
* Un curso con estudiantes no se puede eliminar (`ON DELETE RESTRICT`).

### Datos de ejemplo

Los planes y los cursos forman parte de la migración. Los **35 estudiantes de ejemplo** (`src/db/datos/estudiantes-ejemplo.json`) se cargan con `SEMBRAR_EJEMPLO=true` al iniciar o con `npm run db:sembrar`. La carga es idempotente: si ya hay estudiantes no hace nada, se ejecuta dentro de una transacción (si falla no queda nada a medias) y usa un bloqueo para que dos instancias a la vez no dupliquen los datos.

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
| PATCH | `/api/auth/yo` | Sesión | Cambia el nombre, el avatar o la contraseña (exige la actual). |
| GET | `/api/estudiantes` | Administrador | Lista con búsqueda, filtros y paginación (ver abajo). |
| GET | `/api/estudiantes/:id` | Administrador | Detalle de un estudiante. |
| POST | `/api/estudiantes` | Administrador | Crea un estudiante (`201`). |
| PATCH | `/api/estudiantes/:id` | Administrador | Edita solo los campos enviados. |
| DELETE | `/api/estudiantes/:id` | Administrador | Elimina un estudiante (`204`). |
| GET | `/api/cursos` | Sesión | Catálogo de 30 cursos con el número real de inscritos. |
| GET | `/api/resumen` | Sesión | Totales, activos, progreso promedio y estudiantes por ciudad. Solo números agregados, sin datos personales. |
| GET | `/api/reportes` | Administrador | Ingresos, completados, retención, estudiantes por plan, rangos de progreso y Top 10. |
| GET | `/api/usuarios` | Administrador | Lista las cuentas. |
| PATCH | `/api/usuarios/:id` | Administrador | Edita nombre, correo, rol o restablece la contraseña. |
| DELETE | `/api/usuarios/:id` | Administrador | Elimina una cuenta. |

Los errores responden `{ "error": "mensaje", "codigo": "CODIGO" }` y, cuando se puede, `campos` con el detalle por campo.

---

## Estudiantes y cursos

Todo lo que contiene datos personales de estudiantes es **solo para administradores**: el servidor responde `403` a un usuario normal y `401` sin sesión, sin llegar a consultar la base de datos. Un usuario normal solo puede ver el catálogo de cursos y el resumen agregado.

### Listado: `GET /api/estudiantes`

| Parámetro | Descripción |
| :--- | :--- |
| `buscar` | Texto en nombre, apellido, nombre completo o correo, sin distinguir mayúsculas. Los comodines `%` y `_` se buscan como texto. |
| `ciudad`, `plan` | Coincidencia exacta. El plan debe ser Básico, Estándar o Premium. |
| `curso` | Identificador del curso (el de `/api/cursos`). |
| `estado` | `activo` o `inactivo`. |
| `pagina`, `limite` | Página (desde 1) y tamaño (por defecto 12, máximo 100). |

La respuesta incluye `estudiantes`, `total`, `pagina`, `limite` y `paginas`. Los estudiantes se ordenan por `id`.

### Alta y edición

Campos: `nombre`, `apellido`, `email`, `ciudad`, `cursoId`, `plan`, `progreso`, `fechaInscripcion` y `activo` (verdadero por defecto). Reglas:

* Nombre y apellido de hasta 100 caracteres, ciudad de hasta 60, correo válido y único sin distinguir mayúsculas.
* `progreso` entero de 0 a 100, enviado como número.
* `fechaInscripcion` real, desde 2023-01-01 hasta hoy. Se tolera un día más para no rechazar a quien registre desde un huso horario por delante del servidor.
* `plan` y `cursoId` deben existir.
* **El monto no se envía:** lo calcula el servidor a partir del plan. Cualquier `montoUSD` o `id` que llegue se ignora.
* Los errores responden `400` con `campos` (un mensaje por campo) o `409` con `EMAIL_DUPLICADO`.

Estas reglas son las mismas que usa el frontend para validar el formulario, de modo que el servidor es la segunda línea de defensa si alguien llama a la API directamente.

---

## Pruebas

```bash
npm test
```

Las pruebas de rutas y de reglas usan un repositorio en memoria y no necesitan base de datos. Las del repositorio y del esquema se ejecutan contra PostgreSQL real con `npm run test:pg` (usa la base `studentscope_test` que crea `npm run db:iniciar`) o indicando otra base **vacía y desechable**, porque las pruebas **borran todo su contenido**:

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
| `src/servicios/` | Reglas de negocio de las cuentas y de los estudiantes. |
| `src/repositorios/` | Acceso a datos: PostgreSQL y una versión en memoria para pruebas. |
| `src/db/` | Conexión, ejecutor de migraciones, archivos SQL en `migraciones/`, carga de datos de ejemplo y su archivo en `datos/`. |
| `scripts/` | Herramientas de desarrollo: base local, preparación del `.env`, carga de ejemplos y pruebas con PostgreSQL. |
| `src/middleware/` | Sesión, permisos, comprobación de origen, límite de intentos y errores. |
| `src/validacionEstudiantes.js` | Reglas de validación de estudiantes y de los filtros del listado. |
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
* Base de datos de desarrollo del proyecto (`npm run db:iniciar`) y script `env:preparar`, para trabajar en local sin conocer contraseñas de PostgreSQL.

### Estudiantes y cursos: datos
* Migración `002` con las tablas `planes`, `cursos` y `estudiantes` y sus restricciones.
* Carga idempotente de 30 cursos y 35 estudiantes de ejemplo, con `SEMBRAR_EJEMPLO` y `npm run db:sembrar`.
* Las pruebas con PostgreSQL se ejecutan una a una (`--test-concurrency=1`) para no pisarse, y `npm run test:pg` las ejecuta contra una base de pruebas con una protección: se niega a borrar una base cuyo nombre no contenga "test".
* 123 pruebas.

### Estudiantes y cursos: API
* Rutas de estudiantes (listado con búsqueda, filtros y paginación, alta, edición y baja) solo para administradores.
* Catálogo de cursos con inscritos reales, resumen agregado para cualquier sesión y reportes para administradores.
* Validación en el servidor con las reglas del frontend; el monto se calcula desde el plan.
* 182 pruebas, incluidas las de la API contra PostgreSQL real y las de permisos con un repositorio falso que comprueba que un usuario normal nunca llega a la base de datos.

### Avatar del usuario
* Nueva columna `usuarios.avatar_semilla` (migración 003): texto de 1 a 40 letras, números, guiones o guiones bajos, o nulo. La base lo exige con una restricción además de la validación de la API.
* Todas las respuestas de cuenta incluyen `avatarSemilla`. Si es `null`, el frontend usa el correo como semilla.
* `PATCH /api/auth/yo` acepta `avatarSemilla` (texto válido o `null` para volver al avatar por defecto). Cada persona solo cambia el suyo; el administrador no edita avatares ajenos.
* 192 pruebas con PostgreSQL (134 sin él): formato, largo máximo, `null`, sesión obligatoria, ambos repositorios y la restricción de la base.

### Integración continua
* Nuevo flujo `CI` (`.github/workflows/ci.yml`): en cada PR hacia `dev` o `main` ejecuta las pruebas contra un PostgreSQL 16 de servicio (`TEST_DATABASE_URL`, así corren también las pruebas de base de datos) y comprueba que la imagen de Docker se construye.
* El flujo de despliegue usa `actions/checkout@v5`.
* Para que un PR no se pueda fusionar si el CI falla, se exige el check `Pruebas con PostgreSQL` en la regla de protección de ramas de GitHub.
