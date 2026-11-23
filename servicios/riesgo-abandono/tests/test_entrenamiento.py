from datetime import date
from pathlib import Path

import numpy as np
import pytest

from app.entrenamiento import (
    MIN_POSITIVOS_CONCLUYENTE,
    DatosInsuficientes,
    cargar,
    construir,
    entrenar,
    entrenar_y_guardar,
    evaluar,
)
from tests.ayudas import escribir, generar

HOY = date(2026, 6, 1)
EJEMPLO = Path(__file__).resolve().parents[1] / "datos" / "ejemplo.json"


def matriz(registros):
    return construir(registros, HOY)


def test_con_una_senal_real_el_modelo_la_encuentra():
    x, y = matriz(generar(400, semilla=1))

    metricas = evaluar(x, y, permutaciones=10)

    assert metricas["concluyente"] is True
    assert metricas["auc_modelo"]["media"] > 0.8
    assert metricas["auc_modelo"]["media"] > metricas["auc_modelo_trivial"]


def test_con_las_etiquetas_mezcladas_no_aprende_nada():
    """Si esto diera bien, habría fuga de datos: el modelo vería las respuestas."""
    x, y = matriz(generar(400, semilla=2))

    metricas = evaluar(x, y, permutaciones=40)

    assert 0.45 < metricas["auc_al_azar"]["media"] < 0.55
    assert metricas["auc_modelo"]["media"] > metricas["auc_al_azar"]["percentil_95"]
    assert metricas["valor_p"] < 0.05


def test_sin_senal_tampoco_inventa_acierto():
    x, y = matriz(generar(400, semilla=3, con_senal=False))

    metricas = evaluar(x, y, permutaciones=40)

    assert 0.4 < metricas["auc_modelo"]["media"] < 0.62
    assert metricas["valor_p"] > 0.05


def test_con_pocos_abandonos_no_se_puede_evaluar():
    registros = generar(40, semilla=4)
    for r in registros:
        r["activo"] = True
    for r in registros[:2]:
        r.update(activo=False, progreso=10)
    x, y = matriz(registros)

    metricas = evaluar(x, y)

    assert metricas["evaluable"] is False
    assert metricas["concluyente"] is False


def test_los_datos_de_ejemplo_no_son_concluyentes():
    x, y = construir(cargar(EJEMPLO), HOY)

    metricas = evaluar(x, y)

    assert metricas["casos"] == 35
    assert metricas["positivos"] < MIN_POSITIVOS_CONCLUYENTE
    assert metricas["concluyente"] is False
    assert metricas["auc_al_azar"]["percentil_95"] > 0.6


def test_no_entrena_si_falta_una_clase():
    registros = generar(30, semilla=5)
    for r in registros:
        r["activo"] = True
    x, y = matriz(registros)

    with pytest.raises(DatosInsuficientes):
        entrenar(x, y)


def test_guarda_y_describe_el_modelo(tmp_path):
    ruta = escribir(tmp_path / "datos.json", generar(200, semilla=6))

    metadatos = entrenar_y_guardar(ruta, tmp_path / "modelo", HOY, permutaciones=10)

    assert (tmp_path / "modelo" / "modelo.joblib").exists()
    assert metadatos["caracteristicas"] == ["progreso", "antiguedad_meses", "ritmo", "plan"]
    assert metadatos["metricas"]["casos"] == 200
    assert np.isfinite(list(metadatos["coeficientes"].values())).all()
