// Back / Forward / Reload / Close for the YouTube Music and Spotify sign-in windows (a wrong click on
// Google's or Spotify's page never leaves you stuck). Also Alt+Left / Alt+Right / F5 / Esc.
const { Menu } = require('electron');

function addSignInNav(win) {
  const wc = win.webContents;
  const history = () => wc.navigationHistory;
  const goBack = () => { if (history().canGoBack()) history().goBack(); };
  const goForward = () => { if (history().canGoForward()) history().goForward(); };
  const menu = Menu.buildFromTemplate([
    { label: '←  Back', accelerator: 'Alt+Left', click: goBack },
    { label: 'Forward  →', accelerator: 'Alt+Right', click: goForward },
    { label: '⟳  Reload', accelerator: 'F5', click: () => wc.reload() },
    { label: '✕  Close', accelerator: 'Esc', click: () => win.close() },
  ]);
  win.setMenu(menu);
  win.setAutoHideMenuBar(false);
  win.setMenuBarVisibility(true);
  // Mouse back / forward buttons.
  win.on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward') goBack();
    else if (cmd === 'browser-forward') goForward();
  });
}

module.exports = { addSignInNav };
