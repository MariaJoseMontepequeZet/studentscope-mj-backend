"""Datos inventados SOLO para probar el código: tienen una señal conocida a propósito."""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

import numpy as np

PLANES = ["Básico", "Estándar", "Premium"]


def generar(n: int, semilla: int = 1, con_senal: bool = True) -> list[dict]:
    rng = np.random.default_rng(semilla)
    registros = []
    for _ in range(n):
        progreso = int(rng.integers(0, 101))
        probabilidad = 1 / (1 + np.exp(0.08 * (progreso - 40))) if con_senal else 0.3
        abandona = bool(rng.random() < probabilidad)
        registros.append(
            {
                "progreso": progreso,
                "plan": PLANES[int(rng.integers(0, 3))],
                "fechaInscripcion": (date(2023, 1, 1) + timedelta(days=int(rng.integers(0, 900)))).isoformat(),
                "activo": not abandona,
            }
        )
    return registros


def escribir(ruta: Path, registros: list[dict]) -> Path:
    ruta.write_text(json.dumps(registros), encoding="utf-8")
    return ruta
