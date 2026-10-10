// Builds the hook binary (release) and copies it into the bundle resources: the installer ships it
// for the Claude Code hooks (`hook.exe` on Windows, `hook` on Linux).
import { execFileSync } from 'node:child_process';
import { copyFileSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.platform === 'win32' ? 'hook.exe' : 'hook';
execFileSync('cargo', ['build', '--release', '-p', 'pets-hook'], { cwd: join(app, '..'), stdio: 'inherit' });
mkdirSync(join(app, 'src-tauri', 'resources'), { recursive: true });
copyFileSync(join(app, '..', 'target', 'release', name), join(app, 'src-tauri', 'resources', name));
if (process.platform !== 'win32') chmodSync(join(app, 'src-tauri', 'resources', name), 0o755);
console.log(`${name} -> src-tauri/resources/${name}`);
