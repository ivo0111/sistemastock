import crypto from "crypto";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PASSWORD_POR_DEFECTO_VIEJA = "admin123";
const LONGITUD_PASSWORD_GENERADA = 16;

// Alfabeto sin caracteres ambiguos (0/O, 1/l/I) y con símbolos para que la
// contraseña generada sea aceptable para cualquier política razonable.
const ALFABETO_PASSWORD =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+-_=?";

function generarPasswordAleatoria(longitud = LONGITUD_PASSWORD_GENERADA): string {
  const bytes = crypto.randomBytes(longitud * 2);
  let password = "";
  for (let i = 0; password.length < longitud && i < bytes.length; i++) {
    password += ALFABETO_PASSWORD[bytes[i] % ALFABETO_PASSWORD.length];
  }
  return password;
}

async function main() {
  // El instalador genera (o pide) la contraseña y la pasa por variable de
  // entorno. Si el seed se corre a mano sin esa variable, genera una y la
  // muestra por consola para no volver nunca a una contraseña fija.
  const passwordDesdeEntorno = process.env.ADMIN_PASSWORD?.trim();
  const password = passwordDesdeEntorno || generarPasswordAleatoria();
  const passwordGeneradaAca = !passwordDesdeEntorno;

  const passwordHash = await bcrypt.hash(password, 10);
  const adminExistente = await prisma.usuario.findUnique({ where: { usuario: "admin" } });

  // Instalaciones viejas quedaron con admin/admin123. Si el seed se vuelve a
  // correr, se rota esa contraseña insegura y se obliga el cambio al ingresar.
  const usaPasswordVieja =
    adminExistente !== null &&
    (await bcrypt.compare(PASSWORD_POR_DEFECTO_VIEJA, adminExistente.passwordHash));

  // El instalador siempre define ADMIN_PASSWORD (pide una o genera una): en ese
  // caso la contraseña del instalador es la que manda, aun si el admin ya
  // existía, para que el archivo de credenciales que muestra el instalador sea
  // válido. Sin ADMIN_PASSWORD (seed manual), se conserva la contraseña actual
  // salvo que sea la insegura admin123, que se rota.
  const aplicaPassword = adminExistente === null || usaPasswordVieja || Boolean(passwordDesdeEntorno);

  const admin = await prisma.usuario.upsert({
    where: { usuario: "admin" },
    update: aplicaPassword
      ? { passwordHash, debeCambiarPassword: true }
      : {},
    create: {
      nombre: "Administrador",
      usuario: "admin",
      passwordHash,
      rol: "ADMIN",
      debeCambiarPassword: true,
    },
  });

  if (!aplicaPassword) {
    console.log(
      "Usuario admin ya existente: se conserva su contraseña actual (no se sobrescribe)."
    );
  } else {
    console.log("Usuario admin creado/actualizado con contraseña segura.");
    console.log("Se pedirá cambiarla en el primer inicio de sesión.");
    if (passwordGeneradaAca) {
      // Solo se imprime cuando el seed se ejecutó a mano sin ADMIN_PASSWORD.
      // Si el instalador pasó la contraseña por entorno, no se escribe en el
      // log de instalación.
      console.log("");
      console.log("  Usuario:    admin");
      console.log(`  Contraseña: ${password}`);
      console.log("");
      console.log("  Guardala en un lugar seguro y cambiala al ingresar.");
    }
  }

  console.log("Usuario admin listo:", admin.usuario);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
