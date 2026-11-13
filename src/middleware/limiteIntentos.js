const LIMITE_DE_CLAVES = 10000;

export function crearLimiteIntentos({ maximo = 10, ventanaMs = 15 * 60 * 1000, ahora = Date.now } = {}) {
  const registros = new Map();

  function vigente(clave) {
    const registro = registros.get(clave);
    if (!registro) return null;
    if (registro.expira <= ahora()) {
      registros.delete(clave);
      return null;
    }
    return registro;
  }

  function podar() {
    if (registros.size < LIMITE_DE_CLAVES) return;
    for (const clave of registros.keys()) vigente(clave);
  }

  return {
    bloqueado(clave) {
      const registro = vigente(clave);
      return registro !== null && registro.cuenta >= maximo;
    },

    registrarFallo(clave) {
      podar();
      const registro = vigente(clave) ?? { cuenta: 0, expira: ahora() + ventanaMs };
      registro.cuenta += 1;
      registros.set(clave, registro);
    },

    limpiar(clave) {
      registros.delete(clave);
    }
  };
}
