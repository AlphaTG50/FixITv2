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
