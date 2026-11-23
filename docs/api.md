# API de StudentScope MJ

Referencia de cada endpoint. La colección de Postman con casos felices y de error está en [`docs/postman/`](postman/).

## Convenciones

* Todo viaja en JSON y las rutas empiezan por `/api`.
* La sesión es la cookie `sesion` (`HttpOnly`, `SameSite=Strict`, `Secure` en producción). Los clientes que no son un navegador deben guardarla y reenviarla.
* Las peticiones que cambian datos (`POST`, `PATCH`, `DELETE`) se rechazan con `403 ORIGEN_NO_PERMITIDO` si traen un `Origin` distinto del sitio. Si no traen `Origin`, pasan.
* Las respuestas no se guardan en caché.
* Un error responde `{ "error": "mensaje", "codigo": "CODIGO", "campos": { "campo": "mensaje" } }`; `campos` solo aparece cuando hay datos inválidos.

### Códigos de error

| Estado | Código | Cuándo |
| :--- | :--- | :--- |
| 400 | `DATOS_INVALIDOS` | Falta algún dato o no cumple las reglas. `campos` indica cuáles. |
| 400 | `ID_INVALIDO` | El identificador de la ruta no es un entero positivo. |
| 401 | `NO_AUTENTICADO` | No hay sesión, venció, o la cuenta ya no existe o cambió de contraseña. |
| 401 | `CREDENCIALES_INVALIDAS` | Correo o contraseña incorrectos. |
| 403 | `SIN_PERMISO` | La cuenta no tiene permiso para esa acción. |
| 403 | `ORIGEN_NO_PERMITIDO` | El `Origin` no coincide con el sitio. |
| 404 | `NO_ENCONTRADO` | La ruta no existe. |
| 404 | `ESTUDIANTE_NO_ENCONTRADO` | El estudiante no existe. |
| 404 | `USUARIO_NO_ENCONTRADO` | La cuenta no existe. |
| 404 | `DEMO_NO_DISPONIBLE` | La demo está apagada en ese servidor. |
| 409 | `EMAIL_DUPLICADO` | Ya existe una cuenta o un estudiante con ese correo. |
| 409 | `ULTIMO_ADMINISTRADOR` | Se intentó degradar o eliminar al único administrador. |
| 409 | `NO_AUTOELIMINAR` | Un administrador intentó eliminar su propia cuenta. |
| 409 | `DEMO_LIMITE` | La cuenta de demostración llegó al tope de estudiantes. |
| 429 | `DEMASIADOS_INTENTOS` | Demasiados inicios de sesión fallidos para ese correo. |

## Salud

### `GET /api/health`
Público. `200 { "estado": "ok" }` si la base responde; `503` si no.

## Autenticación

### `POST /api/auth/registro`
Público. Crea una cuenta con rol `usuario` e inicia sesión.

| Campo | Regla |
| :--- | :--- |
| `nombre` | Obligatorio, hasta 100 caracteres. |
| `email` | Correo válido, hasta 254 caracteres, único sin distinguir mayúsculas. |
| `password` | De 8 a 72 caracteres, con letras y números. |

`201 { "usuario": { id, nombre, email, rol, avatarSemilla, creadoEn } }`. Errores: `400 DATOS_INVALIDOS`, `409 EMAIL_DUPLICADO`.

### `POST /api/auth/login`
Público. Cuerpo `{ "email", "password" }`. `200 { "usuario": {...} }` y cookie de sesión. Errores: `401 CREDENCIALES_INVALIDAS` (igual para un correo inexistente), `429 DEMASIADOS_INTENTOS` tras 10 fallos en 15 minutos para ese correo.

### `POST /api/auth/logout`
Público. `204`. Borra la cookie.

### `POST /api/auth/demo`
Público. Abre una sesión de demostración de 2 horas, sin credenciales. `200 { "usuario": {... "rol": "demo" } }`. Errores: `404 DEMO_NO_DISPONIBLE` si `DEMO_HABILITADA` no es `true`.

### `GET /api/auth/yo`
Sesión. `200 { "usuario": {...} }`. Error: `401 NO_AUTENTICADO`.

### `PATCH /api/auth/yo`
Sesión. Cambia solo lo que se envía. La cuenta de demostración recibe `403 SIN_PERMISO`.

| Campo | Regla |
| :--- | :--- |
| `nombre` | Obligatorio si se envía, hasta 100 caracteres. |
| `avatarSemilla` | De 1 a 40 letras, números, guiones o guiones bajos; `null` vuelve al avatar por defecto. |
| `passwordNueva` + `passwordActual` | Misma regla que `password`; la actual debe ser correcta. |

`200 { "usuario": {...} }`. Al cambiar la contraseña, las demás sesiones de la cuenta se cierran y esta recibe una cookie nueva. Errores: `400 DATOS_INVALIDOS` (incluye "No hay cambios que aplicar" en `campos.general`).

## Estudiantes

Acceso: administrador o demo. Una cuenta normal recibe `403 SIN_PERMISO`; sin sesión, `401`.

### `GET /api/estudiantes`

| Parámetro | Descripción |
| :--- | :--- |
| `buscar` | Texto en nombre, apellido, nombre completo o correo (hasta 100). |
| `ciudad` | Coincidencia exacta (hasta 60). |
| `curso` | Identificador del curso. |
| `plan` | `Básico`, `Estándar` o `Premium`. |
| `estado` | `activo` o `inactivo`. |
| `pagina` | Entero positivo. Por defecto 1. |
| `limite` | De 1 a 100. Por defecto 12. |

`200 { "estudiantes": [...], "total": n, "pagina": n, "limite": n, "paginas": n }`. Un parámetro inválido da `400 DATOS_INVALIDOS` con el detalle por campo.

### `GET /api/estudiantes/:id`
`200 { "estudiante": {...} }`. Errores: `400 ID_INVALIDO`, `404 ESTUDIANTE_NO_ENCONTRADO`.

### `POST /api/estudiantes`

| Campo | Regla |
| :--- | :--- |
| `nombre`, `apellido` | Obligatorios, hasta 100 caracteres. |
| `email` | Correo válido, único sin distinguir mayúsculas. |
| `ciudad` | Obligatoria, hasta 60 caracteres. |
| `cursoId` | Identificador de un curso existente. |
| `plan` | `Básico`, `Estándar` o `Premium`. |
| `progreso` | Entero de 0 a 100. |
| `fechaInscripcion` | `AAAA-MM-DD`, real, desde 2023-01-01 y no futura. |
| `activo` | Verdadero o falso. Por defecto verdadero. |

`201 { "estudiante": { id, nombre, apellido, email, ciudad, curso: { id, nombre }, plan, montoUSD, progreso, fechaInscripcion, activo } }`. El monto sale del plan. Errores: `400 DATOS_INVALIDOS`, `409 EMAIL_DUPLICADO`, `409 DEMO_LIMITE` (solo demo).

### `PATCH /api/estudiantes/:id`
Edita solo los campos enviados, con las mismas reglas. Un cuerpo vacío da `400`. `200 { "estudiante": {...} }`. Errores: `400`, `404`, `409 EMAIL_DUPLICADO`.

### `DELETE /api/estudiantes/:id`
`204`. Error: `404 ESTUDIANTE_NO_ENCONTRADO`.

## Panel

### `GET /api/cursos`
Cualquier sesión. `200 { "cursos": [ { id, nombre, categoria, nivel, semanas, plan, precioUSD, instructor, descripcion, inscritos } ] }` con el número real de inscritos.

### `GET /api/resumen`
Cualquier sesión. `200 { total, activos, inactivos, progresoPromedio, porCiudad: [ { ciudad, total } ] }`. Solo números agregados, sin datos personales.

### `GET /api/reportes`
Administrador o demo. `200 { total, activos, completaron, progresoPromedio, ingresosUSD, porPlan, rangosProgreso, top, retencionPorcentaje }`: ingresos, completados, retención, estudiantes por plan, rangos de progreso y el Top 10.

## Cuentas

Solo administrador. La demo y las cuentas normales reciben `403 SIN_PERMISO`.

### `GET /api/usuarios`
`200 { "usuarios": [...] }` sin contraseñas.

### `PATCH /api/usuarios/:id`
Cuerpo con cualquiera de `nombre`, `email`, `rol` (`usuario` o `administrador`) y `password` (restablece la contraseña y cierra las sesiones de esa cuenta). `200 { "usuario": {...} }`. Errores: `400`, `404 USUARIO_NO_ENCONTRADO`, `409 EMAIL_DUPLICADO`, `409 ULTIMO_ADMINISTRADOR`.

### `DELETE /api/usuarios/:id`
`204`. Errores: `404`, `409 NO_AUTOELIMINAR`, `409 ULTIMO_ADMINISTRADOR`.
