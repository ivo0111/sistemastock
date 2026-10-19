import "dotenv/config";
import { app } from "./app";
import { cerrarBrowser } from "./modules/ventas/comprobante.pdf";

// Falla rápido si falta el secreto: sin él no se puede firmar ni verificar
// tokens, y el sistema quedaría inutilizable (login con 500, resto con 401).
if (!process.env.JWT_SECRET) {
  console.error(
    "Falta la variable de entorno JWT_SECRET. Definila en .env (ver .env.example) antes de arrancar el servidor."
  );
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3000);
// Por defecto solo escucha en localhost: el API no debe ser accesible desde
// otros equipos de la LAN. Para exponerlo (con cuidado), HOST=0.0.0.0 en .env.
const HOST = process.env.HOST || "127.0.0.1";

const server = app.listen(PORT, HOST, () => {
  console.log(`Servidor corriendo en http://${HOST}:${PORT}`);
});

// Apagado ordenado: además de dejar de aceptar conexiones, cierra el navegador
// de Puppeteer que se hubiera abierto para generar PDFs (si no, el proceso de
// Chrome queda huérfano hasta matarlo a mano).
function apagar(signal: string) {
  console.log(`\n${signal} recibido: apagando servidor...`);
  const fuerza = setTimeout(() => process.exit(1), 5000);
  fuerza.unref();

  server.close(async () => {
    await cerrarBrowser();
    console.log("Servidor apagado.");
    process.exit(0);
  });
}

process.on("SIGINT", () => apagar("SIGINT"));
process.on("SIGTERM", () => apagar("SIGTERM"));
