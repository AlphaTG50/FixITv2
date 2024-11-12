const { ipcRenderer } = require('electron');
const { execFile, exec } = require('child_process');
let containerWidth;

// Konstanten für Menüs und andere häufig verwendete Strings
const MENU_IDS = {
    DARK_MODE: 'darkModeToggle',
    ALWAYS_ON_TOP: 'alwaysOnTopToggle',
};

// Funktion zum Ausführen einer exe-Datei
function executeExe(exeName) {
    ipcRenderer.invoke('execute-exe', exeName).catch(err => {
        console.error('Error executing exe:', err); // Fehlerprotokollierung
    });
}

// Event-Listener für Album-Elemente
document.querySelectorAll('.albumitem').forEach(item => {
    item.addEventListener('click', function () {
        const exeName = this.getAttribute('data-search');
        executeExe(exeName);
    });

    // Hover-Effekte für nicht gefundene Alben
    item.addEventListener('mouseenter', function () {
        if (!this.classList.contains('found')) {
            this.classList.add('not-found-hover');
        }
    });

    item.addEventListener('mouseleave', function () {
        this.classList.remove('not-found-hover');
    });
});

// Funktion zum Filtern von Alben basierend auf dem Suchbegriff
function filterAlbums() {
    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    const albums = document.querySelectorAll('.albumitem');

    albums.forEach(album => {
        const title = album.querySelector('.albumtitle h1').textContent.toLowerCase();
        const description = album.querySelector('.albumtitle h2').textContent.toLowerCase();
        const searchData = album.getAttribute('data-search')?.toLowerCase() || '';
        
        if (searchTerm === '' || 
            title.includes(searchTerm) || 
            description.includes(searchTerm) || 
            searchData.includes(searchTerm)) {
            album.style.display = 'flex'; // Geändert von 'block' zu 'flex'
        } else {
            album.style.display = 'none';
        }
    });
}

// Event-Listener für die Eingabe in das Suchfeld
document.getElementById('searchInput').addEventListener('input', filterAlbums);

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
