# Riesgo de abandono

Servicio pequeño en Python (FastAPI y scikit-learn) que estima qué tan probable es que un estudiante abandone su curso. La API de StudentScope MJ lo consulta en `GET /api/estudiantes/:id/riesgo`.

## Léelo antes de confiar en él

Los datos de ejemplo del proyecto tienen 35 estudiantes y **solo 3 abandonos**. Con tan pocos casos el modelo no puede demostrar que acierta, y el servicio lo dice en cada respuesta (`concluyente: false` y un `aviso`). Es una demostración de cómo se construiría y evaluaría el modelo, no una herramienta para decidir sobre personas. Con datos reales (al menos 30 abandonos) la misma tubería da métricas que sí se pueden creer.

Dos decisiones que importan:

* **Qué es abandonar.** Se considera abandono estar inactivo **y** no haber llegado al 100 % del curso. Estar inactivo con el curso completo es haber terminado. Es una aproximación: los datos no guardan cuándo fue el último acceso ni el motivo de la inactividad.
* **Cómo se mide.** Nunca con los mismos datos con que se entrena: validación cruzada estratificada repetida (3 pliegues, 20 veces). Se compara con un modelo trivial (AUC 0,5), con un modelo que solo mira el progreso, y con el azar: se repite la evaluación 100 veces con las etiquetas mezcladas para ver qué AUC sale cuando no hay nada que aprender, y de ahí sale un valor p.

## Resultado con los datos de ejemplo

| Medida | Valor |
| :--- | :--- |
| Estudiantes / abandonos | 35 / 3 |
| AUC del modelo | 0,90 (desviación 0,02) |
| AUC solo con el progreso | 0,82 |
| AUC por azar | media 0,48, percentil 95 en 0,84 |
| Valor p | 0,03 |
| ¿Concluyente? | No: faltan casos |

El AUC del modelo supera por poco el percentil 95 del azar. Con 3 casos positivos eso es un indicio, no una prueba.

## Cómo funciona

El modelo es una regresión logística, que se puede explicar: cada característica tiene un peso. Usa cuatro:

| Característica | Qué es |
| :--- | :--- |
| `progreso` | Porcentaje avanzado del curso. |
| `antiguedad_meses` | Meses desde la inscripción (mínimo 1). |
| `ritmo` | Progreso dividido entre la antigüedad: no es lo mismo llegar al 60 % en un mes que en un año. |
| `plan` | Básico 0, Estándar 1, Premium 2. |

Cada respuesta incluye los tres factores que más pesaron en esa estimación.

## Uso

Con Python 3.13 o superior:

```bash
cd servicios/riesgo-abandono
python -m venv .venv
.venv\Scripts\activate          # en Linux o Mac: source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
python -m app.entrenamiento     # entrena con datos/ejemplo.json y muestra las métricas
uvicorn app.servicio:app --port 8000
```

Si no hay modelo guardado, el servicio entrena uno al arrancar con `datos/ejemplo.json` (tarda un par de segundos).

### Entrenar con tus propios datos

El archivo es una lista JSON con `progreso`, `plan`, `fechaInscripcion` y `activo` por estudiante, la misma forma que `GET /api/estudiantes`:

```bash
python -m app.entrenamiento --datos mis-estudiantes.json --salida modelo
```

### Variables

| Variable | Descripción |
| :--- | :--- |
| `MODELO_DIR` | Carpeta donde se guarda el modelo. Por defecto `modelo`. |
| `DATOS_ENTRENAMIENTO` | Datos con los que entrena si no hay modelo. Por defecto `datos/ejemplo.json`. |

## Endpoints

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| GET | `/salud` | `200 { "estado": "ok", "version_modelo": "1.0.0" }`. |
| GET | `/modelo` | Versión, pesos y métricas completas del modelo. |
| POST | `/riesgo` | Estima el riesgo de un estudiante. |

`POST /riesgo` recibe `{ "progreso": 30, "fechaInscripcion": "2025-12-01", "plan": "Básico" }` y responde:

```json
{
  "probabilidad": 0.81,
  "nivel": "alto",
  "factores": [
    { "caracteristica": "Plan contratado", "aporte": 1.2, "efecto": "aumenta el riesgo" }
  ],
  "concluyente": false,
  "aviso": "Estimación orientativa: el modelo se entrenó con 3 casos de abandono y se necesitan al menos 30 para medir su acierto.",
  "version_modelo": "1.0.0"
}
```

`nivel` es `bajo` por debajo de 0,34, `medio` hasta 0,67 y `alto` desde ahí. Datos inválidos responden `400` con `{ "error": "...", "codigo": "DATOS_INVALIDOS" }`.

## Docker

```bash
docker build -t studentscope-riesgo .
docker run -p 8000:8000 studentscope-riesgo
```

El contenedor corre sin privilegios de administrador y tiene un `HEALTHCHECK` sobre `/salud`.

## Pruebas

33 pruebas con `pytest`. Las que más importan:

* Con datos que sí tienen una señal conocida, el modelo la encuentra y supera el percentil 95 del azar.
* Con datos sin señal, no inventa acierto (valor p alto).
* Los datos de ejemplo se declaran no concluyentes.
* Una evaluación con la probabilidad invertida hace fallar las pruebas de señal (se comprobó).
* Los datos inválidos (progreso fuera de rango, plan desconocido, fecha futura o imposible) se rechazan con `400`.

Los datos que generan las pruebas están inventados solo para probar el código y no se usan para entrenar el modelo real.
