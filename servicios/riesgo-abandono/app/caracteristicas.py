"""Convierte un estudiante en las cifras que usa el modelo.

Todo lo que depende de la fecha recibe `hoy` como argumento para que los
resultados sean reproducibles y se puedan probar.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

PLANES = {"Básico": 0, "Estándar": 1, "Premium": 2}
NOMBRES = ["progreso", "antiguedad_meses", "ritmo", "plan"]
DIAS_POR_MES = 30.4375


class DatosInvalidos(ValueError):
    """El estudiante no tiene los datos mínimos o alguno no es válido."""


@dataclass(frozen=True)
class Estudiante:
    progreso: int
    fecha_inscripcion: date
    plan: str


def leer_estudiante(datos: dict) -> Estudiante:
    """Valida un registro tal como lo entrega la API del backend."""
    try:
        progreso = datos["progreso"]
        fecha = datos.get("fechaInscripcion", datos.get("fecha_inscripcion"))
        plan = datos["plan"]
    except KeyError as error:
        raise DatosInvalidos(f"Falta el campo {error.args[0]}") from None

    if isinstance(progreso, bool) or not isinstance(progreso, int) or not 0 <= progreso <= 100:
        raise DatosInvalidos("El progreso debe ser un entero entre 0 y 100")
    if plan not in PLANES:
        raise DatosInvalidos(f"El plan debe ser uno de: {', '.join(PLANES)}")
    try:
        fecha_inscripcion = date.fromisoformat(fecha)
    except (TypeError, ValueError):
        raise DatosInvalidos("La fecha de inscripción debe tener el formato AAAA-MM-DD") from None
    return Estudiante(progreso=progreso, fecha_inscripcion=fecha_inscripcion, plan=plan)


def caracteristicas(estudiante: Estudiante, hoy: date) -> list[float]:
    """Devuelve [progreso, antigüedad en meses, ritmo, plan].

    El ritmo es el progreso por mes de antigüedad: dos personas con el mismo
    avance no están igual de en riesgo si una lo logró en un mes y la otra en
    un año.
    """
    if estudiante.fecha_inscripcion > hoy:
        raise DatosInvalidos("La fecha de inscripción no puede ser futura")
    meses = max((hoy - estudiante.fecha_inscripcion).days / DIAS_POR_MES, 1.0)
    return [
        float(estudiante.progreso),
        meses,
        estudiante.progreso / meses,
        float(PLANES[estudiante.plan]),
    ]


def abandono(datos: dict) -> bool:
    """Etiqueta del entrenamiento: inactivo y sin haber completado el curso.

    Estar inactivo con el curso al 100 % es haber terminado, no abandonar, así
    que no cuenta. Esta es una aproximación: los datos no registran cuándo fue
    el último acceso ni por qué una persona quedó inactiva.
    """
    return (not datos["activo"]) and datos["progreso"] < 100
