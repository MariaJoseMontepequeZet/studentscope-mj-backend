from datetime import date

import pytest

from app.caracteristicas import DatosInvalidos, abandono, caracteristicas, leer_estudiante

HOY = date(2026, 6, 1)


def registro(**cambios):
    base = {"progreso": 60, "fechaInscripcion": "2025-12-01", "plan": "Premium"}
    return {**base, **cambios}


def test_calcula_las_cuatro_caracteristicas():
    valores = caracteristicas(leer_estudiante(registro()), HOY)

    progreso, meses, ritmo, plan = valores
    assert progreso == 60
    assert meses == pytest.approx(6.0, abs=0.05)
    assert ritmo == pytest.approx(progreso / meses)
    assert plan == 2


def test_la_antiguedad_nunca_baja_de_un_mes():
    valores = caracteristicas(leer_estudiante(registro(fechaInscripcion="2026-06-01")), HOY)

    assert valores[1] == 1.0
    assert valores[2] == 60.0


@pytest.mark.parametrize(
    "cambios",
    [
        {"progreso": 101},
        {"progreso": -1},
        {"progreso": 50.5},
        {"progreso": True},
        {"progreso": "60"},
        {"plan": "Oro"},
        {"fechaInscripcion": "2023-02-30"},
        {"fechaInscripcion": "ayer"},
        {"fechaInscripcion": None},
    ],
)
def test_rechaza_datos_invalidos(cambios):
    with pytest.raises(DatosInvalidos):
        leer_estudiante(registro(**cambios))


@pytest.mark.parametrize("campo", ["progreso", "plan", "fechaInscripcion"])
def test_rechaza_si_falta_un_campo(campo):
    datos = registro()
    del datos[campo]
    with pytest.raises(DatosInvalidos):
        leer_estudiante(datos)


def test_rechaza_una_fecha_futura():
    with pytest.raises(DatosInvalidos):
        caracteristicas(leer_estudiante(registro(fechaInscripcion="2026-07-01")), HOY)


def test_abandono_es_estar_inactivo_sin_haber_terminado():
    assert abandono({"activo": False, "progreso": 45}) is True
    assert abandono({"activo": False, "progreso": 100}) is False
    assert abandono({"activo": True, "progreso": 10}) is False
