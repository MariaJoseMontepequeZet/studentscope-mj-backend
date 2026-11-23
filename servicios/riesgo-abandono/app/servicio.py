"""API HTTP del modelo de riesgo de abandono."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Callable

import numpy as np
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .caracteristicas import NOMBRES, DatosInvalidos, caracteristicas, leer_estudiante
from .entrenamiento import PERMUTACIONES, cargar_modelo, entrenar_y_guardar

UMBRAL_MEDIO = 0.34
UMBRAL_ALTO = 0.67

ETIQUETAS = {
    "progreso": "Progreso del curso",
    "antiguedad_meses": "Meses desde la inscripción",
    "ritmo": "Ritmo de avance por mes",
    "plan": "Plan contratado",
}


def nivel(probabilidad: float) -> str:
    if probabilidad >= UMBRAL_ALTO:
        return "alto"
    if probabilidad >= UMBRAL_MEDIO:
        return "medio"
    return "bajo"


def aviso(metadatos: dict) -> str | None:
    metricas = metadatos["metricas"]
    if metricas["concluyente"]:
        return None
    return (
        f"Estimación orientativa: el modelo se entrenó con {metricas['positivos']} casos de abandono "
        f"y se necesitan al menos {metricas['minimo_positivos_para_concluir']} para medir su acierto."
    )


def factores(modelo, valores: list[float]) -> list[dict]:
    """Cuánto aporta cada característica a la probabilidad, de mayor a menor efecto."""
    escala = modelo.named_steps["escala"]
    pesos = modelo.named_steps["logistica"].coef_[0]
    estandarizados = (np.asarray(valores) - escala.mean_) / escala.scale_
    aportes = pesos * estandarizados
    orden = sorted(range(len(NOMBRES)), key=lambda i: abs(aportes[i]), reverse=True)
    return [
        {
            "caracteristica": ETIQUETAS[NOMBRES[i]],
            "aporte": round(float(aportes[i]), 3),
            "efecto": "aumenta el riesgo" if aportes[i] > 0 else "reduce el riesgo",
        }
        for i in orden[:3]
    ]


def crear_app(
    carpeta_modelo: Path | None = None,
    datos_entrenamiento: Path | None = None,
    hoy: Callable[[], date] = date.today,
    permutaciones: int = PERMUTACIONES,
) -> FastAPI:
    carpeta = Path(carpeta_modelo or os.environ.get("MODELO_DIR", "modelo"))
    datos = Path(datos_entrenamiento or os.environ.get("DATOS_ENTRENAMIENTO", "datos/ejemplo.json"))

    @asynccontextmanager
    async def ciclo(app: FastAPI):
        if not (carpeta / "modelo.joblib").exists():
            entrenar_y_guardar(datos, carpeta, hoy(), permutaciones=permutaciones)
        app.state.modelo, app.state.metadatos = cargar_modelo(carpeta)
        yield

    app = FastAPI(title="Riesgo de abandono de StudentScope MJ", version="1.0.0", lifespan=ciclo)

    @app.exception_handler(DatosInvalidos)
    async def datos_invalidos(_: Request, error: DatosInvalidos):
        return JSONResponse(status_code=400, content={"error": str(error), "codigo": "DATOS_INVALIDOS"})

    @app.get("/salud")
    def salud(request: Request):
        return {"estado": "ok", "version_modelo": request.app.state.metadatos["version"]}

    @app.get("/modelo")
    def modelo_actual(request: Request):
        return request.app.state.metadatos

    @app.post("/riesgo")
    def riesgo(estudiante: dict, request: Request):
        modelo = request.app.state.modelo
        metadatos = request.app.state.metadatos
        valores = caracteristicas(leer_estudiante(estudiante), hoy())
        probabilidad = float(modelo.predict_proba([valores])[0][1])
        return {
            "probabilidad": round(probabilidad, 3),
            "nivel": nivel(probabilidad),
            "factores": factores(modelo, valores),
            "concluyente": metadatos["metricas"]["concluyente"],
            "aviso": aviso(metadatos),
            "version_modelo": metadatos["version"],
        }

    return app


app = crear_app()
