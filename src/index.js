const { ipcRenderer } = require('electron');
const { execFile, exec } = require('child_process');
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

// Füge diese Funktion nach der executeExe Funktion hinzu
async function executePowerShellScript(scriptName) {
    try {
        showLoadingScreen();
        
        const scriptPath = app.isPackaged 
            ? path.join(process.resourcesPath, 'src', 'portable-scripts', scriptName)
            : path.join(__dirname, 'src', 'portable-scripts', scriptName);

        const command = `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}"`;
        
        await new Promise((resolve, reject) => {
            exec(command, { windowsHide: true }, (error, stdout, stderr) => {
                if (error) {
                    console.error(`PowerShell Fehler: ${error}`);
                    reject(error);
                    return;
                }
                resolve(stdout);
            });
        });

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
                    console.log('OneDrive Prozess Status:', isRunning);
                    
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
    item.addEventListener('click', async function() {
        if (!this.classList.contains('found') && !this.querySelector('.Entwicklung-Badge')) {
            const programName = this.getAttribute('data-search');
            
            if (programName === 'OneDriveUninstaller') {
                await executeBatchScript('OneDriveUninstaller.bat');
            } else {
                await executeExe(programName);
            }
        }
    });
});

// Neue Funktion zur Initialisierung der Kategoriefilter
function initializeCategoryFilter() {
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    
    const searchInput = document.getElementById('searchInput');
    const categorySelect = document.createElement('select');
    categorySelect.id = 'categoryFilter';
    categorySelect.innerHTML = `
        <option value="">Alle Programme</option>
        <option value="favorites">Meine Favoriten</option>
        <option value="portable">Portable Apps</option>
        <option value="tool">System Tools</option>
        <option value="wip">In Entwicklung</option>
    `;

    // Entferne das ursprüngliche Suchelement
    searchInput.parentNode.removeChild(searchInput);
    
    // Füge die neue Struktur hinzu
    document.body.insertBefore(searchContainer, document.querySelector('.albumlist'));
    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(categorySelect);

    // Event Listener
    searchInput.addEventListener('input', filterAlbums);
    categorySelect.addEventListener('change', filterAlbums);

    return categorySelect;
}

// Aktualisierte Filteralben-Funktion
function filterAlbums() {
    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    const selectedCategory = document.getElementById('categoryFilter').value;
    const albums = document.querySelectorAll('.albumitem');
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    const albumList = document.querySelector('.albumlist');
    
    let hasVisibleItems = false;

    albums.forEach(album => {
        const title = album.querySelector('.albumtitle h1').textContent.toLowerCase();
        const description = album.querySelector('.albumtitle h2')?.textContent.toLowerCase() || '';
        const searchData = album.getAttribute('data-search')?.toLowerCase() || '';
        const isPortable = album.querySelector('.Portable-Badge') !== null;
        const isWip = album.querySelector('.Entwicklung-Badge') !== null;
        const isFavorite = favorites.includes(album.getAttribute('data-search'));
        const isTool = album.querySelector('.Tool-Badge') !== null;
        
        const matchesSearch = searchTerm === '' || 
            title.includes(searchTerm) || 
            description.includes(searchTerm) || 
            searchData.includes(searchTerm);
            
        const matchesCategory = selectedCategory === '' || 
            (selectedCategory === 'portable' && isPortable) ||
            (selectedCategory === 'wip' && isWip) ||
            (selectedCategory === 'tool' && isTool) ||
            (selectedCategory === 'favorites' && isFavorite);

        const isVisible = matchesSearch && matchesCategory;
        album.style.display = isVisible ? 'flex' : 'none';
        
        if (isVisible) {
            hasVisibleItems = true;
        }
    });

    albumList.style.display = hasVisibleItems ? 'flex' : 'none';
}

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

    const categoryFilter = initializeCategoryFilter();

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
});

// Fehlerbehandlung bei nicht gefundenen Alben
function handleAlbumNotFound(album) {
    // console.warn entfernt
}

  document.addEventListener('DOMContentLoaded', () => {
    const albumList = document.querySelector('.albumlist');
    const items = Array.from(albumList.children); // Konvertiere NodeList in Array

    // Sortiere die Items alphabetisch basierend auf dem Titel (h1-Element)
    items.sort((a, b) => {
      const titleA = a.querySelector('.albumtitle h1').innerText.toLowerCase();
      const titleB = b.querySelector('.albumtitle h1').innerText.toLowerCase();
      return titleA.localeCompare(titleB);
    });

    // Leere die aktuelle Liste und füge die sortierten Items hinzu
    albumList.innerHTML = '';
    items.forEach(item => albumList.appendChild(item));
  });

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

// Fügen Sie diese Funktionen hinzu
function showErrorModal(message) {
    const errorModal = document.getElementById('errorModal');
    const errorOverlay = document.getElementById('errorOverlay');
    const errorMessage = document.getElementById('errorMessage');
    
    // Prüfen Sie Dark Mode
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
    const items = Array.from(albumList.children);
    
    // Speichere die ursprünglichen Positionen und Scroll-Position
    const originalPositions = new Map();
    items.forEach(item => {
        originalPositions.set(item, item.getBoundingClientRect().top);
    });
    const scrollPosition = window.scrollY;
    
    // Sortiere die Items
    items.sort((a, b) => {
        const aIsFav = favorites.includes(a.getAttribute('data-search'));
        const bIsFav = favorites.includes(b.getAttribute('data-search'));
        
        if (aIsFav && !bIsFav) return -1;
        if (!aIsFav && bIsFav) return 1;
        
        const titleA = a.querySelector('.albumtitle h1').textContent.toLowerCase();
        const titleB = b.querySelector('.albumtitle h1').textContent.toLowerCase();
        return titleA.localeCompare(titleB);
    });

    // Entferne alle Items temporär
    const fragment = document.createDocumentFragment();
    items.forEach(item => {
        // Setze die ursprüngliche Position als Startpunkt
        const originalTop = originalPositions.get(item);
        item.style.position = 'relative';
        item.style.top = '0';
        item.style.transition = 'none';
        fragment.appendChild(item);
    });

    // Füge die sortierten Items wieder ein
    albumList.appendChild(fragment);

    // Trigger reflow
    albumList.offsetHeight;

    // Aktiviere Transitions und bewege Items an ihre finalen Positionen
    items.forEach(item => {
        item.style.transition = 'all 0.3s ease';
        item.style.top = '0';
    });

    // Stelle die Scroll-Position wieder her
    window.scrollTo(0, scrollPosition);
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
