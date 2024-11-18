const { ipcRenderer } = require('electron');
const { execFile, exec } = require('child_process');
let containerWidth;

// Konstanten für Menüs und andere häufig verwendete Strings
const MENU_IDS = {
    DARK_MODE: 'darkModeToggle',
    ALWAYS_ON_TOP: 'alwaysOnTopToggle',
};

// Funktion zum Ausführen einer exe-Datei
async function executeExe(exeName) {
    try {
        console.log('Starte Programm:', exeName);
        showLoadingScreen();
        
        await ipcRenderer.invoke('execute-exe', exeName);
        
        // Warten auf die Bestätigung, dass das Programm gestartet wurde
        await new Promise((resolve) => {
            const checkProcess = setInterval(async () => {
                try {
                    const isRunning = await ipcRenderer.invoke('check-process', exeName);
                    if (isRunning) {
                        clearInterval(checkProcess);
                        resolve();
                    }
                } catch (error) {
                    clearInterval(checkProcess);
                    resolve();
                }
            }, 100);

            setTimeout(() => {
                clearInterval(checkProcess);
                resolve();
            }, 30000);
        });

        hideLoadingScreen();
    } catch (err) {
        console.error('Fehler:', err);
        hideLoadingScreen();
        // Vereinfachte Fehlermeldung mit Programmnamen
        showErrorModal(`${exeName} wurde nicht gefunden.`);
    }
}

// Event-Listener für Album-Elemente
document.querySelectorAll('.albumitem').forEach(item => {
    // Click-Event für Programmstart
    item.addEventListener('click', async function(event) {
        // Prüfen, ob das geklickte Element innerhalb der albuminfo oder albumartwork ist
        const isClickInside = event.target.closest('.albuminfo') || 
                            event.target.closest('.albumartwork') ||
                            event.target === this;
        
        // Wenn der Klick außerhalb war, ignorieren
        if (!isClickInside) return;
        
        // Prüfen, ob das Element ein Link ist
        if (event.target.tagName === 'A' || event.target.closest('a')) return;
        
        // Prüfen, ob das Item aktiviert ist
        if (!this.classList.contains('found') && !this.querySelector('.wip-label')) {
            const exeName = this.getAttribute('data-search');
            await executeExe(exeName);
        }
    });

    // Hover-Events bleiben unverändert
    item.addEventListener('mouseenter', function(event) {
        if (!this.classList.contains('found') && !this.querySelector('.wip-label')) {
            document.querySelectorAll('.albumitem').forEach(otherItem => {
                if (otherItem !== this) {
                    otherItem.classList.remove('not-found-hover');
                }
            });
            this.classList.add('not-found-hover');
        }
    });

    item.addEventListener('mouseleave', function(event) {
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
