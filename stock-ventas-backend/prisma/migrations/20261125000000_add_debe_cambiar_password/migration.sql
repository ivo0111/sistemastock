-- Marca de "contraseña inicial": el admin creado por el instalador arranca
-- con una contraseña generada y debe cambiarla en el primer inicio de sesión.
-- Para usuarios existentes queda en false (no se fuerza un cambio retroactivo).
ALTER TABLE "usuarios"
ADD COLUMN "debe_cambiar_password" BOOLEAN NOT NULL DEFAULT false;
