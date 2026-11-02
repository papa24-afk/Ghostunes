const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const verify = process.argv.includes('--verify');
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, CI: '1', GHOSTTUNES_ANDROID_TEST: '1' },
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

run(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build']);
run(process.execPath, [path.join(root, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', 'android']);
const tasks = verify ? ['assembleDebug', 'testDebugUnitTest', 'lintDebug'] : ['assembleDebug'];
const android = path.join(root, 'android');
if (process.platform === 'win32')
  run('cmd.exe', ['/d', '/s', '/c', 'gradlew.bat', ...tasks, '--no-daemon'], android);
else run('sh', ['./gradlew', ...tasks, '--no-daemon'], android);
console.log('Development APK: android/app/build/outputs/apk/debug/app-debug.apk');
console.log('A debug APK still needs a reachable backend and device testing before distribution.');
