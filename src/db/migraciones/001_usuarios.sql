CREATE TABLE usuarios (
  id BIGSERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL CHECK (char_length(btrim(nombre)) > 0),
  email VARCHAR(254) NOT NULL,
  password_hash TEXT NOT NULL,
  rol VARCHAR(20) NOT NULL DEFAULT 'usuario' CHECK (rol IN ('usuario', 'administrador')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX usuarios_email_unico ON usuarios (lower(email));
CREATE INDEX usuarios_rol_idx ON usuarios (rol);
