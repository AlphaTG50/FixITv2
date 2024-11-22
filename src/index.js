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
        <option value="favorites">Favoriten</option>
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
    const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
    const albumList = document.querySelector('.albumlist');
    
    let hasVisibleItems = false;

    albums.forEach(album => {
        const title = album.querySelector('.albumtitle h1').textContent.toLowerCase();
        const description = album.querySelector('.albumtitle h2').textContent.toLowerCase();
        const searchData = album.getAttribute('data-search')?.toLowerCase() || '';
        const isPortable = album.querySelector('.albumtitle h3') !== null;
        const isWip = album.querySelector('.wip-label') !== null;
        const isFavorite = favorites.includes(album.getAttribute('data-search'));
        
        const matchesSearch = searchTerm === '' || 
            title.includes(searchTerm) || 
            description.includes(searchTerm) || 
            searchData.includes(searchTerm);
            
        const matchesCategory = selectedCategory === '' || 
            (selectedCategory === 'portable' && isPortable) ||
            (selectedCategory === 'wip' && isWip) ||
            (selectedCategory === 'favorites' && isFavorite);

        const isVisible = matchesSearch && matchesCategory;
        album.style.display = isVisible ? 'flex' : 'none';
        
        if (isVisible) {
            hasVisibleItems = true;
        }
    });

    // Zeige oder verstecke die albumlist basierend auf den Suchergebnissen
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

    startTutorial();
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

// Nach den bestehenden Konstanten
const TUTORIAL_STEPS = [
    {
        element: '.search-container',
        title: 'Suche',
        text: 'Hier kannst du nach Programmen suchen',
        position: 'bottom'
    },
    {
        element: '#categoryFilter',
        title: 'Filter',
        text: 'Filtere nach Kategorien',
        position: 'bottom'
    },
    {
        element: '.albumitem:first-child',
        title: 'Programme',
        text: 'Klicke auf ein Programm um es zu starten',
        position: 'center'
    }
];

// Tutorial-Funktion prüft, ob es bereits gezeigt wurde
function startTutorial() {
    if (localStorage.getItem('tutorialShown')) return;

    let currentStep = 0;
    
    function createTutorialOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'tutorial-overlay';
        document.body.appendChild(overlay);
        return overlay;
    }

    function createTutorialBox() {
        const box = document.createElement('div');
        box.className = 'tutorial-box';
        box.innerHTML = `
            <div class="tutorial-content">
                <h3></h3>
                <p></p>
            </div>
            <div class="tutorial-buttons">
                <button class="tutorial-skip">Überspringen</button>
                <button class="tutorial-next">Weiter</button>
            </div>
        `;
        document.body.appendChild(box);
        return box;
    }

    const overlay = createTutorialOverlay();
    const tutorialBox = createTutorialBox();

    function showStep(step) {
        const targetElement = document.querySelector(step.element);
        if (!targetElement) return;

        const rect = targetElement.getBoundingClientRect();
        
        // Präzisere Hervorhebung für die Suchleiste
        if (step.element === '.search-container') {
            const searchInput = document.querySelector('#searchInput');
            if (searchInput) {
                searchInput.style.outline = '2px solid var(--darkblue)';
                searchInput.style.outlineOffset = '2px';
            }
        } else {
            targetElement.style.outline = '2px solid var(--darkblue)';
            targetElement.style.outlineOffset = '2px';
        }

        tutorialBox.querySelector('h3').textContent = step.title;
        tutorialBox.querySelector('p').textContent = step.text;

        // Position the tutorial box
        switch(step.position) {
            case 'bottom':
                tutorialBox.style.top = `${rect.bottom + 10}px`;
                tutorialBox.style.left = `${rect.left + (rect.width / 2) - (tutorialBox.offsetWidth / 2)}px`;
                break;
            case 'right':
                tutorialBox.style.top = `${rect.top + (rect.height / 2) - (tutorialBox.offsetHeight / 2)}px`;
                tutorialBox.style.left = `${rect.right + 10}px`;
                break;
            case 'left':
                tutorialBox.style.top = `${rect.top + (rect.height / 2) - (tutorialBox.offsetHeight / 2)}px`;
                tutorialBox.style.left = `${rect.left - tutorialBox.offsetWidth - 10}px`;
                break;
            case 'center':
                tutorialBox.style.top = `${rect.top + (rect.height / 2) - (tutorialBox.offsetHeight / 2)}px`;
                tutorialBox.style.left = `${rect.left + (rect.width / 2) - (tutorialBox.offsetWidth / 2)}px`;
                break;
            case 'bottom-left':
                tutorialBox.style.top = `${rect.bottom + 10}px`;
                tutorialBox.style.left = `${rect.left}px`;
                break;
        }
    }

    function nextStep() {
        // Entferne das Highlight vom aktuellen Element
        const currentElement = document.querySelector(TUTORIAL_STEPS[currentStep].element);
        if (currentElement) {
            if (TUTORIAL_STEPS[currentStep].element === '.search-container') {
                const searchInput = document.querySelector('#searchInput');
                if (searchInput) {
                    searchInput.style.outline = '';
                    searchInput.style.outlineOffset = '';
                }
            } else {
                currentElement.style.outline = '';
                currentElement.style.outlineOffset = '';
            }
        }

        if (currentStep < TUTORIAL_STEPS.length - 1) {
            currentStep++;
            showStep(TUTORIAL_STEPS[currentStep]);
        } else {
            endTutorial();
        }
    }

    function endTutorial() {
        // Entferne alle Highlights
        TUTORIAL_STEPS.forEach(step => {
            if (step.element === '.search-container') {
                const searchInput = document.querySelector('#searchInput');
                if (searchInput) {
                    searchInput.style.outline = '';
                    searchInput.style.outlineOffset = '';
                }
            } else {
                const element = document.querySelector(step.element);
                if (element) {
                    element.style.outline = '';
                    element.style.outlineOffset = '';
                }
            }
        });

        overlay.remove();
        tutorialBox.remove();
        localStorage.setItem('tutorialShown', 'true');
    }

    tutorialBox.querySelector('.tutorial-next').addEventListener('click', nextStep);
    tutorialBox.querySelector('.tutorial-skip').addEventListener('click', endTutorial);

    showStep(TUTORIAL_STEPS[0]);
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
        if (item.querySelector('.wip-label')) return;
        
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
