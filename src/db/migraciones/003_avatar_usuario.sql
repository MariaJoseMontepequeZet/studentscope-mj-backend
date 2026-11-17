ALTER TABLE usuarios
  ADD COLUMN avatar_semilla VARCHAR(40)
  CHECK (avatar_semilla IS NULL OR avatar_semilla ~ '^[A-Za-z0-9_-]{1,40}$');
