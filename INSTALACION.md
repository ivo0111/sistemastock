# Guía de instalación — Sistema de Gestión de Stock y Ventas

Esta guía está pensada para alguien sin conocimientos técnicos. Seguí los pasos
en orden. Cada bloque gris es un comando: copialo y pegalo tal cual en la
consola que se indica (para pegar en la consola de Windows: clic derecho, o
`Ctrl + V`).

Esta instalación se hace **una sola vez**. Después, el uso diario es un doble
clic en `Iniciar Sistema.bat` (ver el paso 7).

---

## 1. Requisitos previos

Necesitás instalar dos programas. Los dos son gratuitos.

### 1.1. Node.js

1. Entrá a [https://nodejs.org](https://nodejs.org).
2. Descargá la versión **LTS** (es la que aparece recomendada, actualmente
   20.x o superior — cualquier versión 20 o más nueva sirve).
3. Ejecutá el instalador y dejá todas las opciones por default (siguiente,
   siguiente, instalar).
4. Para confirmar que quedó instalado, abrí la consola de Windows (`Win + R`,
   escribí `cmd`, Enter) y ejecutá:
   ```
   node --version
   ```
   Debería mostrarte algo como `v20.x.x` o superior.

### 1.2. PostgreSQL

1. Entrá a [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/).
2. Hacé clic en el link del instalador (te lleva al sitio de EnterpriseDB,
   que es el instalador oficial recomendado por PostgreSQL para Windows).
3. Descargá la versión más reciente (16.x o superior).
4. Ejecutá el instalador. Durante la instalación:
   - Dejá tildados todos los componentes por default (PostgreSQL Server,
     pgAdmin, Command Line Tools).
   - **Puerto**: dejalo en el default, `5432`.
   - **Contraseña del superusuario `postgres`**: te va a pedir que definas
     una contraseña. **Anotala en un lugar seguro** — la vas a necesitar en
     el paso 3.
   - Al final te va a preguntar si querés correr "Stack Builder": podés
     saltearlo (no hace falta para este sistema).
5. Verificá que el instalador haya agregado `psql` (la herramienta de línea
   de comandos de Postgres) al PATH del sistema — con la instalación
   estándar esto ya queda hecho solo. Para confirmarlo, abrí una consola
   **nueva** (`Win + R` → `cmd`) y ejecutá:
   ```
   psql --version
   ```
   Si te muestra una versión, está todo bien. Si te dice "no se reconoce el
   comando", reinstalá y asegurate de no destildar "Add PostgreSQL to PATH"
   (en instalaciones recientes esto es automático).

---

## 2. Descargar el sistema

Elegí una de las dos opciones:

**Opción A — Sin usar Git (más simple):**
1. Entrá a [https://github.com/ivo0111/sistemastock](https://github.com/ivo0111/sistemastock).
2. Botón verde **Code** → **Download ZIP**.
3. Descomprimí el .zip en una carpeta fija de tu PC (por ejemplo
   `C:\SistemaStock`). No lo dejes en la carpeta de Descargas ni en el
   Escritorio, para evitar que se mueva o borre sin querer.

**Opción B — Con Git (si ya lo usás):**
```
git clone https://github.com/ivo0111/sistemastock.git
cd sistemastock
```

De acá en adelante, la guía asume que estás parado en la carpeta donde
descomprimiste o clonaste el proyecto (la que contiene `stock-ventas-backend`,
`stock-ventas-frontend` e `Iniciar Sistema.bat`).

---

## 3. Configurar el archivo `.env`

1. Entrá a la carpeta `stock-ventas-backend`.
2. Copiá el archivo `.env.example` y renombrá la copia a `.env`
   (en Windows: clic derecho sobre `.env.example` → Copiar, pegar en la
   misma carpeta, y renombrar la copia a `.env`).
3. Abrí `.env` con el Bloc de notas y completá:
   - `DATABASE_URL`: reemplazá `<TU_PASSWORD>` por la contraseña que
     definiste al instalar PostgreSQL (paso 1.2). Por ejemplo, si tu
     contraseña es `MiClave123`, la línea queda:
     ```
     DATABASE_URL="postgresql://postgres:MiClave123@localhost:5432/stock_ventas"
     ```
   - `JWT_SECRET`: reemplazá el valor de ejemplo por cualquier texto largo y
     random. Si tenés Git Bash o WSL instalado podés generar uno con:
     ```
     openssl rand -hex 32
     ```
     Si no, alcanza con escribir una frase larga y difícil de adivinar (30+
     caracteres, mezclando letras y números).
4. Guardá el archivo.

---

## 4. Instalar dependencias

Abrí la consola de Windows (`cmd`) en la carpeta del proyecto y ejecutá:

```
cd stock-ventas-backend
npm install
cd ..\stock-ventas-frontend
npm install
cd ..
```

Esto puede tardar unos minutos la primera vez.

---

## 5. Migrar la base de datos

Desde la carpeta `stock-ventas-backend`:

```
cd stock-ventas-backend
npx prisma migrate deploy
```

Esto crea todas las tablas necesarias en la base `stock_ventas`. Usamos
`migrate deploy` (no `migrate dev`) porque no queremos que te pida
confirmaciones interactivas — simplemente aplica las migraciones ya
existentes.

Si te da un error de conexión, revisá que el `DATABASE_URL` en `.env` tenga
la contraseña correcta (paso 3).

---

## 6. Crear el usuario administrador inicial

Todavía parado en `stock-ventas-backend`:

```
npm run seed
```

Esto crea el usuario administrador inicial (usuario `admin`, contraseña
`admin123`). **Cambiá esta contraseña la primera vez que entres al
sistema.**

---

## 7. Uso diario: iniciar el sistema

De acá en adelante, ya no hace falta repetir los pasos anteriores. Para usar
el sistema día a día:

1. Andá a la carpeta raíz del proyecto (la que tiene `Iniciar Sistema.bat`).
2. Hacé **doble clic en `Iniciar Sistema.bat`**.
3. Se van a abrir un par de ventanas minimizadas (son el backend y el
   frontend corriendo) y una ventana principal que va a mostrar el progreso.
4. Cuando esté todo listo, se va a abrir tu navegador automáticamente en
   `http://localhost:5173` con el sistema.
5. **No cierres la ventana principal** (la que dice "Sistema iniciado — no
   cierres esta ventana") mientras estés usando el sistema.
6. Para cerrar todo prolijamente al terminar de usarlo, volvé a esa ventana
   principal y presioná cualquier tecla — eso cierra el backend y el
   frontend de forma ordenada.

---

## 8. Problemas comunes

**"El puerto 5432 ya está en uso" / PostgreSQL no arranca porque el puerto
está ocupado.**
Puede ser que ya tengas otro PostgreSQL corriendo (por ejemplo, si antes
usabas la versión con Docker). Cerrá cualquier otro Postgres o contenedor
Docker que esté usando el puerto 5432, y volvé a intentar. Si necesitás usar
otro puerto, cambialo tanto en la configuración de PostgreSQL como en
`DATABASE_URL` dentro de `.env`.

**El servicio de PostgreSQL no arranca / da error de permisos.**
`Iniciar Sistema.bat` va a mostrarte un mensaje pidiendo que lo ejecutes
como administrador (clic derecho sobre el archivo → "Ejecutar como
administrador"). Si el problema persiste, podés iniciar el servicio a mano:
`Win + R` → escribí `services.msc` → buscá el servicio que empieza con
`postgresql-x64-` → clic derecho → **Iniciar**.

**Contraseña incorrecta / el sistema no puede conectarse a la base de
datos.**
Revisá el archivo `stock-ventas-backend\.env` y confirmá que la contraseña en
`DATABASE_URL` sea exactamente la misma que definiste al instalar
PostgreSQL (paso 1.2). Si no te acordás la contraseña, podés resetearla
abriendo **pgAdmin** (se instaló junto con PostgreSQL) o reinstalando
PostgreSQL y definiendo una nueva.

**El navegador se abrió pero la página no carga nada / da error de
conexión.**
Esperá unos segundos más — a veces el backend tarda un poco más de lo
normal en levantar. Si después de un minuto sigue sin andar, revisá la
ventana minimizada titulada "Sistema Stock - Backend" (podés
maximizarla desde la barra de tareas) para ver si hay algún mensaje de
error.
