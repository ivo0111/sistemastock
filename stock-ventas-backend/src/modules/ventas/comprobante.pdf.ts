/// <reference lib="dom" />
import fs from "fs";
import { AppError } from "../../utils/AppError";
import type { Browser } from "puppeteer-core";

// Puppeteer solo para generar el PDF del comprobante: se usa puppeteer-core
// (sin Chromium embebido — ~150 MB menos al instalar) apuntando a un navegador
// ya instalado en la máquina (Chrome o Edge, Edge viene con Windows 10/11).
// Se puede sobreescribir con PDF_BROWSER_PATH en .env.
let browserPromise: Promise<Browser> | null = null;

function candidatas(): Array<string | undefined> {
  const propias = [process.env.PDF_BROWSER_PATH];
  if (process.platform === "win32") {
    return propias.concat([
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ]);
  }
  if (process.platform === "darwin") {
    return propias.concat([
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]);
  }
  return propias.concat([
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
  ]);
}

function encontrarNavegador(): string | null {
  for (const ruta of candidatas()) {
    if (ruta && fs.existsSync(ruta)) return ruta;
  }
  return null;
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      // Import perezoso: puppeteer-core solo se carga cuando alguien pide un PDF.
      const puppeteer = await import("puppeteer-core");
      const executablePath = encontrarNavegador();
      if (!executablePath) {
        throw new AppError(
          "PDF_NO_DISPONIBLE",
          "No se encontró un navegador (Chrome/Edge) para generar el PDF. " +
            "Instalá Chrome o definí PDF_BROWSER_PATH en .env con la ruta del ejecutable.",
          503
        );
      }
      return puppeteer.launch({
        headless: true,
        executablePath,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
    })().catch((err) => {
      // Si falló, el próximo intento vuelve a probar (no cachear el error).
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

export async function generarPdfComprobante(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: "load", timeout: 15000 });

    await page.evaluate(() => {
      document.querySelectorAll(".no-print").forEach((el) => el.remove());
    });

    const pdfUint8 = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
    });

    return Buffer.from(pdfUint8);
  } finally {
    await page.close();
  }
}

/**
 * Cierra el navegador al apagar el servidor: sin esto, el proceso de Chrome
 * quedaba vivo indefinidamente (el singleton nunca se cerraba).
 */
export async function cerrarBrowser(): Promise<void> {
  if (!browserPromise) return;
  try {
    const browser = await browserPromise;
    await browser.close();
  } catch {
    // El navegador ya no estaba: nada que hacer.
  } finally {
    browserPromise = null;
  }
}
