import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pkg from 'ssh2';
import SFTPController from 'ssh2-sftp-server';
const { Server } = pkg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.TEST_SSH_PORT || 2222;
const USER = 'test';
const PASS = 'test123';
const HOME = join(__dirname, '..', 'sftp-home');

if (!existsSync(HOME)) {
  mkdirSync(HOME, { recursive: true });
  writeFileSync(join(HOME, 'README.txt'), 'EasySSH Test Server - SFTP enabled\n');
  const dirs = ['docs', 'projects', 'data', 'backup'];
  for (const d of dirs) {
    const dirPath = join(HOME, d);
    mkdirSync(dirPath, { recursive: true });
    writeFileSync(join(dirPath, `${d}-notes.txt`), `This is the ${d} directory.\n`);
  }
}

const sshd = new Server({
  hostKeys: [readFileSync(join(__dirname, '..', 'host_key'))],
  debug: msg => console.log('[SSHD]', msg),
}, (client) => {
  console.log('[SSHD] Client connected');
  client.on('authentication', (ctx) => {
    console.log('[SSHD] Auth attempt:', ctx.method, ctx.username);
    if (ctx.method === 'password' && ctx.username === USER && ctx.password === PASS) {
      ctx.accept();
    } else if (ctx.method === 'none') {
      ctx.reject(['password']);
    } else {
      ctx.reject();
    }
  }).on('ready', () => {
    console.log('[SSHD] Client authenticated');
    client.on('session', (accept) => {
      const session = accept();
      session.on('sftp', (acceptSFTP) => {
        console.log('[SSHD] SFTP session started');
        const sftpStream = acceptSFTP();
        try {
          const sftp = new SFTPController(sftpStream, { root: HOME });
          sftp.on('error', (err) => console.error('[SFTP] Error:', err.message));
        } catch (e) {
          console.error('[SFTP] Failed:', e.message);
          sftpStream.close();
        }
      });
      session.on('shell', async (accept) => {
        console.log('[SSHD] Shell session started');
        const stream = accept();
        stream.write('Welcome to EasySSH Test Server!\r\n');
        stream.write(`User: ${USER}, Password: ${PASS}\r\n`);
        stream.write(`SFTP port: ${PORT}\r\n`);
        stream.write('Type commands or use SFTP client.\r\n$ ');
        stream.on('data', (data) => {
          const cmd = data.toString().trim();
          if (cmd === 'exit' || cmd === 'quit') {
            stream.write('Goodbye!\r\n');
            stream.exit(0);
            stream.end();
          } else if (cmd === 'ls') {
            try {
              const files = readdirSync(HOME);
              stream.write(files.join('  ') + '\r\n');
            } catch (e) {
              stream.write('Error: ' + e.message + '\r\n');
            }
          } else if (cmd.startsWith('echo ')) {
            stream.write(cmd.slice(5) + '\r\n');
          } else if (cmd === 'help') {
            stream.write('Commands: ls, echo <text>, exit/quit\r\n');
          } else if (cmd) {
            stream.write(`Unknown command: ${cmd}\r\n`);
          }
          stream.write('$ ');
        });
      });
    });
  }).on('end', () => {
    console.log('[SSHD] Client disconnected');
  });
});

sshd.listen(PORT, '0.0.0.0', () => {
  console.log(`[SSHD] Test SSH server listening on 0.0.0.0:${PORT}`);
  console.log(`[SSHD] Connect with: ssh ${USER}@localhost -p ${PORT} password: ${PASS}`);
  console.log(`[SSHD] SFTP root: ${HOME}`);
});

process.on('SIGINT', () => { sshd.close(); process.exit(); });
process.on('SIGTERM', () => { sshd.close(); process.exit(); });
