from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.servicio import crear_app
from tests.ayudas import escribir, generar

HOY = date(2026, 6, 1)
EJEMPLO = Path(__file__).resolve().parents[1] / "datos" / "ejemplo.json"
ESTUDIANTE = {"progreso": 30, "fechaInscripcion": "2025-12-01", "plan": "Básico"}


@pytest.fixture
def con_ejemplo(tmp_path):
    with TestClient(crear_app(tmp_path / "m", EJEMPLO, lambda: HOY, permutaciones=10)) as cliente:
        yield cliente


@pytest.fixture
def con_senal(tmp_path):
    datos = escribir(tmp_path / "d.json", generar(400, semilla=7))
    with TestClient(crear_app(tmp_path / "m", datos, lambda: HOY, permutaciones=10)) as cliente:
        yield cliente


def test_salud(con_ejemplo):
    respuesta = con_ejemplo.get("/salud")

    assert respuesta.status_code == 200
    assert respuesta.json()["estado"] == "ok"


def test_el_modelo_declara_que_no_es_concluyente(con_ejemplo):
    metadatos = con_ejemplo.get("/modelo").json()

    assert metadatos["metricas"]["concluyente"] is False
    assert metadatos["metricas"]["positivos"] == 3


def test_la_respuesta_trae_la_estimacion_y_el_aviso(con_ejemplo):
    respuesta = con_ejemplo.post("/riesgo", json=ESTUDIANTE)

    cuerpo = respuesta.json()
    assert respuesta.status_code == 200
    assert 0 <= cuerpo["probabilidad"] <= 1
    assert cuerpo["nivel"] in {"bajo", "medio", "alto"}
    assert cuerpo["concluyente"] is False
    assert "orientativa" in cuerpo["aviso"]
    assert len(cuerpo["factores"]) == 3


def test_con_datos_suficientes_no_hay_aviso(con_senal):
    cuerpo = con_senal.post("/riesgo", json=ESTUDIANTE).json()

    assert cuerpo["concluyente"] is True
    assert cuerpo["aviso"] is None


def test_menos_progreso_significa_mas_riesgo(con_senal):
    bajo = con_senal.post("/riesgo", json={**ESTUDIANTE, "progreso": 5}).json()
    alto = con_senal.post("/riesgo", json={**ESTUDIANTE, "progreso": 95}).json()

    assert bajo["probabilidad"] > alto["probabilidad"]
    assert bajo["nivel"] == "alto"
    assert alto["nivel"] == "bajo"


@pytest.mark.parametrize(
    "cuerpo",
    [
        {},
        {"progreso": 200, "fechaInscripcion": "2025-12-01", "plan": "Básico"},
        {"progreso": 10, "fechaInscripcion": "2027-01-01", "plan": "Básico"},
        {"progreso": 10, "fechaInscripcion": "2025-12-01", "plan": "Oro"},
    ],
)
def test_rechaza_datos_invalidos(con_ejemplo, cuerpo):
    respuesta = con_ejemplo.post("/riesgo", json=cuerpo)

    assert respuesta.status_code == 400
    assert respuesta.json()["codigo"] == "DATOS_INVALIDOS"


def test_reutiliza_el_modelo_guardado(tmp_path):
    datos = escribir(tmp_path / "d.json", generar(100, semilla=8))
    with TestClient(crear_app(tmp_path / "m", datos, lambda: HOY, permutaciones=10)) as primero:
        version = primero.get("/modelo").json()["entrenado_el"]
    datos.unlink()

    with TestClient(crear_app(tmp_path / "m", datos, lambda: date(2030, 1, 1))) as segundo:
        assert segundo.get("/modelo").json()["entrenado_el"] == version
