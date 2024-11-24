const { ipcRenderer } = require('electron');

// Dark Mode Status aus localStorage abrufen
const isDarkMode = localStorage.getItem('darkMode') === 'true';
document.body.classList.add(isDarkMode ? 'dark-mode' : 'light-mode');

ipcRenderer.on('download-progress', (event, progress) => {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${Math.round(progress)}%`;
});
