# Automatización y análisis de datos

Dos formas de sacar más provecho de los datos de StudentScope MJ sin tocar su código:

* **n8n:** un reporte semanal y un aviso diario de estudiantes inactivos, por correo.
* **Power BI:** un tablero conectado a vistas de PostgreSQL pensadas para análisis.

Qué está probado y qué no:

* La lógica que arma los mensajes de n8n y las vistas de PostgreSQL tienen pruebas automáticas (`test/automatizacion.test.js` y `test/vistasBi.test.js`).
* Las tres plantillas de n8n se importaron y ejecutaron en n8n 2.48.7 contra la API local, con envío real de correo por Gmail (SMTP, puerto 465). Los números de los correos coinciden con los de la API. Los flujos se probaron ejecutándolos a mano; la hora programada no se esperó.
* El tablero de Power BI **no se construyó aquí**. Los pasos de abajo son los que hay que seguir y comprobar la primera vez.

---

## n8n

Las plantillas están en `docs/automatizacion/n8n/` y llegan desactivadas:

| Archivo | Cuándo corre | Qué hace |
| :--- | :--- | :--- |
| `reporte-semanal.json` | Lunes a las 8:00 | Pide `GET /api/reportes` y envía por correo el total de estudiantes, progreso, completados, retención, ingresos y desglose por plan y rango. |
| `aviso-inactivos.json` | Todos los días a las 8:00 | Pide los estudiantes inactivos y, si alguno dejó el curso sin terminarlo, envía la lista de menor a mayor progreso. Si no hay ninguno, no envía nada. |
| `reporte-demo.json` | A mano (botón Execute) | Igual que el reporte semanal, pero entra con la sesión de demostración (`POST /api/auth/demo`): no necesita cuenta de administrador ni contraseña. Sirve para enseñar la automatización sobre la demo pública. Requiere `DEMO_HABILITADA=true` en la API. |

El aviso de inactivos incluye nombre y correo de cada estudiante. Con datos de ejemplo no importa, pero con alumnos reales ese correo lleva datos personales: envíalo solo a quien deba verlos.

### 1. Crea una cuenta solo para n8n

No uses tu cuenta personal. Registra una cuenta nueva desde la aplicación (por ejemplo `automatizacion@tu-dominio.com`), entra con tu administrador, ve a **Cuentas** y cámbiale el rol a **administrador**. n8n necesita ese rol porque los reportes y la lista de estudiantes son solo para administradores.

### 2. Levanta n8n junto a la aplicación

Agrega este servicio a tu `docker-compose.yml`, en la sección `services`, y un volumen `n8n_datos` en `volumes`:

```yaml
  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:5678:5678"
    environment:
      GENERIC_TIMEZONE: America/Guatemala
      TZ: America/Guatemala
      N8N_BLOCK_ENV_ACCESS_IN_NODE: "false"
      STUDENTSCOPE_URL: http://api:3100
      STUDENTSCOPE_EMAIL: ${N8N_STUDENTSCOPE_EMAIL}
      STUDENTSCOPE_PASSWORD: ${N8N_STUDENTSCOPE_PASSWORD}
      AVISOS_REMITENTE: ${N8N_AVISOS_REMITENTE}
      AVISOS_DESTINO: ${N8N_AVISOS_DESTINO}
    volumes:
      - n8n_datos:/home/node/.n8n
    depends_on:
      - api
```

El puerto queda atado a `127.0.0.1`: n8n **no** se publica en internet. Para abrirlo desde tu computadora usa un túnel SSH (`ssh -L 5678:127.0.0.1:5678 usuario@servidor`) y entra a `http://localhost:5678`.

Agrega estas líneas al archivo `.env` del servidor con tus datos:

```
N8N_STUDENTSCOPE_EMAIL=automatizacion@tu-dominio.com
N8N_STUDENTSCOPE_PASSWORD=la-contraseña-de-esa-cuenta
N8N_AVISOS_REMITENTE=avisos@tu-dominio.com
N8N_AVISOS_DESTINO=tu-correo@ejemplo.com
```

Luego `docker compose up -d n8n`.

### 3. Importa las plantillas

En n8n: **Workflows**, el menú de los tres puntos, **Import from file**, y elige `reporte-semanal.json`; repite con `aviso-inactivos.json`.

### 4. Conecta el correo

En ambas plantillas, el nodo **Enviar correo** necesita una credencial **SMTP**. Con Gmail: activa la verificación en dos pasos, crea una contraseña de aplicación en la cuenta de Google, y en n8n crea la credencial con servidor `smtp.gmail.com`, puerto `465`, SSL activado, tu correo como usuario y esa contraseña de aplicación. Las plantillas no traen ninguna credencial guardada. Los correos salen sin la firma "sent automatically with n8n" (`appendAttribution: false`); n8n guarda la copia que importaste, así que si ya habías importado una versión anterior hay que importarla otra vez para quitarla.

Para probarlo en tu computadora sin tocar el servidor, `docs/automatizacion/n8n/probar-local.ps1` levanta un n8n aparte (puerto 5679 y su propia carpeta de datos) apuntado a la API local, con la cuenta de administrador de tu `.env`. Pon antes `AVISOS_REMITENTE` y `AVISOS_DESTINO` en la terminal si vas a enviar correos. La API debe estar en `127.0.0.1`: con `localhost` n8n puede resolver IPv6 y recibir "connection refused".

### 5. Pruébalas y actívalas

1. Abre cada flujo y pulsa **Execute workflow**. Debe llegar el correo. En `aviso-inactivos`, si no hay estudiantes inactivos sin terminar, no llega nada y el flujo termina en la rama vacía del nodo **¿Hay alguno?**: es lo esperado.
2. Si el nodo **Iniciar sesión** falla con `401`, revisa el correo y la contraseña de la cuenta. Si falla con `403`, esa cuenta no es administradora.
3. Cuando todo funcione, activa cada flujo con el interruptor **Active**.

Cada ejecución inicia una sesión nueva en la API (dura 8 horas) y no la cierra: son solo dos por día como máximo.

---

## Power BI

La base trae tres vistas de análisis (migración `006_vistas_bi.sql`). **No incluyen nombre, apellido ni correo**: para analizar no hacen falta datos personales.

| Vista | Una fila por | Columnas principales |
| :--- | :--- | :--- |
| `vw_bi_estudiantes` | Estudiante | `ciudad`, `curso`, `categoria`, `nivel`, `plan`, `monto_usd`, `progreso`, `fecha_inscripcion`, `mes_inscripcion`, `activo`, `estado` (`Completó`, `En curso` o `Abandonó`). |
| `vw_bi_cursos` | Curso | `inscritos`, `activos`, `completaron`, `progreso_promedio`, `ingresos_usd`. |
| `vw_bi_resumen_mensual` | Mes | `inscripciones`, `ingresos_usd`, `progreso_promedio`. |

### 1. Crea un usuario de solo lectura

Edita `docs/automatizacion/power-bi/crear-usuario-lectura.sql`, cambia `CAMBIA_ESTA_CLAVE` por una contraseña propia (sin subirla al repositorio) y ejecútalo en el servidor, en la carpeta del proyecto:

```bash
docker compose exec -T db psql -U $DB_USER -d $DB_NAME < docs/automatizacion/power-bi/crear-usuario-lectura.sql
```

Ese usuario solo puede leer las tres vistas: no ve las tablas, ni las cuentas, ni puede escribir (hay una prueba que lo comprueba).

### 2. Publica la base solo para tu computadora

En el `docker-compose.yml`, en el servicio `db`, agrega:

```yaml
    ports:
      - "127.0.0.1:5432:5432"
```

y ejecuta `docker compose up -d db`. El puerto queda disponible solo dentro del servidor. Desde tu computadora abre un túnel y déjalo abierto mientras uses Power BI:

```bash
ssh -L 5433:127.0.0.1:5432 usuario@servidor
```

### 3. Conecta Power BI Desktop

1. **Obtener datos**, **Base de datos PostgreSQL**.
2. Servidor `localhost:5433` y la base con el nombre de tu `DB_NAME`.
3. Modo **Importar**. Credenciales de tipo **Base de datos** con el usuario `bi_lectura` y su contraseña.
4. Marca las tres vistas `vw_bi_*` y **Cargar**.

Si Power BI pide un proveedor de PostgreSQL, instala **Npgsql** (lo ofrece el propio mensaje) y reinicia Power BI.

### 4. Medidas sugeridas

En la tabla `vw_bi_estudiantes`, **Nueva medida**:

```
Estudiantes = COUNTROWS(vw_bi_estudiantes)
Completaron = CALCULATE([Estudiantes], vw_bi_estudiantes[estado] = "Completó")
Abandonaron = CALCULATE([Estudiantes], vw_bi_estudiantes[estado] = "Abandonó")
Tasa de finalización = DIVIDE([Completaron], [Estudiantes])
Ingresos USD = SUM(vw_bi_estudiantes[monto_usd])
Progreso promedio = AVERAGE(vw_bi_estudiantes[progreso])
```

Páginas que funcionan bien con estos datos: tarjetas con las medidas de arriba, barras de `Estudiantes` por `curso` y por `ciudad`, anillo de `estado`, y una línea de `inscripciones` por `mes` desde `vw_bi_resumen_mensual`.

Actualizar el tablero: **Actualizar** en Power BI Desktop con el túnel abierto. Publicarlo en la nube de Power BI exigiría exponer la base o instalar una puerta de enlace, y no se hace aquí a propósito.
