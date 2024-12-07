const { ipcRenderer } = require('electron');
const { execFile, exec } = require('child_process');
const { version } = require('../package.json');
const { networkInterfaces } = require('os');
const os = require('os');
let containerWidth;

// Konstanten für Menüs und andere häufig verwendete Strings
const MENU_IDS = {
    DARK_MODE: 'darkModeToggle',
    ALWAYS_ON_TOP: 'alwaysOnTopToggle',
};

// Am Anfang der Datei nach den Konstanten
let clickCount = 0;
const logo = document.querySelector('.logo svg');

// Easter Egg Event Listener für das Logo
logo.addEventListener('click', () => {
    clickCount++;
    
    if (clickCount === 16) {
        document.body.style.transition = 'transform 1s ease-in-out';
        document.body.style.transform = 'rotate(180deg)';
        
        // Easter Egg als gefunden markieren
        const foundEasterEggs = JSON.parse(localStorage.getItem('foundEasterEggs') || '[]');
        if (!foundEasterEggs.includes('logo_rotation')) {
            foundEasterEggs.push('logo_rotation');
            localStorage.setItem('foundEasterEggs', JSON.stringify(foundEasterEggs));
            
            new Notification('Easter Egg', {
                body: 'Logo Rotation freigeschaltet',
                icon: './assets/images/logo/png/64x64.png',
                silent: true
            });
        }
        
        setTimeout(() => {
            document.body.style.transform = 'rotate(0deg)';
            setTimeout(() => {
                document.body.style.transition = '';
            }, 1000);
        }, 3000);
        
        clickCount = 0;
    }
    
    // Reset nach 3 Sekunden wenn nicht genug Klicks
    setTimeout(() => {
        if (clickCount < 16) clickCount = 0;
    }, 3000);
});

// Funktion für Easter Egg Benachrichtigungen
function showEasterEggNotification(title, message) {
    const notification = new Notification(title, {
        body: message,
        icon: './assets/images/logo/png/64x64.png'
    });
}

// Funktion zum Ausführen einer exe-Datei
async function executeExe(exeName) {
    try {
        showLoadingScreen();
        
        await ipcRenderer.invoke('execute-exe', exeName);
        
        // Warte und prüfe, ob das Programm läuft
        await new Promise((resolve) => {
            const checkInterval = setInterval(async () => {
                try {
                    // Prüfe ob der Prozess noch läuft
                    const isRunning = await ipcRenderer.invoke('check-process', exeName);
                    if (isRunning) {
                        clearInterval(checkInterval);
                        hideLoadingScreen();
                        resolve();
                    }
                } catch (err) {
                    console.error('Fehler beim Prüfen des Prozesses:', err);
                }
            }, 500); // Prüfe alle 500ms
            
            // Timeout nach 30 Sekunden
            setTimeout(() => {
                clearInterval(checkInterval);
                hideLoadingScreen();
                resolve();
            }, 30000);
        });
        
    } catch (err) {
        console.error('Detaillierter Fehler:', err);
        hideLoadingScreen();
        
        const errorMessage = err.message.includes('nicht gefunden') 
            ? `Das Programm "${exeName}" konnte nicht gefunden werden.`
            : `Fehler beim Starten von "${exeName}".\nFehlermeldung: ${err.message}`;
            
        showErrorModal(errorMessage);
    }
}

// Aktualisiere die executePowerShellScript Funktion
async function executePowerShellScript(scriptName) {
    try {
        showLoadingScreen();
        
        // Nutze ipcRenderer um mit dem Hauptprozess zu kommunizieren
        await ipcRenderer.invoke('execute-powershell', scriptName);
        
        hideLoadingScreen();
    } catch (err) {
        console.error('PowerShell Script Fehler:', err);
        hideLoadingScreen();
        showErrorModal(`Fehler beim Ausführen des Scripts: ${err.message}`);
    }
}

// Füge diese Funktion nach executePowerShellScript hinzu
async function executeBatchScript(scriptName) {
    try {
        showLoadingScreen();
        
        // Starte das Batch-Skript
        await ipcRenderer.invoke('execute-batch', scriptName);
        
        // Warte eine kurze Zeit für das UAC-Fenster
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Warte und prüfe, ob der OneDrive-Prozess läuft
        await new Promise((resolve) => {
            let checkCount = 0;
            const maxChecks = 10; // 5 Sekunden maximale Wartezeit
            
            const checkInterval = setInterval(async () => {
                try {
                    checkCount++;
                    const isRunning = await ipcRenderer.invoke('check-onedrive-process');
                    
                    if (!isRunning || checkCount >= maxChecks) {
                        clearInterval(checkInterval);
                        hideLoadingScreen();
                        resolve();
                    }
                } catch (err) {
                    console.error('Fehler beim Prüfen des Prozesses:', err);
                    clearInterval(checkInterval);
                    hideLoadingScreen();
                    resolve();
                }
            }, 500);
        });
        
    } catch (err) {
        console.error('Batch Script Fehler:', err);
        hideLoadingScreen();
        showErrorModal(`Fehler beim Ausführen des Scripts: ${err.message}`);
    }
}

// Modifiziere den Event-Listener für Album-Items
document.querySelectorAll('.albumitem').forEach(item => {
    item.addEventListener('click', async function(e) {
        // Verhindere das Standard-Klick-Verhalten
        e.preventDefault();
        
        // Prüfe ob es ein Website-Badge hat
        const hasWebsiteBadge = this.querySelector('.Website-Badge');
        // Prüfe ob es ein Entwicklungs-Badge hat
        const hasEntwicklungBadge = this.querySelector('.Entwicklung-Badge');
        
        // Wenn es ein Website-Badge hat, öffne den Link
        if (hasWebsiteBadge) {
            const link = this.querySelector('a');
            if (link) {
                // Öffne das Fenster mit spezifischen Dimensionen
                const width = 1200;  // Breite des Fensters
                const height = 800;  // Höhe des Fensters
                const left = (screen.width - width) / 2;
                const top = (screen.height - height) / 2;
                
                window.open(
                    link.href,
                    '_blank',
                    `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=yes,location=yes,status=yes,scrollbars=yes`
                );
            }
            return;
        }
        
        // Wenn es kein Entwicklungs-Badge hat und kein Website-Badge, führe das Programm aus
        if (!hasEntwicklungBadge && !hasWebsiteBadge) {
            const programName = this.getAttribute('data-search');
            
            try {
                if (programName === 'MicrosoftActivation') {
                    await executePowerShellScript('MicrosoftActivation.ps1');
                } else if (programName === 'OneDriveUninstaller') {
                    await executeBatchScript('OneDriveUninstaller.bat');
                } else {
                    await executeExe(programName);
                }
            } catch (error) {
                showErrorModal(`Fehler beim Ausführen von ${programName}: ${error.message}`);
            }
        }
    });
});

// Aktualisiere die filterAlbums Funktion
function filterAlbums() {
    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    const albums = Array.from(document.querySelectorAll('.albumitem'));
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    let hasResults = false;

    // Füge No-Results-Message hinzu, falls noch nicht vorhanden
    let noResultsMsg = document.querySelector('.no-results-message');
    if (!noResultsMsg) {
        noResultsMsg = document.createElement('div');
        noResultsMsg.className = 'no-results-message';
        noResultsMsg.textContent = 'Keine Ergebnisse gefunden';
        noResultsMsg.style.display = 'none';
        document.querySelector('.albumlist').appendChild(noResultsMsg);
    }

    // Sortiere die Alben alphabetisch und nach Favoriten
    albums.sort((a, b) => {
        const aIsFav = favorites.includes(a.getAttribute('data-search'));
        const bIsFav = favorites.includes(b.getAttribute('data-search'));
        
        if (aIsFav && !bIsFav) return -1;
        if (!aIsFav && bIsFav) return 1;
        
        const titleA = a.querySelector('h1').textContent.toLowerCase();
        const titleB = b.querySelector('h1').textContent.toLowerCase();
        return titleA.localeCompare(titleB);
    });

    // Aktualisiere die Reihenfolge im DOM
    const albumList = document.querySelector('.albumlist');
    albums.forEach(album => albumList.appendChild(album));

    // Filtere und zeige/verstecke Alben
    albums.forEach(album => {
        const dataSearch = album.getAttribute('data-search').toLowerCase();
        
        // Exakte Übereinstimmung mit data-search
        const matchesSearch = searchTerm === '' || dataSearch.includes(searchTerm);

        if (matchesSearch) {
            hasResults = true;
            album.style.display = '';
            album.style.opacity = '1';
            album.style.transform = 'scale(1)';
        } else {
            album.style.display = 'none';
            album.style.opacity = '0';
            album.style.transform = 'scale(0.95)';
        }
    });

    // Zeige/Verstecke "Keine Ergebnisse" Nachricht
    if (!hasResults && searchTerm !== '') {
        noResultsMsg.style.display = 'block';
        noResultsMsg.style.opacity = '1';
    } else {
        noResultsMsg.style.display = 'none';
        noResultsMsg.style.opacity = '0';
    }
}

// Event Listener für die Suche
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            filterAlbums();
        });
        // Initialisiere die Suche und Sortierung
        filterAlbums();
    }
});

// Funktion zur Anpassung der Grid-Spalten
function adjustGridColumns() {
    const albumWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--album-width'));
    const minColumns = Math.floor(containerWidth / albumWidth);
    const maxColumns = Math.min(6, minColumns);
    document.documentElement.style.setProperty('--grid-columns', maxColumns); // CSS-Variable setzen
}

// Event-Listener für das Fenstergrößen-Ändern
window.addEventListener('resize', adjustGridColumns);

// Event-Listener für das Laden der DOM-Inhalte anpassen
document.addEventListener('DOMContentLoaded', () => {
    // Initialisiere Dark Mode als erstes
    initializeDarkMode();
    
    containerWidth = document.documentElement.clientWidth;
    adjustGridColumns();

    // Warte einen kurzen Moment, bis das DOM vollständig geladen ist
    setTimeout(() => {
        // Initialisiere Favoriten und sortiere
        initializeFavorites();
        
        // Führe die Sortierung explizit durch
        const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
        if (favorites.length > 0) {
            sortAlbumItems();
        }
        
        // Füge Favoriten-Buttons hinzu
        addFavoriteButtonsToAll();
    }, 100);

    // Startup Loading Screen
    const startupLoadingScreen = document.getElementById('startup-loading-screen');
    
    setTimeout(() => {
        startupLoadingScreen?.classList.add('fade-out');
        setTimeout(() => {
            if (startupLoadingScreen) {
                startupLoadingScreen.style.display = 'none';
            }
        }, 500);
    }, 2000);

    // Initialisiere Hover-Effekte für alle Album-Items
    document.querySelectorAll('.albumitem').forEach(album => {
        if (!album.querySelector('.Entwicklung-Badge')) {
            album.onmouseenter = () => {
                album.style.opacity = '1';
                album.style.transform = 'translateX(10px)';
            };
            
            album.onmouseleave = () => {
                album.style.opacity = '0.8';
                album.style.transform = 'translateX(0)';
            };
        }
    });

    // Version aus package.json in die Statusbar einfügen
    document.getElementById('versionInfo').textContent = `Version ${version}`;
    
    // WLAN-Namen abrufen und alle 30 Sekunden aktualisieren
    getWifiName();
    setInterval(getWifiName, 30000);
    
    // RAM, CPU, Uptime - alle 2 Sekunden
    updateSystemRAMCPU();
    setInterval(updateSystemRAMCPU, 2000);
    
    // Festplattennutzung - alle 5 Sekunden
    updateDiskSpace();
    setInterval(updateDiskSpace, 5000);
    
    // Stelle den Status Bar Status wieder her
    const statusBar = document.querySelector('.status-bar');
    if (localStorage.getItem('statusBarCollapsed') === 'true') {
        statusBar.classList.add('collapsed');
    }
});

// Fehlerbehandlung bei nicht gefundenen Alben
function handleAlbumNotFound(album) {
    // console.warn entfernt
}

// Dark Mode beim Laden wiederherstellen
if (localStorage.getItem('darkMode') === 'true') {
  document.body.classList.add('dark-mode');
}

// Fügen Sie diese Funktionen am Anfang der Datei hinzu
function showLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.remove('hidden');
    }
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
    }
}

// Modifizieren Sie die Funktion, die das Programm startet
async function executeProgram(programName) {
  try {
    showLoadingScreen();
    
    await window.electron.execute(programName);
    
    setTimeout(() => {
      hideLoadingScreen();
    }, 1500);
    
  } catch (error) {
    console.error('Fehler beim Starten des Programms:', error);
    hideLoadingScreen();
  }
}

// Aktualisiere die showErrorModal Funktion
function showErrorModal(message) {
    const errorModal = document.getElementById('errorModal');
    const errorOverlay = document.getElementById('errorOverlay');
    const errorMessage = document.getElementById('errorMessage');
    
    // Protokolliere den Fehler
    ipcRenderer.send('log-error', {
        error: new Error(message),
        context: 'Error Modal',
        timestamp: new Date().toISOString(),
        userAction: document.activeElement?.tagName || 'Unknown',
        location: window.location.href
    });
    
    // Prüfe Dark Mode
    if (document.body.classList.contains('dark-mode')) {
        errorModal.classList.add('dark-mode');
    }
    
    errorMessage.textContent = message;
    errorModal.style.display = 'block';
    errorOverlay.style.display = 'block';
}

function hideErrorModal() {
    const errorModal = document.getElementById('errorModal');
    const errorOverlay = document.getElementById('errorOverlay');
    
    // Entferne nur den Hover-Effekt vom aktuell gehoverten Element
    const hoveredElement = document.querySelector('.not-found-hover');
    if (hoveredElement) {
        hoveredElement.classList.remove('not-found-hover');
    }
    
    errorModal.style.display = 'none';
    errorOverlay.style.display = 'none';
}

// Event-Listener für ESC-Taste zum Schließen des Modals
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // Entferne alle hover Effekte
        document.querySelectorAll('.albumitem').forEach(item => {
            item.classList.remove('not-found-hover');
        });
        hideErrorModal();
    }
});

// Fügen Sie einen Click-Handler für den Overlay hinzu
document.getElementById('errorOverlay')?.addEventListener('click', () => {
    hideErrorModal();
});

// Nach den bestehenden Easter Egg Definitionen
let searchCode = '';
const searchInput = document.getElementById('searchInput');

searchInput.addEventListener('input', (e) => {
    searchCode += e.target.value.toLowerCase();
    
    if (searchCode.includes('matrix')) {
        searchInput.value = '';
        createMatrixEffect(); // Direkt die Funktion aufrufen
        
        // Easter Egg Logik
        const foundEasterEggs = JSON.parse(localStorage.getItem('foundEasterEggs') || '[]');
        if (!foundEasterEggs.includes('matrix_code')) {
            foundEasterEggs.push('matrix_code');
            localStorage.setItem('foundEasterEggs', JSON.stringify(foundEasterEggs));
            
            new Notification('Easter Egg', {
                body: 'Matrix Code freigeschaltet',
                icon: './assets/images/logo/png/64x64.png',
                silent: true
            });
        }
        
        searchCode = '';
    }
    
    if (searchCode.includes('dvd')) {
        searchInput.value = '';
        createDVDBounce();
        
        // Easter Egg Logik
        const foundEasterEggs = JSON.parse(localStorage.getItem('foundEasterEggs') || '[]');
        if (!foundEasterEggs.includes('dvd_bounce')) {
            foundEasterEggs.push('dvd_bounce');
            localStorage.setItem('foundEasterEggs', JSON.stringify(foundEasterEggs));
            
            new Notification('Easter Egg', {
                body: 'DVD Logo Bounce freigeschaltet',
                icon: './assets/images/logo/png/64x64.png',
                silent: true
            });
        }
        
        searchCode = '';
    }
    
    setTimeout(() => searchCode = '', 2000);
});

// Matrix-Effekt Funktion direkt in index.js
function createMatrixEffect() {
    // Suchleiste deaktivieren
    const searchInput = document.getElementById('searchInput');
    searchInput.disabled = true;
    
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '9999';
    canvas.style.opacity = '0.9';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const letters = '0123456789ABCDEF';
    const fontSize = 12; // Kleinere Schriftgröße (von 20 auf 12 geändert)
    const columns = canvas.width / fontSize;
    const drops = Array(Math.floor(columns)).fill(1);
    let opacity = 1;
    let fadeStarted = false;

    function draw() {
        ctx.fillStyle = `rgba(0, 0, 0, ${fadeStarted ? 0.02 * opacity : 0.05})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = `rgba(0, 255, 0, ${opacity * 0.9})`;
        ctx.font = `${fontSize}px monospace`; // Kleinere Schriftgröße wird hier verwendet

        for (let i = 0; i < drops.length; i++) {
            const text = letters[Math.floor(Math.random() * letters.length)];
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);
            if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i]++;
        }
    }

    const matrixInterval = setInterval(draw, 33);

    // Nach 4 Sekunden mit dem Ausblenden beginnen
    setTimeout(() => {
        fadeStarted = true;
        const fadeInterval = setInterval(() => {
            opacity -= 0.01;
            
            if (opacity <= 0.05) {
                canvas.style.transition = 'opacity 0.5s ease-out';
                canvas.style.opacity = '0';
                
                setTimeout(() => {
                    clearInterval(matrixInterval);
                    clearInterval(fadeInterval);
                    canvas.remove();
                    // Suchleiste wieder aktivieren
                    searchInput.disabled = false;
                }, 500);
            }
        }, 60);
    }, 4000);
}

// Füge die DVD Bounce Funktion hinzu
function createDVDBounce() {
    const searchInput = document.getElementById('searchInput');
    searchInput.disabled = true;
    
    const dvdLogo = document.createElement('div');
    dvdLogo.style.position = 'fixed';
    dvdLogo.style.zIndex = '9999';
    dvdLogo.style.width = '150px';
    dvdLogo.style.height = '150px';
    dvdLogo.style.transition = 'none'; // Verhindert unerwünschte Transitionen
    dvdLogo.innerHTML = document.querySelector('.logo svg').outerHTML;
    
    // Setze initiale Position
    dvdLogo.style.left = '0px';
    dvdLogo.style.top = '0px';
    document.body.appendChild(dvdLogo);

    let x = Math.random() * (window.innerWidth - 150);
    let y = Math.random() * (window.innerHeight - 150);
    let xSpeed = 2; // Reduzierte Geschwindigkeit für smoothere Animation
    let ySpeed = 2;
    let hue = 0;

    function updatePosition() {
        // Aktualisiere Position
        x += xSpeed;
        y += ySpeed;

        // Kollisionserkennung mit Bildschirmrändern
        if (x <= 0 || x >= window.innerWidth - 150) {
            xSpeed = -xSpeed;
            changeColor();
        }
        if (y <= 0 || y >= window.innerHeight - 150) {
            ySpeed = -ySpeed;
            changeColor();
        }

        // Begrenze die Position innerhalb des Bildschirms
        x = Math.max(0, Math.min(x, window.innerWidth - 150));
        y = Math.max(0, Math.min(y, window.innerHeight - 150));

        // Aktualisiere die Position mit transform statt left/top
        dvdLogo.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }

    function changeColor() {
        hue = (hue + 60) % 360;
        const svg = dvdLogo.querySelector('svg');
        if (svg) {
            svg.style.fill = `hsl(${hue}, 100%, 50%)`;
        }
    }

    // Setze initiale Farbe
    changeColor();

    // Starte Animation
    const animation = setInterval(updatePosition, 16);

    // Füge Resize-Handler hinzu
    const handleResize = () => {
        // Begrenze Position bei Fenstergrößenänderung
        x = Math.min(x, window.innerWidth - 150);
        y = Math.min(y, window.innerHeight - 150);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup nach 10 Sekunden
    setTimeout(() => {
        // Sanftes Ausblenden
        dvdLogo.style.transition = 'opacity 0.5s ease-out';
        dvdLogo.style.opacity = '0';
        
        setTimeout(() => {
            clearInterval(animation);
            window.removeEventListener('resize', handleResize);
            dvdLogo.remove();
            searchInput.disabled = false;
        }, 500);
    }, 10000);
}

// Ersetze den bestehenden Event Listener für STRG+S
document.addEventListener('keydown', (e) => {
    // Prüfe auf Strg+F (Windows) oder Cmd+F (Mac)
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault(); // Verhindert das Standard-Suchen-Verhalten des Browsers
        
        // Fokussiere die Suchleiste
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.focus();
            // Optional: Selektiere den gesamten Text in der Suchleiste
            searchInput.select();
        }
    }
});

// Füge diese neuen Funktionen hinzu
function initializeFavorites() {
    addFavoriteButtonsToAll();
    
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    
    document.querySelectorAll('.albumitem').forEach(item => {
        const favBtn = item.querySelector('.favorite-btn');
        if (!favBtn) return;
        
        const programId = item.getAttribute('data-search');
        
        if (favorites.includes(programId)) {
            favBtn.classList.add('active');
        }
        
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(programId, favBtn);
            // Verzögere die Sortierung leicht für bessere Animation
            requestAnimationFrame(() => {
                sortAlbumItems();
            });
        });
    });
    
    // Führe die initiale Sortierung durch
    sortAlbumItems();
}

function toggleFavorite(programId, btn) {
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    const index = favorites.indexOf(programId);
    const item = btn.closest('.albumitem');
    
    if (index === -1) {
        favorites.push(programId);
        btn.classList.add('active');
        
        // Sanfte Animation beim Hinzufügen zu Favoriten
        item.style.transition = 'all 0.3s ease';
    } else {
        favorites.splice(index, 1);
        btn.classList.remove('active');
    }
    
    localStorage.setItem('favorites', JSON.stringify(favorites));
    
    // Verzögere die Sortierung leicht
    requestAnimationFrame(() => {
        sortAlbumItems();
    });
}

// Sortier-Funktion optimieren
function sortAlbumItems() {
    const albumList = document.querySelector('.albumlist');
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    const items = Array.from(document.querySelectorAll('.albumitem'));
    
    // Sortiere die Items
    items.sort((a, b) => {
        const aIsFav = favorites.includes(a.getAttribute('data-search'));
        const bIsFav = favorites.includes(b.getAttribute('data-search'));
        
        // Favoriten zuerst
        if (aIsFav && !bIsFav) return -1;
        if (!aIsFav && bIsFav) return 1;
        
        // Bei gleichem Favoritenstatus alphabetisch sortieren
        const titleA = a.querySelector('.albumtitle h1').textContent.toLowerCase();
        const titleB = b.querySelector('.albumtitle h1').textContent.toLowerCase();
        return titleA.localeCompare(titleB);
    });

    // Entferne alle Items
    items.forEach(item => item.remove());

    // Füge die sortierten Items wieder hinzu
    items.forEach(item => {
        albumList.appendChild(item);
        
        // Optional: Füge eine Animation für neue Positionen hinzu
        requestAnimationFrame(() => {
            item.style.opacity = '1';
            item.style.transform = 'translateX(0)';
        });
    });
}

// Funktion zum Hinzufügen der Favoriten-Buttons
function addFavoriteButtonsToAll() {
    document.querySelectorAll('.albumitem').forEach(item => {
        // Überspringe Items mit WIP-Label
        if (item.querySelector('.Entwicklung-Badge')) return;
        
        // Prüfe ob bereits ein Favoriten-Button existiert
        if (!item.querySelector('.favorite-btn')) {
            const favBtn = document.createElement('button');
            favBtn.className = 'favorite-btn';
            favBtn.title = 'Als Favorit markieren';
            favBtn.innerHTML = '<i class="fas fa-star"></i>';
            
            // Füge den Button als erstes Element im albumitem ein
            item.insertBefore(favBtn, item.firstChild);
        }
    });
}

// Event-Listener für IPC
ipcRenderer.on('error', (event, errorMessage) => {
    console.error('IPC Error:', errorMessage);
    alert('Ein Fehler ist aufgetreten: ' + errorMessage);
});

// Entferne alle Debug-Logs
function listPortableApps() {
    const portableAppsPath = app.isPackaged
        ? path.join(process.resourcesPath, 'portable-apps')
        : path.join(__dirname, 'src', 'portable-apps');
        
    try {
        if (!fs.existsSync(portableAppsPath)) {
            return;
        }

        const files = fs.readdirSync(portableAppsPath);
        
        files.forEach(file => {
            const filePath = path.join(portableAppsPath, file);
            fs.statSync(filePath);
        });
    } catch (error) {
        console.error('Kritischer Fehler beim Lesen des portable-apps Ordners:', error);
    }
}

// Update-Funktion aktualisieren
async function checkForUpdates() {
    try {
        // ... bestehender Code ...
    } catch (error) {
        console.error('Kritischer Update-Fehler:', error);
        dialog.showErrorBox('Update-Fehler', 
            'Beim Prüfen auf Updates ist ein Fehler aufgetreten.\n' +
            'Bitte überprüfen Sie Ihre Internetverbindung.'
        );
    }
}

// Download-Funktion aktualisieren
async function downloadUpdate(downloadUrl) {
    // ... bestehender Code ...
    try {
        // ... Download-Logik ...
    } catch (error) {
        console.error('Kritischer Download-Fehler:', error);
        if (!progressWindow.isDestroyed()) {
            progressWindow.close();
            dialog.showErrorBox('Download-Fehler', 
                'Beim Herunterladen des Updates ist ein Fehler aufgetreten.'
            );
        }
    }
}

// Ersetze den bestehenden Dark Mode Event Listener mit diesem aktualisierten Code
ipcRenderer.on('toggle-dark-mode', (event, isDarkMode) => {
    // Sofort den Dark Mode im Body togglen
    document.body.classList.toggle('dark-mode', isDarkMode);
    
    // Dark Mode Status im localStorage speichern
    localStorage.setItem('darkMode', isDarkMode);
    
    // Optional: Benachrichtige andere Teile der App über die Änderung
    document.dispatchEvent(new CustomEvent('darkModeChanged', { 
        detail: { isDarkMode } 
    }));
});

// Füge diese Funktion hinzu, um den Dark Mode Status beim Start zu laden
function initializeDarkMode() {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    document.body.classList.toggle('dark-mode', savedDarkMode);
}

// Füge diese neue Funktion hinzu
function getWifiName() {
    try {
        // Windows-spezifischer Befehl
        exec('netsh wlan show interfaces', (error, stdout) => {
            if (error) {
                document.getElementById('connectionStatus').textContent = 'Nicht verbunden';
                return;
            }
            
            // Extrahiere den SSID-Namen aus der Ausgabe
            const ssidMatch = stdout.match(/SSID\s*: (.*)/);
            if (ssidMatch && ssidMatch[1]) {
                const ssidName = ssidMatch[1].trim();
                document.getElementById('connectionStatus').textContent = ssidName;
            } else {
                document.getElementById('connectionStatus').textContent = 'Nicht verbunden';
            }
        });
    } catch (error) {
        document.getElementById('connectionStatus').textContent = 'Nicht verbunden';
    }
}

// Teile updateSystemInfo in separate Funktionen auf
function updateSystemRAMCPU() {
    // RAM Status
    const totalRAM = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(1);
    const freeRAM = (os.freemem() / (1024 * 1024 * 1024)).toFixed(1);
    const usedRAM = (totalRAM - freeRAM).toFixed(1);
    document.getElementById('ramStatus').textContent = `${usedRAM}/${totalRAM} GB`;

    // CPU Status
    const cpus = os.cpus();
    const cpuModel = cpus[0].model.split(' ').slice(0, 3).join(' ');
    document.getElementById('cpuStatus').textContent = `${cpuModel}`;

    // Uptime kompakter formatiert
    const uptimeSeconds = os.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    
    let uptimeText = '';
    if (hours > 0) {
        uptimeText += `${hours}h`;
        if (minutes > 0) {
            uptimeText += ` ${minutes}m`;
        }
    } else {
        uptimeText += `${minutes}m`;
    }
    
    document.getElementById('uptimeStatus').textContent = uptimeText;
}

function updateDiskSpace() {
    checkDiskSpace('C:').then(space => {
        const total = Math.round(space.total / (1024 * 1024 * 1024));  // Gesamtgröße in GB
        const free = Math.round(space.free / (1024 * 1024 * 1024));    // Freier Speicher in GB
        document.getElementById('diskStatus').textContent = `C: ${total-free}/${total} GB`;  // Belegt/Gesamt
    });
}

// Hilfsfunktion für Festplatteninfo
async function checkDiskSpace(drive) {
    return new Promise((resolve, reject) => {
        exec('wmic logicaldisk get size,freespace,caption', (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            
            const lines = stdout.trim().split('\n');
            const drives = lines.slice(1).map(line => {
                const [caption, freeSpace, size] = line.trim().split(/\s+/);
                return {
                    drive: caption,
                    free: parseInt(freeSpace || 0),
                    total: parseInt(size || 0)
                };
            });
            
            const systemDrive = drives.find(d => d.drive === drive);
            resolve(systemDrive || { free: 0, total: 0 });
        });
    });
}

// Aktualisiere die showInfoModal Funktion
function showInfoModal(program) {
    const modal = document.getElementById('infoModal');
    const overlay = document.getElementById('infoModalOverlay');
    const icon = modal.querySelector('.info-modal-icon');
    const title = modal.querySelector('.info-modal-title');
    const content = modal.querySelector('.info-modal-content');
    
    // Programm-spezifische Informationen setzen
    icon.src = program.icon;
    title.textContent = program.name;
    content.innerHTML = `
        <p><strong>Beschreibung:</strong> ${program.description}</p>
        <p><strong>Author:</strong> ${program.author || 'Unbekannt'}</p>
        <p><strong>Funktionen:</strong></p>
        <ul>
            ${program.features.map(feature => `<li>${feature}</li>`).join('')}
        </ul>
        ${program.requirements ? `
        <p><strong>Systemanforderungen:</strong></p>
        <ul>
            ${program.requirements.map(req => `<li>${req}</li>`).join('')}
        </ul>
        ` : ''}
    `;
    
    // Modal und Overlay anzeigen
    modal.style.display = 'block';
    overlay.style.display = 'block';
    
    // ESC-Taste zum Schließen
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            hideInfoModal();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);
}

// Funktion zum Verstecken des Info-Modals
function hideInfoModal() {
    const modal = document.getElementById('infoModal');
    const overlay = document.getElementById('infoModalOverlay');
    modal.style.display = 'none';
    overlay.style.display = 'none';
}

// Info-Buttons zu allen Album-Items hinzufügen
document.querySelectorAll('.albumitem').forEach(item => {
    const infoBtn = document.createElement('button');
    infoBtn.className = 'info-btn';
    infoBtn.innerHTML = '<i class="fas fa-info-circle"></i>';
    infoBtn.title = 'Informationen anzeigen';
    
    infoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const programName = item.getAttribute('data-search');
        const programInfo = getProgramInfo(programName);
        showInfoModal(programInfo);
    });
    
    item.appendChild(infoBtn);
});

// Programm-Informationen abrufen
function getProgramInfo(programName) {
    const programInfos = {
        'AdvancedIPScanner': {
            name: 'Advanced IP Scanner',
            icon: './assets/images/programs/advancedipscanner.png',
            description: 'Ein leistungsstarker Netzwerk-Scanner, der es Ihnen ermöglicht, alle Geräte in Ihrem lokalen Netzwerk schnell zu erkennen und zu analysieren.',
            author: 'Famatech Corp.',
            features: [
                'Schnelles Scannen und Erkennen von Netzwerkgeräten',
                'Einfacher Fernzugriff auf freigegebene Ordner und FTP-Server',
                'Remote-Steuerung von PCs über RDP und Radmin',
                'Erkennung von MAC-Adressen und Geräteherstellern'
            ]
        },
        'CrystalDiskInfo': {
            name: 'CrystalDiskInfo',
            icon: './assets/images/programs/crystaldiskinfo.png',
            description: 'Ein unverzichtbares Tool zur Überwachung der Gesundheit Ihrer Festplatten, das detaillierte S.M.A.R.T.-Daten und Temperaturinformationen bereitstellt.',
            author: 'Crystal Dew World',
            features: [
                'Echtzeit-Überwachung der Festplattengesundheit',
                'Detaillierte S.M.A.R.T.-Datenanalyse',
                'Temperaturüberwachung für SSDs und HDDs',
                'Unterstützung für eine Vielzahl von Festplattentypen'
            ]
        },
        'Heavyload': {
            name: 'Heavyload',
            icon: './assets/images/programs/heavyload.png',
            description: 'Ein umfassendes Stresstest-Tool, das die Belastbarkeit Ihrer Hardware-Komponenten unter extremen Bedingungen prüft.',
            author: 'JAM Software GmbH',
            features: [
                'Intensiver CPU-Belastungstest',
                'RAM-Auslastungssimulation',
                'Festplatten-Schreib- und Lesetests',
                'Grafikprozessor-Stresstests'
            ]
        },
        'MicrosoftActivation': {
            name: 'Microsoft Activation Scripts',
            icon: './assets/images/programs/Microsoft Activation Scripts.png',
            description: 'Ein vielseitiges Skript zur Aktivierung von Microsoft-Produkten, das verschiedene Aktivierungsmethoden unterstützt.',
            author: 'massgravel',
            features: [
                'Aktivierung von Windows-Betriebssystemen',
                'Aktivierung von Microsoft Office-Produkten',
                'Unterstützung für HWID- und KMS38-Aktivierung',
                'Einfache und schnelle Anwendung'
            ]
        },
        'OneDriveUninstaller': {
            name: 'OneDrive Uninstaller',
            icon: './assets/images/programs/onedriveunistaller.png',
            description: 'Ein effizientes Tool zur vollständigen Entfernung von OneDrive von Ihrem System, inklusive aller zugehörigen Dateien und Registry-Einträge.',
            author: 'JaredCabot',
            features: [
                'Vollständige Deinstallation von OneDrive',
                'Bereinigung von Registry-Einträgen',
                'Entfernung aller OneDrive-Ordner',
                'Deaktivierung der OneDrive-Integration'
            ]
        },
        'DriverIdentifier': {
            name: 'DriverIdentifier',
            icon: './assets/images/programs/driveridentifier.png',
            description: 'Ein nützliches Tool zur Identifizierung und Aktualisierung von Treibern, das Ihnen hilft, die Leistung Ihres Systems zu optimieren.',
            author: 'DriverIdentifier Ltd.',
            features: [
                'Automatische Erkennung veralteter Treiber',
                'Bereitstellung von Download-Links für Treiber',
                'Backup-Funktion für bestehende Treiber',
                'Offline-Scan f��r Treiberaktualisierungen'
            ]
        },
        'HiBit Uninstaller': {
            name: 'HiBit Uninstaller',
            icon: './assets/images/programs/hibituninstaller.png',
            description: 'Ein fortschrittliches Deinstallations-Tool, das Programme gründlich entfernt und alle Rückstände beseitigt.',
            author: 'HiBitSoft',
            features: [
                'Gründliche Deinstallation von Programmen',
                'Entfernung von Programmresten und -rückständen',
                'Batch-Deinstallationsoption',
                'Integrierter Startup-Manager'
            ]
        },
        'Hibit Systeminfo': {
            name: 'Hibit Systeminfo',
            icon: './assets/images/programs/hibitsysteminfo.png',
            description: 'Ein detailliertes Analyse-Tool, das umfassende Informationen über Ihre Hardware und Software bereitstellt.',
            author: 'HiBitSoft',
            features: [
                'Umfassende Hardware-Informationen',
                'Detaillierte Software-Analyse',
                'Netzwerk- und Verbindungsdetails',
                'Betriebssystem- und Sicherheitsinformationen'
            ]
        },
        'HWiNFO': {
            name: 'HWiNFO',
            icon: './assets/images/programs/hwinfo.png',
            description: 'Ein professionelles Tool zur Hardware-Analyse und Überwachung, das detaillierte Berichte und Echtzeit-Daten liefert.',
            author: 'REALiX Corp.',
            features: [
                'Detaillierte Erkennung von Hardware-Komponenten',
                'Echtzeit-Überwachung von Systemressourcen',
                'Umfassendes Sensor-Monitoring',
                'Erstellung detaillierter Berichte'
            ]
        },
        'TreeSizeFree': {
            name: 'TreeSize Free',
            icon: './assets/images/programs/treesizefree.png',
            description: 'Ein leistungsstarkes Tool zur Analyse und Verwaltung Ihres Festplattenspeichers, das Ihnen hilft, Speicherplatz effizient zu nutzen.',
            author: 'JAM Software GmbH',
            features: [
                'Visualisierung der Festplattennutzung',
                'Analyse von Ordnergrößen',
                'Export von Scan-Ergebnissen',
                'Integration ins Kontextmenü'
            ]
        },
        'Everything': {
            name: 'Everything',
            icon: './assets/images/programs/everything.png',
            description: 'Ein ultraschnelles Such-Tool für Windows, das Ihnen hilft, Dateien und Ordner in Sekundenschnelle zu finden.',
            author: 'voidtools',
            features: [
                'Echtzeit-Indizierung von Dateien',
                'Unterstützung für reguläre Ausdrücke',
                'Netzwerkweite Dateisuche',
                'Verfügbar als portable Version'
            ]
        },
        'BatteryInfoView': {
            name: 'BatteryInfoView',
            icon: './assets/images/programs/batteryinfoview.png',
            description: 'Ein nützliches Tool zur Überwachung des Batteriezustands von Laptops, das detaillierte Informationen und Analysen bietet.',
            author: 'NirSoft',
            features: [
                'Überwachung des Akku-Zustands',
                'Analyse des Batterieverschleißes',
                'Anzeige der Akkukapazität',
                'Verfolgung der Ladezyklen'
            ]
        },
        'Rufus': {
            name: 'Rufus',
            icon: './assets/images/programs/rufus.png',
            description: 'Ein unverzichtbares Tool zum Erstellen bootfähiger USB-Laufwerke, das eine Vielzahl von ISO-Formaten unterstützt.',
            author: 'Akeo Consulting',
            features: [
                'Konvertierung von ISO zu USB',
                'Erstellung bootfähiger USB-Laufwerke',
                'Unterstützung für UEFI-Systeme',
                'Verschiedene Formatierungsoptionen'
            ]
        },
        'VirusTotal': {
            name: 'VirusTotal',
            icon: './assets/images/programs/virustotal.png',
            description: 'Eine Online-Plattform zur Analyse von verdächtigen Dateien und URLs mit über 70 Antiviren-Engines.',
            author: 'Google LLC',
            features: [
                'Überprüfung mit über 70 Antiviren-Engines',
                'Analyse von URLs und Domains',
                'Detaillierte Bedrohungsberichte',
                'Community-basierte Bewertungen'
            ]
        },
        'Ninite': {
            name: 'Ninite',
            icon: './assets/images/programs/ninite.png',
            description: 'Ein praktisches Tool zur automatisierten Installation und Aktualisierung mehrerer Programme gleichzeitig.',
            author: 'Secure By Design Inc.',
            features: [
                'Installation beliebter Software in einem Schritt',
                'Automatische Aktualisierung von Programmen',
                'Keine unerwünschte Zusatzsoftware',
                'Einfache und intuitive Benutzeroberfläche'
            ]
        },
        'MonkeyType': {
            name: 'MonkeyType',
            icon: './assets/images/programs/monkeytype.png',
            description: 'Ein modernes Tipp-Trainingstool, das Ihnen hilft, Ihre Tippgeschwindigkeit und Genauigkeit zu verbessern.',
            author: 'Miodec',
            features: [
                'Verschiedene Tipp-Modi und Zeitlimits',
                'Umfangreiche Textbibliotheken',
                'Detaillierte Tippstatistiken',
                'Anpassbare Themes und Layouts'
            ]
        },
        'Encycolorpedia': {
            name: 'Encycolorpedia',
            icon: './assets/images/programs/encycolorpedia.png',
            description: 'Ein umfassendes Tool zur Farbcode-Konvertierung und -Analyse, das Ihnen hilft, die perfekte Farbpalette zu finden.',
            author: 'Encycolorpedia',
            features: [
                'Konvertierung von Farbcodes (HEX, RGB, HSL, etc.)',
                'Erstellung von Farbpaletten',
                'Vorschläge für Farbharmonien',
                'Analyse von Farbschemata'
            ]
        },
        'Browser Privacy Check': {
            name: 'Browser Privacy Check',
            icon: './assets/images/programs/browserprivacycheck.png',
            description: 'Ein Tool zur Überprüfung der Sicherheit und Privatsphäre-Einstellungen Ihres Browsers, das Schwachstellen aufdeckt.',
            author: 'EXPERTE',
            features: [
                'Sicherheitsanalyse des Browsers',
                'Überprüfung der Datenschutzeinstellungen',
                'Erkennung von Schwachstellen',
                'Empfehlungen zur Verbesserung der Sicherheit'
            ]
        },
        'DNSDumpster': {
            name: 'DNSDumpster',
            icon: './assets/images/programs/dnsdumpster.png',
            description: 'Ein leistungsstarkes DNS-Reconnaissance-Tool, das Ihnen hilft, DNS-Server und Subdomains zu identifizieren.',
            author: 'HackerTarget',
            features: [
                'Mapping von DNS-Servern',
                'Erkennung von Subdomains',
                'Analyse der DNS-Sicherheit',
                'Visuelle Darstellung der DNS-Struktur'
            ]
        },
        'LastPass Password Generator': {
            name: 'LastPass Password Generator',
            icon: './assets/images/programs/lastpass.png',
            description: 'Ein Tool zur Erstellung sicherer und einzigartiger Passwörter, das Ihre Online-Sicherheit erhöht.',
            author: 'GoTo',
            features: [
                'Anpassbare Länge der Passwörter',
                'Auswahl verschiedener Zeichentypen',
                'Generierung von Passwörtern mit hoher Entropie',
                'Sofortige Analyse der Passwortstärke'
            ]
        },
        'SystemRequirementsLab': {
            name: 'System Requirements Lab',
            icon: './assets/images/programs/systemrequirementslab.png',
            description: 'Ein Tool zur Analyse und Bewertung der PC-Leistung im Vergleich zu Spieleanforderungen.',
            author: 'Husdawg LLC',
            features: [
                'Automatische Erkennung der Hardware',
                'Prüfung der Kompatibilität mit Spielen',
                'Detaillierte Leistungsanalyse',
                'Empfehlungen für Hardware-Upgrades'
            ]
        },
        'AutoUnattend': {
            name: 'AutoUnattend',
            icon: './assets/images/programs/autounattend.png',
            description: 'Ein Generator für automatisierte Windows-Installationen, der die Einrichtung vereinfacht.',
            author: 'Christian Schneider',
            features: [
                'Erstellung benutzerdefinierter Windows-Installationen',
                'Automatische Konfiguration von Einstellungen',
                'Integration von Treibern',
                'Generierung von Installationsskripten'
            ]
        }
    };
    
    // Wenn keine spezifischen Informationen vorhanden sind, hole die Basis-Infos aus dem DOM
    if (!programInfos[programName]) {
        const albumItem = document.querySelector(`[data-search="${programName}"]`);
        if (albumItem) {
            return {
                name: albumItem.querySelector('.albumtitle h1').textContent,
                icon: albumItem.querySelector('.albumartwork img').src,
                description: albumItem.querySelector('.albumtitle h2')?.textContent || 'Keine Beschreibung verfügbar.',
                author: 'Nicht verfügbar',
                features: ['Grundlegende Funktionalität']
            };
        }
    }
    
    return programInfos[programName] || {
        name: programName,
        icon: './assets/images/programs/default.png',
        description: 'Keine detaillierten Informationen verfügbar.',
        author: 'Nicht verfügbar',
        features: ['Grundlegende Funktionalität']
    };
}

// Globale Variablen
let settingsOverlay;
let minimizeToTray = false;

// Warte auf DOM-Laden
document.addEventListener('DOMContentLoaded', () => {
    // Initialisiere Referenzen
    settingsOverlay = document.getElementById('settingsOverlay');
    
    // Fenster-Steuerung
    document.getElementById('closeBtn')?.addEventListener('click', () => {
        ipcRenderer.send('close-window');
    });

    document.getElementById('minimizeBtn')?.addEventListener('click', () => {
        ipcRenderer.send('minimize-window');
    });

    document.getElementById('maximizeBtn')?.addEventListener('click', () => {
        ipcRenderer.send('maximize-window');
    });

    // Settings Panel
    const settingsBtn = document.getElementById('settingsBtn');
    const closeSettings = document.getElementById('closeSettings');

    settingsBtn?.addEventListener('click', () => {
        if (settingsOverlay) {
            settingsOverlay.style.display = 'flex';
        }
    });

    closeSettings?.addEventListener('click', () => {
        if (settingsOverlay) {
            settingsOverlay.style.display = 'none';
        }
    });

    // Lade und setze gespeicherte Einstellungen
    loadSavedSettings();
    
    // Initialisiere Settings-Event-Handler
    initializeSettingsHandlers();
});

// Funktion zum Laden der gespeicherten Einstellungen
function loadSavedSettings() {
    const darkMode = localStorage.getItem('darkMode') === 'true';
    const alwaysOnTop = localStorage.getItem('alwaysOnTop') === 'true';
    minimizeToTray = localStorage.getItem('minimizeToTray') === 'true';
    const autostart = localStorage.getItem('autostart') === 'true';

    // Setze Checkbox-Zustände
    document.getElementById('darkModeToggle').checked = darkMode;
    document.getElementById('alwaysOnTopToggle').checked = alwaysOnTop;
    document.getElementById('minimizeToTrayToggle').checked = minimizeToTray;
    document.getElementById('autostartToggle').checked = autostart;

    // Wende Einstellungen an
    document.body.classList.toggle('dark-mode', darkMode);
    ipcRenderer.send('set-always-on-top', alwaysOnTop);
    ipcRenderer.send('set-autostart', autostart);
}

// Funktion zum Initialisieren der Settings-Handler
function initializeSettingsHandlers() {
    // Switch-Handler
    document.getElementById('darkModeToggle')?.addEventListener('change', (e) => {
        const isDarkMode = e.target.checked;
        document.body.classList.toggle('dark-mode', isDarkMode);
        localStorage.setItem('darkMode', isDarkMode);
        ipcRenderer.send('toggle-dark-mode', isDarkMode);
    });

    document.getElementById('alwaysOnTopToggle')?.addEventListener('change', (e) => {
        const value = e.target.checked;
        localStorage.setItem('alwaysOnTop', value);
        ipcRenderer.send('set-always-on-top', value);
    });

    document.getElementById('minimizeToTrayToggle')?.addEventListener('change', (e) => {
        minimizeToTray = e.target.checked;
        localStorage.setItem('minimizeToTray', minimizeToTray);
    });

    document.getElementById('autostartToggle')?.addEventListener('change', (e) => {
        const value = e.target.checked;
        localStorage.setItem('autostart', value);
        ipcRenderer.send('set-autostart', value);
    });

    // Link-Handler - ohne Schließen des Fensters
    document.querySelectorAll('.settings-item.link').forEach(item => {
        item.addEventListener('click', () => {
            const url = item.dataset.url;
            if (url) {
                ipcRenderer.send('open-external-url', url);
            }
        });
    });

    // Action-Handler - ohne Schließen des Fensters
    const actionHandlers = {
        'clearFavorites': () => {
            localStorage.setItem('favorites', '[]');
            document.querySelectorAll('.favorite-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            sortAlbumItems();
        },
        'openTeamViewer': () => ipcRenderer.send('open-teamviewer'),
        'openDevTools': () => ipcRenderer.send('open-devtools'),
        'exportLogs': () => ipcRenderer.send('export-logs'),
        'openEasterEggs': () => ipcRenderer.send('open-easter-eggs'),
        'openShortcuts': () => ipcRenderer.send('open-shortcuts'),
        'checkUpdates': () => ipcRenderer.send('check-updates'),
        'showLicense': () => ipcRenderer.send('show-license'),
        'showAbout': () => ipcRenderer.send('show-about')
    };

    // Füge Event-Listener für alle Action-Items hinzu - ohne Schließen des Fensters
    Object.keys(actionHandlers).forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => {
            actionHandlers[id]();
        });
    });

    // Schließen mit ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && settingsOverlay?.style.display === 'flex') {
            settingsOverlay.style.display = 'none';
        }
    });

    // Schließen beim Klick außerhalb
    settingsOverlay?.addEventListener('click', (e) => {
        if (e.target === settingsOverlay) {
            settingsOverlay.style.display = 'none';
        }
    });
}

// Dark Mode IPC Handler
ipcRenderer.on('dark-mode-changed', (event, isDarkMode) => {
    document.body.classList.toggle('dark-mode', isDarkMode);
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.checked = isDarkMode;
    }
});

// Füge diese Funktion hinzu
function toggleStatusBar() {
    const statusBar = document.querySelector('.status-bar');
    statusBar.classList.toggle('collapsed');
    
    // Speichere den Status
    localStorage.setItem('statusBarCollapsed', statusBar.classList.contains('collapsed'));
}
