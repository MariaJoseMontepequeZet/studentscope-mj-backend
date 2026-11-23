"""Entrenamiento y evaluación del modelo de riesgo de abandono.

El modelo es una regresión logística: se puede explicar (cada característica
tiene un peso) y no se sobreajusta con pocos datos. La evaluación es honesta:
se mide con validación cruzada repetida (nunca con los mismos datos con que se
entrena), se compara con un modelo trivial y con las etiquetas mezcladas al
azar, y se declara cuando los datos no alcanzan para concluir nada.
"""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import RepeatedStratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from .caracteristicas import NOMBRES, abandono, caracteristicas, leer_estudiante

VERSION_MODELO = "1.0.0"
MIN_POSITIVOS_CONCLUYENTE = 30
PLIEGUES = 3
REPETICIONES = 20
PERMUTACIONES = 100


class DatosInsuficientes(ValueError):
    """No hay casos de las dos clases para entrenar."""


def cargar(ruta: Path) -> list[dict]:
    return json.loads(Path(ruta).read_text(encoding="utf-8"))


def construir(datos: list[dict], hoy: date) -> tuple[np.ndarray, np.ndarray]:
    x = np.array([caracteristicas(leer_estudiante(d), hoy) for d in datos], dtype=float)
    y = np.array([abandono(d) for d in datos], dtype=int)
    return x, y


def crear_modelo() -> Pipeline:
    return Pipeline(
        [
            ("escala", StandardScaler()),
            ("logistica", LogisticRegression(class_weight="balanced", max_iter=1000)),
        ]
    )


def _auc_por_repeticion(
    x: np.ndarray, y: np.ndarray, columnas: list[int], semilla: int, repeticiones: int = REPETICIONES
) -> list[float]:
    """AUC de las predicciones hechas siempre sobre casos que el modelo no vio."""
    validacion = RepeatedStratifiedKFold(n_splits=PLIEGUES, n_repeats=repeticiones, random_state=semilla)
    resultados: list[float] = []
    predicciones = np.zeros(len(y))
    for i, (entrenamiento, prueba) in enumerate(validacion.split(x, y)):
        modelo = crear_modelo()
        modelo.fit(x[entrenamiento][:, columnas], y[entrenamiento])
        predicciones[prueba] = modelo.predict_proba(x[prueba][:, columnas])[:, 1]
        if (i + 1) % PLIEGUES == 0:
            resultados.append(float(roc_auc_score(y, predicciones)))
    return resultados


def _resumen(valores: list[float]) -> dict:
    return {"media": round(float(np.mean(valores)), 3), "desviacion": round(float(np.std(valores)), 3)}


def _distribucion_al_azar(x: np.ndarray, y: np.ndarray, semilla: int, permutaciones: int) -> list[float]:
    """AUC que saldría si las etiquetas no tuvieran relación con los datos.

    Con pocos casos positivos, una sola mezcla puede dar un AUC alto por pura
    casualidad; por eso se repite muchas veces y se mira toda la distribución.
    """
    generador = np.random.default_rng(semilla)
    todas = list(range(x.shape[1]))
    return [
        float(np.mean(_auc_por_repeticion(x, generador.permutation(y), todas, semilla + i, repeticiones=2)))
        for i in range(permutaciones)
    ]


def evaluar(x: np.ndarray, y: np.ndarray, semilla: int = 0, permutaciones: int = PERMUTACIONES) -> dict:
    """Mide el modelo y lo compara con referencias que no saben nada."""
    positivos = int(y.sum())
    base = {
        "casos": int(len(y)),
        "positivos": positivos,
        "negativos": int(len(y) - positivos),
        "concluyente": positivos >= MIN_POSITIVOS_CONCLUYENTE,
        "minimo_positivos_para_concluir": MIN_POSITIVOS_CONCLUYENTE,
    }
    if positivos < PLIEGUES or len(y) - positivos < PLIEGUES:
        return {**base, "evaluable": False}

    todas = list(range(x.shape[1]))
    auc_modelo = _resumen(_auc_por_repeticion(x, y, todas, semilla))
    azar = _distribucion_al_azar(x, y, semilla, permutaciones)
    como_el_modelo_o_mejor = sum(1 for valor in azar if valor >= auc_modelo["media"])
    return {
        **base,
        "evaluable": True,
        "validacion": f"{PLIEGUES} pliegues estratificados repetidos {REPETICIONES} veces",
        "auc_modelo": auc_modelo,
        "auc_solo_progreso": _resumen(_auc_por_repeticion(x, y, [NOMBRES.index("progreso")], semilla)),
        "auc_modelo_trivial": 0.5,
        "auc_al_azar": {
            "permutaciones": permutaciones,
            "media": round(float(np.mean(azar)), 3),
            "percentil_95": round(float(np.percentile(azar, 95)), 3),
        },
        "valor_p": round((como_el_modelo_o_mejor + 1) / (permutaciones + 1), 3),
    }


def entrenar(x: np.ndarray, y: np.ndarray) -> Pipeline:
    if y.sum() == 0 or y.sum() == len(y):
        raise DatosInsuficientes("Hacen falta estudiantes que abandonaron y estudiantes que no")
    modelo = crear_modelo()
    modelo.fit(x, y)
    return modelo


def coeficientes(modelo: Pipeline) -> dict[str, float]:
    pesos = modelo.named_steps["logistica"].coef_[0]
    return {nombre: round(float(peso), 3) for nombre, peso in zip(NOMBRES, pesos, strict=True)}


def guardar(modelo: Pipeline, metadatos: dict, carpeta: Path) -> None:
    carpeta = Path(carpeta)
    carpeta.mkdir(parents=True, exist_ok=True)
    joblib.dump(modelo, carpeta / "modelo.joblib")
    (carpeta / "metadatos.json").write_text(json.dumps(metadatos, ensure_ascii=False, indent=2), encoding="utf-8")


def cargar_modelo(carpeta: Path) -> tuple[Pipeline, dict]:
    carpeta = Path(carpeta)
    modelo = joblib.load(carpeta / "modelo.joblib")
    metadatos = json.loads((carpeta / "metadatos.json").read_text(encoding="utf-8"))
    return modelo, metadatos


def entrenar_y_guardar(
    ruta_datos: Path, carpeta: Path, hoy: date, semilla: int = 0, permutaciones: int = PERMUTACIONES
) -> dict:
    datos = cargar(ruta_datos)
    x, y = construir(datos, hoy)
    metricas = evaluar(x, y, semilla, permutaciones)
    modelo = entrenar(x, y)
    metadatos = {
        "version": VERSION_MODELO,
        "entrenado_el": hoy.isoformat(),
        "caracteristicas": NOMBRES,
        "coeficientes": coeficientes(modelo),
        "etiqueta": "inactivo y con progreso menor a 100",
        "metricas": metricas,
    }
    guardar(modelo, metadatos, carpeta)
    return metadatos


def main() -> None:
    analizador = argparse.ArgumentParser(description="Entrena el modelo de riesgo de abandono")
    analizador.add_argument("--datos", default="datos/ejemplo.json", help="JSON con los estudiantes")
    analizador.add_argument("--salida", default="modelo", help="Carpeta donde se guarda el modelo")
    analizador.add_argument("--fecha", default=None, help="Fecha de referencia AAAA-MM-DD (por defecto, hoy)")
    argumentos = analizador.parse_args()

    hoy = date.fromisoformat(argumentos.fecha) if argumentos.fecha else date.today()
    metadatos = entrenar_y_guardar(Path(argumentos.datos), Path(argumentos.salida), hoy)
    print(json.dumps(metadatos, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
