const { app, BrowserWindow, Menu, shell, ipcMain, dialog, Tray, Notification } = require('electron');
const { exec, execFile } = require('child_process');
const { version, devDependencies, author } = require('./package.json');
const axios = require('axios');
const path = require('path');
const { type } = require('os');
const { spawn } = require('child_process');

// Lizenzfenster-Erstellung
// function createLicenseWindow() { ... }

// Dynamischer Import von electron-store
let store;
(async () => {
    const Store = (await import('electron-store')).default;
    store = new Store();
})();

// Konstante Variablen und Initialisierungen
let mainWindow;
let tray = null;
let autostartEnabled = false;
let minimizeToTray = false;
const currentVersion = `v${version}`;
let licenseWindow;

// Am Anfang der Datei, nach den imports
if (process.platform === 'win32') {
  app.setAppUserModelId('com.helpit.fixit');
}

// Fügen Sie diese Zeile am Anfang der Datei hinzu
const isDev = process.env.NODE_ENV === 'development';

// ------------------- Funktionen -------------------

app.setPath('cache', path.join(app.getPath('userData'), 'cache'));

// Hauptfenster-Erstellung
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        resizable: true,
        minWidth: 400,
        minHeight: 300,
        title: "FixIT",
        icon: path.join(process.resourcesPath, 'src/assets/images/logo/win/icon.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true,
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html')).then(() => {
        mainWindow.webContents.on('did-finish-load', () => {
            loadUserPreferences();
        });
    });

    mainWindow.on('close', (event) => {
        if (minimizeToTray && !app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
            showTrayIcon();
            const notification = {           
                title: 'Minimiert in die Symbolleiste',
                body: 'Die Anwendung wurde in die Symbolleiste minimiert.',
                silent: true,
                icon: path.join(__dirname, './src/assets/images/logo/png/64x64.png')
            };
            new Notification(notification).show();
        } else {
            app.isQuiting = true;
            mainWindow = null;
            app.quit();
        }
    });

    mainWindow.webContents.on('did-finish-load', () => {
        loadUserPreferences();
    });
}

// Benutzerpräferenzen laden
const loadUserPreferences = () => {
    mainWindow.webContents.executeJavaScript(`localStorage.getItem('alwaysOnTop')`).then((result) => {
        const savedAlwaysOnTop = result === 'true';
        mainWindow.setAlwaysOnTop(savedAlwaysOnTop);
        const alwaysOnTopMenuItem = menu.getMenuItemById('alwaysOnTopToggle');
        alwaysOnTopMenuItem.checked = savedAlwaysOnTop;
    });

    mainWindow.webContents.executeJavaScript(`localStorage.getItem('darkMode')`).then((result) => {
        const savedDarkMode = result === 'true';
        mainWindow.webContents.send('toggle-dark-mode', savedDarkMode);
        const darkModeMenuItem = menu.getMenuItemById('darkModeToggle');
        darkModeMenuItem.checked = savedDarkMode;
    });

    mainWindow.webContents.executeJavaScript(`localStorage.getItem('minimizeToTray')`).then((result) => {
        minimizeToTray = result === 'true';
        const minimizeToTrayMenuItem = menu.getMenuItemById('minimizeToTrayToggle');
        minimizeToTrayMenuItem.checked = minimizeToTray;
    });

    mainWindow.webContents.executeJavaScript(`localStorage.getItem('autostart')`).then((result) => {
        autostartEnabled = result === 'true';
        const autostartMenuItem = menu.getMenuItemById('autostartToggle');
        autostartMenuItem.checked = autostartEnabled;
        
        app.setLoginItemSettings({
            openAtLogin: autostartEnabled,
            path: process.execPath,
            args: ['--hidden']
        });
    });
};

// Tray-Icon anzeigen
const showTrayIcon = () => {
    if (tray) return;
    tray = new Tray(path.join(__dirname, './src/assets/images/logo/png/32x32.png'));

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Anzeigen', click: () => mainWindow.show() },
        { label: 'Beenden', click: () => { app.isQuiting = true; app.quit(); } }
    ]);

    tray.setToolTip('FixIT');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => mainWindow.show());
};

// IPC-Handler für .exe-Ausführung
ipcMain.handle('execute-exe', async (event, exeName) => {
    return new Promise((resolve, reject) => {
        const exePath = isDev 
            ? path.join(__dirname, 'resources', 'portable-apps', `${exeName}.exe`)
            : path.join(process.resourcesPath, 'portable-apps', `${exeName}.exe`);
        
        console.log('Versuche Programm zu starten:', exePath);

        // Prüfen ob die Datei existiert
        if (!require('fs').existsSync(exePath)) {
            console.error(`Exe nicht gefunden: ${exePath}`);
            reject(new Error(`Programm ${exeName}.exe wurde nicht gefunden`));
            return;
        }

        try {
            const childProcess = exec(`"${exePath}"`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Fehler beim Ausführen der .exe: ${error.message}`);
                    reject(error);
                    return;
                }
            });

            if (childProcess.pid) {
                console.log('Prozess erfolgreich gestartet mit PID:', childProcess.pid);
                setTimeout(() => {
                    resolve(true);
                }, 1000);
            } else {
                reject(new Error('Prozess konnte nicht gestartet werden'));
            }

        } catch (error) {
            console.error('Fehler beim Ausführen:', error);
            reject(error);
        }
    });
});

// IPC-Handler für URL-Öffnen
ipcMain.handle('open-url', (event, url) => {
    shell.openExternal(url);
});

// Lizenz-IPC-Handler
ipcMain.on('license-valid', () => {
    store.set('licensed', true);
    createMainWindow();
    licenseWindow.close();
});

ipcMain.on('too-many-attempts', () => {
    dialog.showMessageBox({
        type: 'error',
        title: 'Zu viele Versuche',
        message: 'Sie haben zu oft einen falschen Lizenzschlüssel eingegeben. Die Anwendung wird beendet.',
        buttons: ['OK']
    }).then(() => {
        app.quit();
    });
});

// IPC-Handler für Programmstart
ipcMain.handle('execute', async (event, programName) => {
  try {
    const child = spawn(programName, [], {
      detached: true,
      stdio: 'ignore'
    });
    
    return new Promise((resolve, reject) => {
      child.on('spawn', () => {
        resolve(true);
      });
      
      child.on('error', (err) => {
        reject(err);
      });
    });
  } catch (error) {
    throw error;
  }
});

// ------------------- Anwendung starten -------------------
app.whenReady().then(async () => {
    listPortableApps();
    const Store = (await import('electron-store')).default;
    store = new Store();
    
    createMainWindow();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ------------------- Menü-Template -------------------
const template = [
    {
        label: 'Socials',
        submenu: [
            { label: 'Website', click: () => shell.openExternal('https://helpinformatik.de') },
            { label: 'Instagram', click: () => shell.openExternal('https://www.instagram.com/helpit.informatik') },
            { label: 'GitHub', click: () => shell.openExternal('https://github.com/alphatg050') },
            { label: 'E-Mail', click: () => shell.openExternal('mailto:guerkan.privat@gmail.com') }
        ]
    },
    {
        label: 'Optionen',
        submenu: [
            {
                label: 'Dark Mode',
                id: 'darkModeToggle',
                type: 'checkbox',
                checked: false,
                click: (menuItem) => {
                    const isDarkMode = menuItem.checked;
                    mainWindow.webContents.send('toggle-dark-mode', isDarkMode);
                    mainWindow.webContents.executeJavaScript(`localStorage.setItem('darkMode', ${isDarkMode});`);
                }
            },
            {
                label: 'Immer im Vordergrund',
                id: 'alwaysOnTopToggle',
                type: 'checkbox',
                checked: false,
                click: (menuItem) => {
                    mainWindow.setAlwaysOnTop(menuItem.checked);
                    mainWindow.webContents.executeJavaScript(`localStorage.setItem('alwaysOnTop', ${menuItem.checked});`);
                }
            },
            {
                label: 'In Symbolleiste minimieren',
                id: 'minimizeToTrayToggle',
                type: 'checkbox',
                checked: minimizeToTray,
                click: (menuItem) => {
                    minimizeToTray = menuItem.checked;
                    mainWindow.webContents.executeJavaScript(`localStorage.setItem('minimizeToTray', ${menuItem.checked});`);
                }
            },
            {
                label: 'Autostart',
                id: 'autostartToggle',
                type: 'checkbox',
                checked: autostartEnabled,
                click: (menuItem) => {
                    autostartEnabled = menuItem.checked;
                    mainWindow.webContents.executeJavaScript(`localStorage.setItem('autostart', ${autostartEnabled});`);
                    
                    app.setLoginItemSettings({
                        openAtLogin: autostartEnabled,
                        path: process.execPath,
                        args: ['--hidden']
                    });
                }
            },
            { type: 'separator' },
            { role: 'reload' },
            { role: 'forceReload' },
        ]
    },
    {
        label: 'Hilfe',
        submenu: [
            {
                label: 'TeamViewer QS',
                click: () => {
                    const exePath = isDev
                        ? path.join(__dirname, 'resources', 'portable-apps', 'TeamViewerQS.exe')
                        : path.join(process.resourcesPath, 'portable-apps', 'TeamViewerQS.exe');
                    exec(`"${exePath}"`, (error) => {
                        if (error) console.error(`Fehler beim Öffnen von TeamViewer: ${error}`);
                    });
                }
            },
            { type: 'separator' },
            {
                label: "Lizenz",
                click: () => {
                    dialog.showMessageBox(mainWindow, {
                        type: "warning",
                        title: 'Lizenzsteuerung',
                        message: `Work in Progress!`,
                        buttons: ['OK'],
                        noLink: true
                    });
                }
            },
            {
                label: "Über FixIT",
                click: () => {
                    dialog.showMessageBox(mainWindow, {
                        type: "info",
                        title: 'FixIT',
                        message: `Version: ${version}\n\nEntwickelt von ${author}\nKontakt: guerkan.privat@gmail.com`,
                        buttons: ['OK'],
                        noLink: true
                    });
                }
            },
            { type: 'separator' },
            { label: 'Exit', click: () => app.quit() },
        ]
    }
];

// Menü erstellen und setzen
const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

// Fügen Sie diese Funktion am Anfang der Datei hinzu
function listPortableApps() {
    const portableAppsPath = isDev
        ? path.join(__dirname, 'resources', 'portable-apps')
        : path.join(process.resourcesPath, 'portable-apps');
        
    try {
        const files = require('fs').readdirSync(portableAppsPath);
        console.log('Verfügbare portable Apps:', files);
        
        files.forEach(file => {
            const filePath = path.join(portableAppsPath, file);
            const stats = require('fs').statSync(filePath);
            console.log(`${file}: ${stats.size} bytes`);
        });
    } catch (error) {
        console.error('Fehler beim Lesen des portable-apps Ordners:', error);
        console.error('Pfad:', portableAppsPath);
    }
}
