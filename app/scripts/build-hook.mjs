// Buduje hook.exe (release) i kopiuje go do zasobów paczki: instalator niesie go do instalacji hooków Claude Code.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
execFileSync('cargo', ['build', '--release', '-p', 'pets-hook'], { cwd: join(app, '..'), stdio: 'inherit' });
mkdirSync(join(app, 'src-tauri', 'resources'), { recursive: true });
copyFileSync(join(app, '..', 'target', 'release', 'hook.exe'), join(app, 'src-tauri', 'resources', 'hook.exe'));
console.log('hook.exe -> src-tauri/resources/hook.exe');
