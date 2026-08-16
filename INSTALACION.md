# Guia de instalacion — Sistema de Gestion de Stock y Ventas

Esta guia esta pensada para alguien sin conocimientos tecnicos. Segui los pasos
en orden.

La instalacion se hace **una sola vez**. Despues, el uso diario es un doble
clic en `Iniciar Sistema.bat` (ver el paso 3).

---

## 1. Instalar PostgreSQL

El sistema necesita PostgreSQL como base de datos. Si ya lo tenes instalado,
salteate este paso.

1. Entrá a [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/).
2. Hace clic en el link del instalador (te lleva al sitio de EnterpriseDB,
   que es el instalador oficial recomendado por PostgreSQL para Windows).
3. Descarga la version mas reciente (16.x o superior).
4. Ejecuta el instalador. Durante la instalacion:
   - Deja tildados todos los componentes por default (PostgreSQL Server,
     pgAdmin, Command Line Tools).
   - **Puerto**: dejalo en el default, `5432`.
   - **Contrasena del superusuario `postgres`**: te va a pedir que definas
     una contrasena. **Anotala en un lugar seguro** — la vas a necesitar en
     el paso 2.
   - Al final te va a preguntar si queres correr "Stack Builder": podes
     saltearlo (no hace falta para este sistema).
5. Verifica que el instalador haya agregado `psql` (la herramienta de linea
   de comandos de Postgres) al PATH del sistema — con la instalacion
   estandar esto ya queda hecho solo. Para confirmarlo, abri una consola
   **nueva** (`Win + R` → `cmd`) y ejecuta:
   ```
   psql --version
   ```
   Si te muestra una version, esta todo bien. Si te dice "no se reconoce el
   comando", reinstala y asegurate de no destildar "Add PostgreSQL to PATH"
   (en instalaciones recientes esto es automatico).

---

## 2. Ejecutar el instalador

1. Busca el archivo `SistemaStock-Setup.exe` en la carpeta
   `installer\Output\` del proyecto.
2. Hace doble clic para ejecutarlo. Si Windows muestra una advertencia de
   SmartScreen, hace clic en "Mas informacion" → "Ejecutar de todas formas".
3. El instalador te va a guiar con un asistente:
   - **Carpeta de instalacion**: podes dejar la default (`C:\Program Files\SistemaStock`).
   - **Datos de PostgreSQL**: ingresa el usuario (default `postgres`), la
     contrasena que definiste en el paso 1, y el puerto (default `5432`).
4. El instalador hace todo automaticamente:
   - Instala Node.js si no lo tenes (lo descarga de internet).
   - Verifica que PostgreSQL este corriendo.
   - Genera el archivo `.env` con los datos de conexion.
   - Instala las dependencias del backend y el frontend (`npm install`).
   - Aplica las migraciones de la base de datos.
   - Crea el usuario administrador inicial.
   - Compila el backend y el frontend.
5. Cuando termine, podes tildar "Iniciar el sistema ahora" y hacer clic en
   Finalizar.

**Nota**: si el instalador falla en algun paso, queda un log completo en
`installer\install-log.txt` dentro de la carpeta de instalacion.

---

## 3. Uso diario: iniciar el sistema

De aca en adelante, ya no hace falta repetir los pasos anteriores. Para usar
el sistema dia a dia:

1. Andá a la carpeta de instalacion (`C:\Program Files\SistemaStock`).
2. Hace **doble clic en `Iniciar Sistema.bat`** (o usa el acceso directo
   del Escritorio o Menu Inicio que creo el instalador).
3. Se van a abrir un par de ventanas minimizadas (son el backend y el
   frontend corriendo) y una ventana principal que va a mostrar el progreso.
4. Cuando este todo listo, se va a abrir tu navegador automaticamente en
   `http://localhost:5173` con el sistema.
5. **No cierres la ventana principal** (la que dice "Sistema iniciado - no
   cierres esta ventana") mientras estes usando el sistema.
6. Para cerrar todo prolijamente al terminar de usarlo, volvi a esa ventana
   principal y presiona cualquier tecla — eso cierra el backend y el
   frontend de forma ordenada.

**Credenciales iniciales**: usuario `admin`, contrasena `admin123`.
Cambia esta contrasena la primera vez que entres al sistema.

---

## 4. Problemas comunes

**"El puerto 5432 ya esta en uso" / PostgreSQL no arranca porque el puerto
esta ocupado.**
Puede ser que ya tengas otro PostgreSQL corriendo (por ejemplo, si antes
usabas la version con Docker). Cerra cualquier otro Postgres o contenedor
Docker que este usando el puerto 5432, y volve a intentar. Si necesitas usar
otro puerto, cambialo tanto en la configuracion de PostgreSQL como en
`DATABASE_URL` dentro de `.env`.

**El servicio de PostgreSQL no arranca / da error de permisos.**
`Iniciar Sistema.bat` va a mostrarte un mensaje pidiendo que lo ejecutes
como administrador (clic derecho sobre el archivo → "Ejecutar como
administrador"). Si el problema persiste, podes iniciar el servicio a mano:
`Win + R` → escribe `services.msc` → busca el servicio que empieza con
`postgresql-x64-` → clic derecho → **Iniciar**.

**Contrasena incorrecta / el sistema no puede conectarse a la base de
datos.**
Revisa el archivo `stock-ventas-backend\.env` y confirma que la contrasena en
`DATABASE_URL` sea exactamente la misma que definiste al instalar
PostgreSQL (paso 1). Si no te acordas la contrasena, podes resetearla
abriendo **pgAdmin** (se instalo junto con PostgreSQL) o reinstalando
PostgreSQL y definiendo una nueva.

**El navegador se abrio pero la pagina no carga nada / da error de
conexion.**
Espera unos segundos mas — a veces el backend tarda un poco mas de lo
normal en levantar. Si despues de un minuto sigue sin andar, revisa la
ventana minimizada titulada "Sistema Stock - Backend" (podes
maximizarla desde la barra de tareas) para ver si hay algun mensaje de
error.

**El instalador falla o no completa todos los pasos.**
Revisa el log en `installer\install-log.txt` dentro de la carpeta de
instalacion. Los errores mas comunes son:
- PostgreSQL no detectado: asegurate de que este instalado y corriendo
  antes de ejecutar el instalador.
- Sin conexion a internet: el instalador necesita internet para descargar
  Node.js si no lo tenes.
- Espacio en disco insuficiente.
