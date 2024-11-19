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

// Easter Egg Event Listener
logo.addEventListener('click', () => {
    clickCount++;
    
    if (clickCount === 3) {
        document.body.style.transition = 'transform 1s ease-in-out';
        document.body.style.transform = 'rotate(180deg)';
        
        // Easter Egg als gefunden markieren
        const foundEasterEggs = JSON.parse(localStorage.getItem('foundEasterEggs') || '[]');
        if (!foundEasterEggs.includes('logo_rotation')) {
            foundEasterEggs.push('logo_rotation');
            localStorage.setItem('foundEasterEggs', JSON.stringify(foundEasterEggs));
            
            // Benachrichtigung mit angepasstem Titel
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
    
    setTimeout(() => {
        if (clickCount < 3) clickCount = 0;
    }, 2000);
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

// Event-Listener für Album-Elemente
document.querySelectorAll('.albumitem').forEach(item => {
    // Click-Event für Programmstart
    item.addEventListener('click', async function() {
        if (!this.classList.contains('found') && !this.querySelector('.wip-label')) {
            const exeName = this.getAttribute('data-search');
            await executeExe(exeName);
        }
    });

    // Einfache mouseenter/mouseleave Events für jeden Album-Item
    item.addEventListener('mouseenter', function(event) {
        if (!this.classList.contains('found') && !this.querySelector('.wip-label')) {
            // Entferne zuerst alle anderen Hover-Effekte
            document.querySelectorAll('.albumitem').forEach(otherItem => {
                if (otherItem !== this) {
                    otherItem.classList.remove('not-found-hover');
                }
            });
            this.classList.add('not-found-hover');
        }
    });

    item.addEventListener('mouseleave', function(event) {
        // Prüfe, ob die Maus wirklich das Element verlassen hat
        const relatedTarget = event.relatedTarget;
        if (!this.contains(relatedTarget)) {
            this.classList.remove('not-found-hover');
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
        <option value="">Alle</option>
        <option value="portable">Portable</option>
        <option value="wip">In Progress</option>
    `;

    // Entferne das ursprüngliche Suchelement
    searchInput.parentNode.removeChild(searchInput);
    
    // Füge die neue Struktur hinzu
    document.body.insertBefore(searchContainer, document.querySelector('.albumlist'));
    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(categorySelect);

    // Füge die Event Listener hinzu
    searchInput.addEventListener('input', filterAlbums);
    categorySelect.addEventListener('change', filterAlbums);

    return categorySelect;
}

// Aktualisierte Filteralben-Funktion
function filterAlbums() {
    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    const selectedCategory = document.getElementById('categoryFilter').value;
    const albums = document.querySelectorAll('.albumitem');

    albums.forEach(album => {
        const title = album.querySelector('.albumtitle h1').textContent.toLowerCase();
        const description = album.querySelector('.albumtitle h2').textContent.toLowerCase();
        const searchData = album.getAttribute('data-search')?.toLowerCase() || '';
        const isPortable = album.querySelector('.albumtitle h3') !== null;
        const isWip = album.querySelector('.wip-label') !== null;
        
        const matchesSearch = searchTerm === '' || 
            title.includes(searchTerm) || 
            description.includes(searchTerm) || 
            searchData.includes(searchTerm);
            
        const matchesCategory = selectedCategory === '' || 
            (selectedCategory === 'portable' && isPortable) ||
            (selectedCategory === 'wip' && isWip);

        album.style.display = (matchesSearch && matchesCategory) ? 'flex' : 'none';
    });
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

// Initialisierung der Anwendung nach dem Laden der DOM-Inhalte
document.addEventListener('DOMContentLoaded', () => {
    containerWidth = document.documentElement.clientWidth;
    adjustGridColumns();

    // Dark Mode Status abrufen und initialisieren
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode !== null) {
        const isDarkModeActive = savedDarkMode === 'true';
        document.body.classList.toggle('dark-mode', isDarkModeActive);
        ipcRenderer.send('toggle-dark-mode', isDarkModeActive);
    }

    // Immer im Vordergrund Status abrufen
    const savedAlwaysOnTop = localStorage.getItem('alwaysOnTop');
    if (savedAlwaysOnTop === 'true') {
        ipcRenderer.send('alwaysOnTopToggle', true);
    }

    // Dark Mode Toggle Listener
    ipcRenderer.on('toggle-dark-mode', (event, isDarkMode) => {
        document.body.classList.toggle('dark-mode', isDarkMode);
    });

    // Fehlerbehandlung für IPC
    ipcRenderer.on('error', (event, errorMessage) => {
        console.error('IPC Error:', errorMessage); // Fehlerprotokollierung
        alert('Ein Fehler ist aufgetreten: ' + errorMessage); // Benutzerbenachrichtigung
    });

    // Work in Progress Items deaktivieren
    document.querySelectorAll('.albumitem').forEach(item => {
        const description = item.querySelector('.albumtitle h2');
        if (description && description.textContent.includes('🚧')) {
            item.style.opacity = '0.5';
            item.style.filter = 'grayscale(100%)';
            item.style.pointerEvents = 'none';
            item.style.cursor = 'not-allowed';
            
            // Entferne alle Event Listener
            item.replaceWith(item.cloneNode(true));
        }
    });

    const categoryFilter = initializeCategoryFilter();

    // Startup Loading Screen
    const startupLoadingScreen = document.getElementById('startup-loading-screen');
    
    // Verzögern Sie das Ausblenden des Loading Screens
    setTimeout(() => {
        startupLoadingScreen.classList.add('fade-out');
        setTimeout(() => {
            startupLoadingScreen.style.display = 'none';
        }, 500); // Warten Sie, bis die Fade-Animation abgeschlossen ist
    }, 2000); // Zeigen Sie den Loading Screen für 2 Sekunden an
});

// Fehlerbehandlung bei nicht gefundenen Alben
function handleAlbumNotFound(album) {
    console.warn('Album nicht gefunden:', album);
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
    
    // Programm starten
    await window.electron.execute(programName);
    
    // Warten Sie einen kurzen Moment, um sicherzustellen, dass das Programm gestartet ist
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
    
    // Prüfe auf "matrix" und lösche dann den Suchtext
    if (searchCode.includes('matrix')) {
        searchInput.value = '';
        createMatrixEffect();
        
        // Easter Egg als gefunden markieren
        const foundEasterEggs = JSON.parse(localStorage.getItem('foundEasterEggs') || '[]');
        if (!foundEasterEggs.includes('matrix_code')) {
            foundEasterEggs.push('matrix_code');
            localStorage.setItem('foundEasterEggs', JSON.stringify(foundEasterEggs));
            
            // Benachrichtigung
            new Notification('Easter Egg', {
                body: 'Matrix Code freigeschaltet',
                icon: './assets/images/logo/png/64x64.png',
                silent: true
            });
        }
        
        searchCode = '';
    }
    
    // Reset nach 2 Sekunden
    setTimeout(() => searchCode = '', 2000);
});

function createMatrixEffect() {
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
    const fontSize = 10;
    const columns = canvas.width / fontSize;
    const drops = Array(Math.floor(columns)).fill(1);

    function draw() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0F0';
        ctx.font = fontSize + 'px monospace';

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
    setTimeout(() => {
        clearInterval(matrixInterval);
        canvas.remove();
    }, 5000);
}
