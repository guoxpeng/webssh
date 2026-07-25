import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = join(fileURLToPath(import.meta.url), '..', '..', '..');

export const PORT = parseInt(process.env.PORT || '9627', 10);
export const WS_PATH = process.env.WS_PATH || '/ws/ssh';
export const DIST_DIR = join(__dirname, '..', 'dist', 'client');

export const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.json': 'application/json',
};

export const SSH_ALGORITHMS = {
  kex: ['curve25519-sha256', 'ecdh-sha2-nistp256', 'diffie-hellman-group14-sha256'],
  cipher: ['aes256-gcm@openssh.com', 'aes256-ctr', 'aes128-ctr'],
  serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-256'],
  hmac: ['hmac-sha2-256', 'hmac-sha2-512'],
  compress: ['none'],
};

export const GUACD_HOST = process.env.GUACD_HOST || '127.0.0.1';
export const GUACD_PORT = parseInt(process.env.GUACD_PORT || '4822', 10);
export const DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
