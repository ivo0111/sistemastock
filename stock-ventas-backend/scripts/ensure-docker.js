const { execSync, spawn } = require('child_process');

const DOCKER_DESKTOP_PATH = 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe';
const MAX_WAIT_MS = 90000;
const POLL_INTERVAL_MS = 2000;

const CONTAINER_NAME = 'stock-ventas-db';
const RUN_COMMAND = [
  'docker run --name', CONTAINER_NAME,
  '-e POSTGRES_PASSWORD=password',
  '-e POSTGRES_DB=stock_ventas',
  '-p 5432:5432',
  '-d postgres:16'
].join(' ');

function isDockerRunning() {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function startDockerDesktop() {
  console.log('🐳 Docker Desktop no está corriendo. Iniciando...');
  spawn(DOCKER_DESKTOP_PATH, [], { detached: true, stdio: 'ignore' }).unref();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForDocker() {
  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    if (isDockerRunning()) return true;
    process.stdout.write('.');
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

// Devuelve: 'running' | 'stopped' | 'missing'
function getContainerStatus(name) {
  try {
    const output = execSync(
      `docker ps -a --filter "name=^/${name}$" --format "{{.Status}}"`,
      { encoding: 'utf-8' }
    ).trim();

    if (!output) return 'missing';
    return output.toLowerCase().startsWith('up') ? 'running' : 'stopped';
  } catch {
    return 'missing';
  }
}

function ensureContainer() {
  const status = getContainerStatus(CONTAINER_NAME);

  if (status === 'running') {
    console.log(`✅ Contenedor "${CONTAINER_NAME}" ya está corriendo.`);
    return;
  }

  if (status === 'stopped') {
    console.log(`▶️  Contenedor "${CONTAINER_NAME}" existe pero está parado. Iniciando...`);
    execSync(`docker start ${CONTAINER_NAME}`, { stdio: 'inherit' });
    return;
  }

  console.log(`📦 Contenedor "${CONTAINER_NAME}" no existe. Creándolo...`);
  execSync(RUN_COMMAND, { stdio: 'inherit' });
}

async function main() {
  if (!isDockerRunning()) {
    startDockerDesktop();
    const ready = await waitForDocker();
    if (!ready) {
      console.error('\n❌ Docker no arrancó a tiempo. Abrilo manualmente y reintentá.');
      process.exit(1);
    }
    console.log('\n✅ Docker está listo.');
  }

  ensureContainer();
}

main();