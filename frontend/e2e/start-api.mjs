import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const dll = path.join(root, 'backend', 'Emtehani.API', 'bin', 'Debug', 'net10.0', 'Emtehani.API.dll');
const port = process.env.E2E_API_PORT || '5099';
const connection = process.env.E2E_DATABASE_CONNECTION;

if (!connection) {
  console.error('E2E_DATABASE_CONNECTION is required (use an isolated PostgreSQL test database).');
  process.exit(1);
}

const env = {
  ...process.env,
  ASPNETCORE_ENVIRONMENT: 'Development',
  ASPNETCORE_URLS: `http://127.0.0.1:${port}`,
  ConnectionStrings__DefaultConnection: connection,
  FrontendOrigin: process.env.E2E_FRONTEND_ORIGIN || 'http://127.0.0.1:4173',
  PublicApiUrl: process.env.E2E_PUBLIC_API_URL || `http://127.0.0.1:${port}`,
  Auth__AutoConfirmWithoutSmtp: 'true',
  Email__SmtpHost: '',
  Email__Username: '',
  Email__Password: '',
  Swagger__Enabled: 'false',
  Jwt__Key: process.env.E2E_JWT_KEY || 'e2e-only-jwt-key-0123456789abcdef0123456789abcdef'
};

const child = spawn(process.env.DOTNET_HOST_PATH || 'dotnet', [dll], { cwd: root, env, stdio: 'inherit', windowsHide: true });

function shutdown(signal) {
  if (!child.killed) child.kill(signal);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('exit', () => shutdown('SIGTERM'));
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
