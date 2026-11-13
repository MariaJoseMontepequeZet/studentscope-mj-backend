export class ErrorApi extends Error {
  constructor(estado, codigo, mensaje, campos) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.campos = campos;
  }
}
