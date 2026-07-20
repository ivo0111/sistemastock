import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  const admin = await prisma.usuario.upsert({
    where: { usuario: "admin" },
    update: {},
    create: {
      nombre: "Administrador",
      usuario: "admin",
      passwordHash,
      rol: "ADMIN",
    },
  });

  console.log("Usuario admin creado:", admin.usuario, "(password: admin123 — cambiala)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
