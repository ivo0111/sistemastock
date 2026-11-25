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
   Si esto último tampoco funciona, debe abrir las variables de entorno del sistema (buscar en opciones)
   esto mostrará un panel con varias opciones, hacer click en "Variables de entorno" (esquina inferior derecha).
   Una vez ahí verá un panel donde scrollear, debe presionar en donde dice "Path".
   Verá un cuadro con varias opciones, haga click en Nuevo y pegue la ruta a la carpeta bin de su instalación de postres,
   por lo general tendrá la forma de "C:\Program Files\PostgreSQL\18\bin", el número puede variar según la versión de postgres instalada

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
   - **Contrasena del administrador**: escribi la contrasena inicial para el
     usuario `admin` o dejala vacia para que el instalador genere una aleatoria
     de 16 caracteres. Ya no existe la contrasena fija `admin123`.
4. El instalador hace todo automaticamente:
   - Instala Node.js si no lo tenes (lo descarga de internet).
   - Verifica que PostgreSQL este corriendo.
   - Genera el archivo `.env` con los datos de conexion.
   - Verifica que no haya comprobantes duplicados antes de migrar (si los hay,
     se detiene y te indica cuales corregir).
   - Instala las dependencias del backend y el frontend (`npm install`).
   - Aplica las migraciones de la base de datos.
   - Crea el usuario administrador inicial con la contrasena que indicaste.
   - Compila el backend y el frontend.
   - Programa el backup diario de la base a las 21:30.
5. Cuando termine, podes tildar "Iniciar el sistema ahora" y hacer clic en
   Finalizar.
6. **Credenciales iniciales**:
   - Si escribiste la contrasena en el asistente, usa esa.
   - Si la dejaste vacia, el instalador la genero y la guardo en
     `installer\credenciales-admin.txt` dentro de la carpeta de instalacion
     (solo la pueden leer los administradores del equipo).
   - En el primer ingreso el sistema te va a pedir cambiarla. Hasta que no la
     cambies no vas a poder usar el resto de las pantallas.
   - Si reinstalas sobre una instalacion existente, el instalador vuelve a
     definir la contrasena del admin con lo que indiques (o con una nueva
     generada) y vuelve a exigir el cambio en el primer ingreso. Esto mantiene
     valido el archivo de credenciales que muestra el instalador.

**Nota**: si el instalador falla en algun paso, queda un log completo en
`installer\install-log.txt` dentro de la carpeta de instalacion.

---

## 3. Uso diario: iniciar el sistema

De aca en adelante, ya no hace falta repetir los pasos anteriores. Para usar
el sistema dia a dia:

1. Andá a la carpeta de instalacion (`C:\Program Files\SistemaStock`).
2. Hace **doble clic en `Iniciar Sistema.bat`** (o usa el acceso directo
   del Escritorio o Menu Inicio que creo el instalador).
3. El lanzador primero comprueba si el backend ya esta respondiendo (por
   ejemplo, si lo instalaste como servicio de Windows). Si no responde,
   verifica PostgreSQL, aplica **solo las migraciones pendientes** y recompila
   backend/frontend **solo si cambiaron los archivos**. En un arranque normal
   no vuelve a compilar nada.
4. Cuando este todo listo, se va a abrir tu navegador automaticamente en
   `http://localhost:3000` con el sistema.
5. Si estas en **modo ventana** (sin servicio), **no cierres la ventana
   principal** (la que dice "Sistema iniciado - no cierres esta ventana")
   mientras estes usando el sistema. Para cerrar todo prolijamente, volve a esa
   ventana y presiona cualquier tecla.
6. Si instalaste el **servicio de Windows** (ver abajo), no hay ventana que
   mantener abierta: el panel se puede cerrar y el backend sigue corriendo.

**Credenciales**: usuario `admin` y la contrasena que definiste (o la que
quedo en `installer\credenciales-admin.txt`). El primer ingreso obliga a
cambiarla.

### Inicio automatico como servicio (opcional)

Por defecto el sistema se inicia con `Iniciar Sistema.bat` en modo ventana. Si
queres que quede disponible solo al encender la PC y que el inicio sea
instantaneo, podes registrar el backend como **servicio de Windows** con
[NSSM](https://nssm.cc/download). Esto es **opcional**: el instalador no lo
hace automaticamente y el sistema funciona igual sin este paso.

Ventajas:

- El backend arranca solo al iniciar Windows (PostgreSQL tambien es un
  servicio).
- `Iniciar Sistema.bat` detecta que el servicio ya responde y solo abre el
  navegador: no compila, no ejecuta Prisma y no abre una ventana de consola.
- No hay una ventana que se pueda cerrar por error.

Pasos (una sola vez):

1. Descarga NSSM desde [https://nssm.cc/download](https://nssm.cc/download) y
   descomprimilo, por ejemplo en `C:\tools\nssm\nssm.exe`.
2. Abri PowerShell **como Administrador** en la carpeta de instalacion.
3. Ejecuta:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\instalar_servicio.ps1 `
     -NssmPath "C:\tools\nssm\nssm.exe"
   ```

   El script crea el servicio `SistemaStock`, lo configura para iniciar
   automaticamente y lo arranca. Los logs quedan en
   `C:\ProgramData\SistemaStock\Logs`.
4. Verifica con `Get-Service SistemaStock` (debe decir `Running`) y abri
   `http://localhost:3000`.
5. Para quitarlo:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\desinstalar_servicio.ps1
   ```

Si preferis hacerlo a mano con NSSM, los comandos equivalentes son:

```powershell
nssm install SistemaStock "C:\Program Files\nodejs\node.exe" `
  "C:\Program Files\SistemaStock\stock-ventas-backend\dist\server.js"
nssm set SistemaStock AppDirectory "C:\Program Files\SistemaStock\stock-ventas-backend"
nssm set SistemaStock Start SERVICE_AUTO_START
nssm start SistemaStock
```

**Alternativa con el Programador de tareas**: si no queres usar NSSM, podes
crear una tarea con disparador "Al iniciar el sistema" que ejecute
`node dist\server.js` con "Iniciar en" =
`C:\Program Files\SistemaStock\stock-ventas-backend` y cuenta `SYSTEM`. El
instalador **no** crea esta tarea. `Iniciar Sistema.bat` funciona igual: si el
backend ya responde, solo abre el navegador.

**Nota sobre PDFs**: el servicio corre como `SYSTEM`. Si la generacion de PDF
falla por permisos del navegador, cambia la cuenta del servicio a un usuario
normal desde `services.msc` (pestana "Iniciar sesion") o usa el modo ventana.

### Actualizar el sistema

Si instalaste el sistema desde un clon de git y queres actualizar codigo,
dependencias, base y compilados en un solo paso:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\actualizar.ps1
```

El script:

1. Detiene el servicio `SistemaStock` si esta instalado.
2. Ejecuta `git pull --ff-only`.
3. Ejecuta `npm ci` en backend y frontend.
4. Verifica comprobantes duplicados, genera Prisma y aplica migraciones.
5. Compila backend y frontend.
6. Vuelve a iniciar el servicio y espera a que `http://localhost:3000`
   responda.

Opciones utiles:

- `-DryRun`: muestra los pasos sin ejecutar nada.
- `-SkipGitPull`: si copiaste los archivos a mano.
- `-SkipNpmCi`, `-SkipMigrations`, `-SkipBuild`: para actualizaciones parciales.
- `-NoRestart`: deja el servicio detenido al terminar.
- `-Force`: continua aunque el backend este corriendo en modo ventana.

Requiere PowerShell como Administrador si el servicio esta instalado o si la
carpeta de instalacion esta en `Program Files`. Si instalaste con el `.exe`
(sin `.git`), el script omite `git pull` y hace el resto sobre los archivos que
hayas copiado; para una actualizacion completa tambien podes ejecutar el
instalador nuevo.

Si usas la alternativa de **tarea programada** en lugar del servicio, detene la
tarea antes de actualizar (o usa `-Force`; `npm ci` puede fallar si el backend
esta corriendo y bloquea archivos).

Ejemplo por SSH (con una cuenta administradora del equipo):

```powershell
ssh usuario@equipo "powershell -ExecutionPolicy Bypass -File \"C:\Program Files\SistemaStock\scripts\actualizar.ps1\""
```

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
error. Si instalaste el servicio, revisa
`C:\ProgramData\SistemaStock\Logs\backend-err.log`.

**El servicio `SistemaStock` no arranca o el puerto 3000 esta ocupado.**
Revisa `C:\ProgramData\SistemaStock\Logs\backend-err.log`. Si dice
`EADDRINUSE`, ya hay otro backend usando el puerto (por ejemplo, una ventana
del modo manual que quedo abierta): cerrala y volve a iniciar el servicio. Si
al instalar el servicio dice "Acceso denegado", ejecutaste el script sin
permisos de Administrador. Para volver al modo ventana, desinstala el servicio
con `scripts\desinstalar_servicio.ps1` y usa `Iniciar Sistema.bat`.

**El instalador falla o no completa todos los pasos.**
Revisa el log en `installer\install-log.txt` dentro de la carpeta de
instalacion. Los errores mas comunes son:
- PostgreSQL no detectado: asegurate de que este instalado y corriendo
  antes de ejecutar el instalador.
- Sin conexion a internet: el instalador necesita internet para descargar
  Node.js si no lo tenes.
- Espacio en disco insuficiente.

**El instalador falla en `npm install` del frontend.**
Todas las dependencias, incluido `xlsx`, se instalan desde el registry publico
de npm. Ya no se usa el CDN de SheetJS (`cdn.sheetjs.com`), que era un punto de
falla adicional. Si `npm install` falla, revisa la conexion a internet o la
configuracion de proxy/registry (`npm config get registry`). Podes reintentar a
mano con `cd stock-ventas-frontend` y `npm install`, y despues volver a correr
el instalador.

**El instalador se detiene avisando que hay comprobantes duplicados.**
Antes de aplicar la migracion que crea el indice unico de comprobantes, el
instalador verifica que no existan dos ventas con el mismo punto de venta, tipo
y numero de comprobante. Si los hay, muestra los IDs y aborta para no dejar la
base a medio migrar. Corregi o anula esos comprobantes y volve a ejecutar el
instalador. Tambien podes listarlos con:

```
cd stock-ventas-backend
npm run verificar:comprobantes
```

**La generacion de comprobantes (PDF) falla con "PDF_NO_DISPONIBLE".**
El sistema NO descarga Chromium (ya no lo hace): usa el Chrome o Edge que ya
tenes en la maquina. Si no encuentra ninguno, el PDF falla con el error
`PDF_NO_DISPONIBLE`. Solucion: instalá Chrome o Microsoft Edge (Edge viene con
Windows 10/11), o indicá la ruta del navegador en `stock-ventas-backend\.env`:
`PDF_BROWSER_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe`

---

## 5. Copias de seguridad (backups)

El sistema guarda toda la informacion (ventas, stock, cuentas corriente, caja)
en PostgreSQL, en el mismo equipo. Para no perderla si la maquina falla, el
instalador programa un backup automatico todos los dias a las 21:30.

### Donde quedan los backups

Por defecto en `C:\ProgramData\SistemaStock\Backups`, **fuera de la carpeta de
la aplicacion**. Asi, desinstalar o actualizar el sistema no borra los
respaldos. Cada backup es un archivo `.dump` con fecha y hora en el nombre
(`stock_ventas_2026-11-25_21-30.dump`).

Se conservan los ultimos **30 dias**; los mas viejos se borran solos. La
retencion y la carpeta se pueden cambiar por parametro o con las variables de
entorno `STOCK_BACKUP_RETENTION_DAYS` y `STOCK_BACKUP_DIR`.

### Backup manual

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup_base_datos.ps1
```

Para ademas verificar que el backup se puede restaurar (crea una base temporal,
la restaura y la borra):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup_base_datos.ps1 -TestRestore
```

### Cambiar el horario o la retencion

Como Administrador, desde la carpeta de instalacion:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\programar_backup.ps1 -BackupTime "21:30" -RetentionDays 60
```

El instalador ya crea la tarea como usuario `SYSTEM` con maximos privilegios,
asi corre aunque no haya nadie con sesion iniciada. Para eliminarla:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\programar_backup.ps1 -Unregister
```

### Restaurar un backup

**Cerra el sistema** (`Iniciar Sistema.bat`) antes de restaurar. Despues:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\restaurar_base_datos.ps1 `
  -BackupFile "C:\ProgramData\SistemaStock\Backups\stock_ventas_2026-11-25_21-30.dump"
```

El script valida el archivo, pide escribir `RESTAURAR` para confirmar y, antes
de tocar nada, genera un backup de seguridad del estado actual. Tambien podes
restaurar con pgAdmin (clic derecho en la base → "Restore...").

**Importante**: los backups viven en el mismo equipo. Para protegerte ante una
falla del disco, copia periodicamente la carpeta
`C:\ProgramData\SistemaStock\Backups` a otro disco o a la nube.
