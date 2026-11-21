// Windows taskbar extras: previous / play-pause / next buttons under the taskbar thumbnail,
// and the song's progress drawn on the taskbar icon.
const path = require('path');
const { ipcMain, nativeImage } = require('electron');

function icon(name) {
  return nativeImage.createFromPath(path.join(__dirname, 'icons', `thumbar-${name}.png`));
}

function setupTaskbar(getWindow) {
  if (process.platform !== 'win32') {
    ipcMain.on('ghosttunes:playback-state', () => {});
    return;
  }
  const icons = { prev: icon('prev'), play: icon('play'), pause: icon('pause'), next: icon('next') };
  let last = { hasTrack: null, isPlaying: null };

  const send = (action) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('ghosttunes:taskbar-action', action);
  };

  const apply = (state) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    const hasTrack = Boolean(state.hasTrack);
    const isPlaying = Boolean(state.isPlaying);
    if (hasTrack !== last.hasTrack || isPlaying !== last.isPlaying) {
      last = { hasTrack, isPlaying };
      const flags = hasTrack ? [] : ['disabled'];
      win.setThumbarButtons([
        { tooltip: 'Previous', icon: icons.prev, flags, click: () => send('previous') },
        { tooltip: isPlaying ? 'Pause' : 'Play', icon: isPlaying ? icons.pause : icons.play, flags, click: () => send('toggle') },
        { tooltip: 'Next', icon: icons.next, flags, click: () => send('next') },
      ]);
    }
    const progress = Number(state.progress);
    if (!hasTrack || !Number.isFinite(progress)) win.setProgressBar(-1);
    else win.setProgressBar(Math.min(1, Math.max(0, progress)), { mode: isPlaying ? 'normal' : 'paused' });
  };

  ipcMain.on('ghosttunes:playback-state', (_event, state) => apply(state || {}));
}

module.exports = { setupTaskbar };
