const { app, BrowserWindow, Menu, shell, ipcMain, dialog, Tray, Notification } = require('electron');
const { exec, execFile } = require('child_process');
const { version, devDependencies, author } = require('./package.json');
const axios = require('axios');
const path = require('path');
const { type } = require('os');
const { spawn } = require('child_process');
const fs = require('fs');

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
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Wenn wir den Lock nicht bekommen, beende die neue Instanz
  app.quit();
} else {
  // Wenn eine zweite Instanz gestartet wird, fokussiere das existierende Fenster
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      
      // Optional: Zeige eine Benachrichtigung
      const notification = new Notification({
        title: 'FixIT',
        body: 'FixIT läuft bereits',
        silent: true
      });
      notification.show();
    }
  });

  // Normale App-Initialisierung
  app.whenReady().then(async () => {
    Promise.all([
      import('electron-store'),
      listPortableApps()
    ]).then(([{ default: Store }]) => {
      store = new Store();
      createMainWindow();
    });
  });
}

// Am Anfang der Datei, nach den imports
if (process.platform === 'win32') {
  app.setAppUserModelId('com.helpit.fixit');
}

// Fügen Sie diese Zeile am Anfang der Datei hinzu
const isDev = process.env.NODE_ENV === 'development';

// ------------------- Funktionen -------------------

app.setPath('cache', path.join(app.getPath('userData'), 'cache'));

// Hauptfenster-Erstellung anpassen
function createMainWindow() {
    // Splash Screen erstellen
    const splash = new BrowserWindow({
        width: 400,
        height: 300,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // Hauptfenster im Hintergrund laden
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        resizable: true,
        minWidth: 400,
        minHeight: 300,
        title: "FixIT",
        icon: path.join(process.resourcesPath, 'src/assets/images/logo/win/icon.ico'),
        backgroundColor: '#1a1a1a',
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            nodeIntegrationInWorker: true,
            experimentalFeatures: true
        }
    });

    // Optimierte Ladesequenz
    mainWindow.loadFile(path.join(__dirname, 'src', 'index.html')).then(() => {
        loadUserPreferences();
        // Kurze Verzögerung für smootheren Übergang
        setTimeout(() => {
            splash.destroy();
            mainWindow.show();
            mainWindow.focus();
        }, 1500);
    });

    mainWindow.on('close', (event) => {
        if (minimizeToTray && !app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
            showTrayIcon();
        } else {
            app.isQuiting = true;
            mainWindow = null;
            app.quit();
        }
    });
}

// Benutzerpräferenzen laden
const loadUserPreferences = async () => {
    try {
        // Dark Mode
        const isDarkMode = await mainWindow.webContents.executeJavaScript(`
            const darkMode = localStorage.getItem('darkMode') === 'true';
            document.body.classList.toggle('dark-mode', darkMode);
            darkMode;
        `);
        
        const darkModeMenuItem = menu.getMenuItemById('darkModeToggle');
        if (darkModeMenuItem) {
            darkModeMenuItem.checked = isDarkMode;
        }

        // Always on Top
        const alwaysOnTop = await mainWindow.webContents.executeJavaScript(
            `localStorage.getItem('alwaysOnTop')`
        );
        const savedAlwaysOnTop = alwaysOnTop === 'true';
        mainWindow.setAlwaysOnTop(savedAlwaysOnTop);
        const alwaysOnTopMenuItem = menu.getMenuItemById('alwaysOnTopToggle');
        if (alwaysOnTopMenuItem) {
            alwaysOnTopMenuItem.checked = savedAlwaysOnTop;
        }

        // Minimize to Tray
        const minimizeToTrayValue = await mainWindow.webContents.executeJavaScript(
            `localStorage.getItem('minimizeToTray')`
        );
        minimizeToTray = minimizeToTrayValue === 'true';
        const minimizeToTrayMenuItem = menu.getMenuItemById('minimizeToTrayToggle');
        if (minimizeToTrayMenuItem) {
            minimizeToTrayMenuItem.checked = minimizeToTray;
        }

        // Autostart
        const autostart = await mainWindow.webContents.executeJavaScript(
            `localStorage.getItem('autostart')`
        );
        autostartEnabled = autostart === 'true';
        const autostartMenuItem = menu.getMenuItemById('autostartToggle');
        if (autostartMenuItem) {
            autostartMenuItem.checked = autostartEnabled;
        }
        
        app.setLoginItemSettings({
            openAtLogin: autostartEnabled,
            path: process.execPath,
            args: ['--hidden']
        });

    } catch (error) {
        logError(error, 'Fehler beim Laden der Benutzereinstellungen');
    }
};

// Tray-Icon anzeigen
const showTrayIcon = () => {
    if (tray) return;
    try {
        tray = new Tray(path.join(__dirname, './src/assets/images/logo/png/32x32.png'));

        const contextMenu = Menu.buildFromTemplate([
            { label: 'Anzeigen', click: () => mainWindow.show() },
            { 
                label: 'Updates prüfen', 
                click: async () => {
                    try {
                        const { data } = await axios.get('https://api.github.com/repos/AlphaTG50/FixIT/releases/latest');
                        const latestVersion = data.tag_name.replace('v', '');
                        const currentVersion = version;

                        if (compareVersions(latestVersion, currentVersion) > 0) {
                            // Zeige Benachrichtigung statt Dialog
                            const notification = new Notification({
                                title: 'Update verfügbar',
                                body: `Eine neue Version (${data.tag_name}) ist verfügbar.\nKlicken Sie hier zum Installieren.`,
                                icon: path.join(__dirname, './src/assets/images/logo/png/64x64.png'),
                                silent: true
                            });

                            notification.on('click', () => {
                                mainWindow.show();
                                downloadUpdate(data.assets[0].browser_download_url);
                            });

                            notification.show();
                        } else {
                            // Zeige Benachrichtigung für "Kein Update verfügbar"
                            new Notification({
                                title: 'Keine Updates verfügbar',
                                body: 'Sie verwenden bereits die neueste Version.',
                                icon: path.join(__dirname, './src/assets/images/logo/png/64x64.png'),
                                silent: true
                            }).show();
                        }
                    } catch (error) {
                        logError(error, 'Update-Prüfung fehlgeschlagen');
                        new Notification({
                            title: 'Update-Fehler',
                            body: 'Beim Prüfen auf Updates ist ein Fehler aufgetreten.',
                            icon: path.join(__dirname, './src/assets/images/logo/png/64x64.png'),
                            silent: true
                        }).show();
                    }
                } 
            },
            { type: 'separator' },
            { 
                label: 'Beenden', 
                click: () => { 
                    app.isQuiting = true; 
                    app.quit(); 
                } 
            }
        ]);

        tray.setToolTip('FixIT');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => mainWindow.show());
    } catch (error) {
        logError(error, 'Tray-Icon Erstellung fehlgeschlagen');
    }
};

// IPC-Handler für .exe-Ausführung anpassen
ipcMain.handle('execute-exe', async (event, exeName) => {
    return new Promise((resolve, reject) => {
        // Korrigierter Pfad für portable Apps
        const exePath = app.isPackaged 
            ? path.join(process.resourcesPath, 'portable-apps', `${exeName}.exe`)
            : path.join(__dirname, 'src', 'assets', 'portable-apps', `${exeName}.exe`);
        

        // Prüfen ob die Datei existiert
        if (!fs.existsSync(exePath)) {
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
                setTimeout(() => {
                    resolve(true);
                }, 300);
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

// Füge diesen IPC-Handler hinzu
ipcMain.handle('check-process', async (event, processName) => {
    return new Promise((resolve) => {
        const command = process.platform === 'win32'
            ? `tasklist /FI "IMAGENAME eq ${processName}.exe" /NH`
            : `ps aux | grep ${processName}`;
            
        exec(command, (error, stdout) => {
            if (error) {
                console.error(`Fehler beim Prüfen des Prozesses: ${error}`);
                resolve(false);
                return;
            }
            
            // Prüfe ob der Prozess in der Ausgabe gefunden wurde
            // Ignoriere den PowerShell-Prozess selbst
            const isRunning = stdout.toLowerCase().includes(processName.toLowerCase()) &&
                            !stdout.toLowerCase().includes('powershell');
            resolve(isRunning);
        });
    });
});

// Füge diese IPC-Handler in main.js hinzu
ipcMain.handle('execute-powershell', async (event, scriptName) => {
    return new Promise((resolve, reject) => {
        const scriptPath = app.isPackaged 
            ? path.join(process.resourcesPath, 'portable-scripts', scriptName)
            : path.join(__dirname, 'src', 'assets', 'portable-scripts', scriptName);

        if (!fs.existsSync(scriptPath)) {
            console.error('Script nicht gefunden:', scriptPath);
            reject(new Error(`Script nicht gefunden: ${scriptName}`));
            return;
        }

        // Führe das PowerShell-Script mit erhöhten Rechten aus
        const command = `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}"`;
        
        exec(command, { windowsHide: true }, (error, stdout, stderr) => {
            if (error) {
                console.error(`PowerShell Fehler: ${error}`);
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
});

// Ersetze den check-batch-process Handler mit diesem neuen Handler
ipcMain.handle('check-onedrive-process', async () => {
    return new Promise((resolve) => {
        const command = process.platform === 'win32'
            ? `tasklist /FI "IMAGENAME eq OneDrive.exe" /NH`
            : `ps aux | grep OneDrive`;
            
        exec(command, (error, stdout) => {
            if (error) {
                console.error(`Fehler beim Prüfen des OneDrive-Prozesses: ${error}`);
                resolve(false);
                return;
            }
            
            // Prüfe ob der OneDrive-Prozess läuft
            const isRunning = stdout.toLowerCase().includes('onedrive.exe');
            resolve(isRunning);
        });
    });
});

// Aktualisiere den execute-batch Handler
ipcMain.handle('execute-batch', async (event, scriptName) => {
    return new Promise((resolve, reject) => {
        const scriptPath = app.isPackaged 
            ? path.join(process.resourcesPath, 'portable-scripts', scriptName)
            : path.join(__dirname, 'src', 'assets', 'portable-scripts', scriptName);


        if (!fs.existsSync(scriptPath)) {
            console.error('Skript nicht gefunden:', scriptPath);
            reject(new Error(`Skript nicht gefunden: ${scriptName}`));
            return;
        }

        // Führe das Batch-Script mit erhöhten Rechten aus
        const command = `powershell.exe -Command "Start-Process cmd -ArgumentList '/c """${scriptPath}"""' -Verb RunAs -WindowStyle Normal"`;
        
        exec(command, { windowsHide: false }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Batch Script Fehler: ${error}`);
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
});

// ------------------- Anwendung starten -------------------
app.whenReady().then(async () => {
    // Führen Sie zeitintensive Operationen asynchron aus
    Promise.all([
        import('electron-store'),
        listPortableApps()
    ]).then(([{ default: Store }]) => {
        store = new Store();
        createMainWindow();
    });
    
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
                    mainWindow.webContents.executeJavaScript(`
                        localStorage.setItem('darkMode', ${isDarkMode});
                        document.body.classList.toggle('dark-mode', ${isDarkMode});
                    `);
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
            // Hilfe & Support Gruppe
            {
                label: 'Meine Favoriten entfernen',
                click: () => {
                    mainWindow.webContents.executeJavaScript(`
                        localStorage.setItem('favorites', '[]');
                        document.querySelectorAll('.favorite-btn').forEach(btn => {
                            btn.classList.remove('active');
                        });
                        sortAlbumItems();
                    `);
                }
            },
            {
                label: 'TeamViewer QS',
                click: () => {
                    const exePath = app.isPackaged
                        ? path.join(process.resourcesPath, 'portable-apps', 'TeamViewerQS.exe')
                        : path.join(__dirname, 'src', 'assets', 'portable-apps', 'TeamViewerQS.exe');

                    if (fs.existsSync(exePath)) {
                        exec(`"${exePath}"`, (error) => {
                            if (error) {
                                console.error(`Fehler beim Öffnen von TeamViewer: ${error}`);
                                dialog.showErrorBox('Fehler', 
                                    'TeamViewer QS konnte nicht gestartet werden.'
                                );
                            }
                        });
                    } else {
                        console.error('TeamViewer QS nicht gefunden:', exePath);
                        dialog.showErrorBox('Fehler', 
                            'TeamViewer QS wurde nicht gefunden.'
                        );
                    }
                }
            },
            { type: 'separator' },

            // Entwickler Tools
            {
                label: 'Entwickler',
                submenu: [
                    {
                        label: 'DevTools öffnen',
                        click: () => mainWindow.webContents.openDevTools()
                    },
                    {
                        label: 'Logs exportieren',
                        click: async () => {
                            try {
                                const { filePath } = await dialog.showSaveDialog(mainWindow, {
                                    title: 'Logs speichern',
                                    defaultPath: path.join(app.getPath('desktop'), `FixIT-Logs_${new Date().toISOString().split('T')[0]}.txt`),
                                    filters: [
                                        { name: 'Text Files', extensions: ['txt'] },
                                        { name: 'All Files', extensions: ['*'] }
                                    ]
                                });

                                if (filePath) {
                                    const os = require('os');
                                    let logContent = [
                                        `FixIT Diagnostik-Log - Erstellt am ${new Date().toLocaleString()}`,
                                        '==========================================================',
                                        'SYSTEM INFORMATIONEN:',
                                        '---------------------------------------------------------',
                                        `Hostname: ${os.hostname()}`,
                                        `Betriebssystem: ${os.type()} ${os.release()}`,
                                        `OS Build: ${os.version()}`,
                                        `Architektur: ${os.arch()}`,
                                        `Platform: ${process.platform}`,
                                        '',
                                        'HARDWARE INFORMATIONEN:',
                                        '---------------------------------------------------------',
                                        `CPU Modell: ${os.cpus()[0].model}`,
                                        `CPU Kerne: ${os.cpus().length}`,
                                        `CPU Geschwindigkeit: ${os.cpus()[0].speed} MHz`,
                                        `Gesamter RAM: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`,
                                        `Freier RAM: ${Math.round(os.freemem() / 1024 / 1024 / 1024)} GB`,
                                        '',
                                        'BENUTZER & SYSTEM DETAILS:',
                                        '---------------------------------------------------------',
                                        `Benutzername: ${os.userInfo().username}`,
                                        `Home Verzeichnis: ${os.homedir()}`,
                                        `Temp Verzeichnis: ${os.tmpdir()}`,
                                        `System Uptime: ${Math.floor(os.uptime() / 3600)} Stunden`,
                                        `Netzwerk Interfaces: ${Object.keys(os.networkInterfaces()).join(', ')}`,
                                        '',
                                        'FIXIT PROGRAMM INFORMATIONEN:',
                                        '---------------------------------------------------------',
                                        `FixIT Version: ${version}`,
                                        `Electron Version: ${process.versions.electron}`,
                                        `Chrome Version: ${process.versions.chrome}`,
                                        `Node Version: ${process.versions.node}`,
                                        `V8 Version: ${process.versions.v8}`,
                                        '',
                                        'UMGEBUNGSVARIABLEN:',
                                        '---------------------------------------------------------',
                                        `App Pfad: ${app.getPath('exe')}`,
                                        `User Data Pfad: ${app.getPath('userData')}`,
                                        `Temp Pfad: ${app.getPath('temp')}`
                                    ].join('\n');

                                    // Hinweise anhängen
                                    logContent += '\n\nHINWEIS:';
                                    logContent += '\n---------------------------------------------------------';
                                    logContent += '\nDiese Log-Datei enthält wichtige System- und Programminformationen,';
                                    logContent += '\ndie für die Fehlerdiagnose benötigt werden. Bitte senden Sie diese';
                                    logContent += '\nDatei an den Support, wenn Sie technische Probleme mit FixIT haben.';
                                    logContent += '\n\nKontakt: guerkan.privat@gmail.com';

                                    require('fs').writeFileSync(filePath, logContent);

                                    dialog.showMessageBox(mainWindow, {
                                        type: 'info',
                                        title: 'Logs exportiert',
                                        message: 'Die Diagnose-Logs wurden erfolgreich exportiert.',
                                        detail: 'Sie finden die Log-Datei am ausgewählten Speicherort.',
                                        buttons: ['OK']
                                    });
                                }
                            } catch (error) {
                                dialog.showErrorBox('Fehler', 
                                    'Beim Exportieren der Logs ist ein Fehler aufgetreten: ' + error.message
                                );
                            }
                        }
                    }
                ]
            },
            { type: 'separator' },

            // Extras & Features
            {
                label: 'Easter Eggs Menü',
                click: () => {
                    const easterEggWindow = new BrowserWindow({
                        width: 400,
                        height: 500,
                        title: "Easter Eggs",
                        modal: false,
                        parent: mainWindow,
                        show: false,
                        frame: false,
                        webPreferences: {
                            nodeIntegration: true,
                            contextIsolation: false
                        },
                        backgroundColor: '#e3ffe3',
                        minimizable: false,
                        maximizable: false,
                        resizable: false,
                        autoHideMenuBar: true,
                        menuBarVisible: false,
                        alwaysOnTop: true
                    });

                    easterEggWindow.setMenu(null);

                    easterEggWindow.once('ready-to-show', () => {
                        easterEggWindow.show();
                    });

                    easterEggWindow.webContents.on('before-input-event', (event, input) => {
                        if (input.key === 'Escape') {
                            easterEggWindow.close();
                        }
                    });

                    easterEggWindow.loadFile(path.join(__dirname, 'src', 'sites', 'easter-eggs', 'easter-eggs.html'));
                }
            },
            {
                label: 'Shortcuts Menü',
                click: () => {
                    const shortcutsWindow = new BrowserWindow({
                        width: 400,
                        height: 500,
                        title: "Shortcuts",
                        modal: false,
                        parent: mainWindow,
                        show: false,
                        frame: false,
                        webPreferences: {
                            nodeIntegration: true,
                            contextIsolation: false
                        },
                        backgroundColor: '#ffffff',
                        minimizable: false,
                        maximizable: false,
                        resizable: false,
                        autoHideMenuBar: true,
                        menuBarVisible: false,
                        alwaysOnTop: true
                    });

                    shortcutsWindow.setMenu(null);

                    shortcutsWindow.once('ready-to-show', () => {
                        shortcutsWindow.show();
                    });

                    shortcutsWindow.webContents.on('before-input-event', (event, input) => {
                        if (input.key === 'Escape') {
                            shortcutsWindow.close();
                        }
                    });

                    shortcutsWindow.loadFile(path.join(__dirname, 'src', 'sites', 'shortcuts', 'shortcuts.html'));
                }
            },
            { type: 'separator' },

            // Info
            {
                label: 'Updates prüfen',
                click: async () => {
                    checkForUpdates();
                }
            },
            {
                label: 'Lizenz (In Entwicklung)',
                click: () => {
                    dialog.showMessageBox(mainWindow, {
                        type: "warning",
                        title: 'Lizenzsteuerung',
                        message: `In Entwicklung!`,
                        buttons: ['OK'],
                        noLink: true
                    });
                }
            },
            {
                label: 'Über FixIT',
                click: () => {
                    dialog.showMessageBox(mainWindow, {
                        type: "info",
                        title: 'FixIT',
                        message: `Version: ${version}\n\nEntwickelt von ${author}\nKontakt: guerkan.privat@gmail.com`,
                        buttons: ['OK'],
                        noLink: true
                    });
                }
            }
        ]
    }
];

// Menü erstellen und setzen
const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

// Fügen Sie diese Funktion am Anfang der Datei hinzu
function listPortableApps() {
    const portableAppsPath = app.isPackaged
        ? path.join(process.resourcesPath, 'portable-apps')
        : path.join(__dirname, 'src', 'assets', 'portable-apps');
        
    try {
        if (!fs.existsSync(portableAppsPath)) {
            console.error('Portable-Apps Ordner existiert nicht:', portableAppsPath);
            return;
        }

        const files = fs.readdirSync(portableAppsPath);
        
        files.forEach(file => {
            const filePath = path.join(portableAppsPath, file);
            const stats = fs.statSync(filePath);
        });
    } catch (error) {
        console.error('Fehler beim Lesen des portable-apps Ordners:', error);
        console.error('Pfad:', portableAppsPath);
    }
}

// Update-Funktion aktualisieren
async function checkForUpdates() {
    try {
        const { data } = await axios.get('https://api.github.com/repos/AlphaTG50/FixIT/releases/latest');
        
        const latestVersion = data.tag_name.replace('v', '');
        const currentVersion = version;

        if (compareVersions(latestVersion, currentVersion) > 0) {
            const { response, checkboxChecked } = await dialog.showMessageBox({
                type: 'info',
                buttons: ['Jetzt installieren', 'Später'],
                title: 'Update verfügbar',
                message: `Eine neue Version (${data.tag_name}) ist verfügbar.`,
                detail: `Aktuelle Version: v${currentVersion}`,
                cancelId: 1,
                noLink: true
            });

            if (response === 0) {
                await downloadUpdate(data.assets[0].browser_download_url);
            }
        } else {
            dialog.showMessageBox({
                type: 'info',
                title: 'Keine Updates verfügbar',
                message: `Sie verwenden bereits die neueste Version.`
            });
        }
    } catch (error) {
        dialog.showErrorBox('Update-Fehler', 
            'Beim Prüfen auf Updates ist ein Fehler aufgetreten.\n' +
            'Bitte überprüfen Sie Ihre Internetverbindung.'
        );
        console.error('Update-Fehler:', error);
    }
}

async function downloadUpdate(downloadUrl) {
    const progressWindow = new BrowserWindow({
        width: 400,
        height: 150,
        frame: false,
        resizable: false,
        parent: mainWindow,
        modal: true,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    progressWindow.loadFile(path.join(__dirname, 'src', 'sites', 'update-progress', 'update-progress.html'));
    progressWindow.once('ready-to-show', () => progressWindow.show());

    progressWindow.on('close', () => {
        progressWindow.destroy();
    });

    try {
        // Download-Pfad für die Setup.exe
        const downloadPath = path.join(app.getPath('temp'), 'FixIT.Setup.exe');
        
        // Download durchführen
        const response = await axios({
            method: 'get',
            url: downloadUrl,
            responseType: 'stream',
            onDownloadProgress: (progressEvent) => {
                if (!progressWindow.isDestroyed()) {
                    const progress = (progressEvent.loaded / progressEvent.total) * 100;
                    progressWindow.webContents.send('download-progress', progress);
                }
            }
        });

        if (progressWindow.isDestroyed()) return;

        // Setup.exe speichern
        const writer = fs.createWriteStream(downloadPath);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        if (!progressWindow.isDestroyed()) {
            progressWindow.close();
            
            const installChoice = dialog.showMessageBoxSync({
                type: 'info',
                buttons: ['Jetzt installieren', 'Später'],
                title: 'Update bereit',
                message: 'Das Update wurde heruntergeladen. Die Anwendung wird geschlossen und das Update gestartet.'
            });

            if (installChoice === 0) {
                // Setup.exe ausführen und App beenden
                exec(`"${downloadPath}"`, (error) => {
                    if (error) {
                        dialog.showErrorBox('Update-Fehler', 
                            'Beim Starten des Updates ist ein Fehler aufgetreten.'
                        );
                        console.error('Update-Fehler:', error);
                        return;
                    }
                    app.quit();
                });
            }
        }

    } catch (error) {
        if (!progressWindow.isDestroyed()) {
            progressWindow.close();
            dialog.showErrorBox('Download-Fehler', 
                'Beim Herunterladen des Updates ist ein Fehler aufgetreten.'
            );
        }
        console.error('Download-Fehler:', error);
    }
}

// Hilfsfunktion zum Vergleichen von Versionen
function compareVersions(v1, v2) {
    const v1Parts = v1.split('.').map(Number);
    const v2Parts = v2.split('.').map(Number);
    
    for (let i = 0; i < 3; i++) {
        if (v1Parts[i] > v2Parts[i]) return 1;
        if (v1Parts[i] < v2Parts[i]) return -1;
    }
    return 0;
}
