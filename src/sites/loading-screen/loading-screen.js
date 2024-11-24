// Dark Mode Status aus localStorage abrufen
const isDarkMode = localStorage.getItem('darkMode') === 'true';
document.body.classList.add(isDarkMode ? 'dark-mode' : 'light-mode');
