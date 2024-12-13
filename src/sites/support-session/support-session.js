const { ipcRenderer } = require('electron');

// Dark Mode Check
if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
}

// Datei-Upload Handling
const fileInput = document.getElementById('attachments');
const fileList = document.getElementById('fileList');
const uploadArea = document.querySelector('.upload-area');
const selectedFiles = new Map();

// Klick auf Upload-Bereich
uploadArea.addEventListener('click', () => {
    fileInput.click();
});

// Formatiere Dateigröße
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Prüfe Dateityp
function isValidFileType(file) {
    const validTypes = ['image/', 'video/'];
    return validTypes.some(type => file.type.startsWith(type));
}

function showErrorMessage(message) {
    // Entferne vorhandene Fehlermeldungen
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-circle"></i>
        ${message}
    `;

    // Füge die Fehlermeldung nach dem File-Input-Container ein
    const fileUpload = document.querySelector('.file-upload');
    fileUpload.appendChild(errorDiv);

    // Entferne die Fehlermeldung nach 3 Sekunden
    setTimeout(() => {
        errorDiv.remove();
    }, 3000);
}

function addFileToList(file) {
    if (!isValidFileType(file)) {
        showErrorMessage('Nur Bilder und Videos sind erlaubt');
        return;
    }

    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    
    const fileIcon = document.createElement('i');
    fileIcon.className = `file-icon fas ${file.type.startsWith('image/') ? 'fa-image' : 'fa-video'}`;
    
    const fileName = document.createElement('span');
    fileName.className = 'file-name';
    fileName.textContent = file.name;
    
    const fileSize = document.createElement('span');
    fileSize.className = 'file-size';
    fileSize.textContent = formatFileSize(file.size);
    
    const removeButton = document.createElement('span');
    removeButton.className = 'remove-file';
    removeButton.innerHTML = '<i class="fas fa-times"></i>';
    removeButton.onclick = () => {
        selectedFiles.delete(file.name);
        fileItem.remove();
    };
    
    fileItem.appendChild(fileIcon);
    fileItem.appendChild(fileName);
    fileItem.appendChild(fileSize);
    fileItem.appendChild(removeButton);
    fileList.appendChild(fileItem);

    selectedFiles.set(file.name, file);
}

// Drag & Drop Handler
const dropZone = document.querySelector('.file-input-container');

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files);
    let hasInvalidFiles = false;
    
    files.forEach(file => {
        if (!isValidFileType(file)) {
            hasInvalidFiles = true;
        } else if (!selectedFiles.has(file.name)) {
            addFileToList(file);
        }
    });

    if (hasInvalidFiles) {
        showErrorMessage('Einige Dateien wurden nicht hinzugefügt (nur Bilder und Videos sind erlaubt)');
    }
});

fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    let hasInvalidFiles = false;
    
    files.forEach(file => {
        if (!isValidFileType(file)) {
            hasInvalidFiles = true;
        } else if (!selectedFiles.has(file.name)) {
            addFileToList(file);
        }
    });

    if (hasInvalidFiles) {
        showErrorMessage('Einige Dateien wurden nicht hinzugefügt (nur Bilder und Videos sind erlaubt)');
    }
    fileInput.value = '';
});

// Telefonnummer-Validierung
function isValidPhoneNumber(phone) {
    // Entferne alle Leerzeichen, Klammern, Bindestriche und Punkte
    const cleanPhone = phone.replace(/[\s\(\)\-\.]/g, '');
    
    // Prüfe ob die Nummer dem deutschen Format entspricht
    // Erlaubt: +49..., 0049..., oder 0... mit insgesamt 10-15 Ziffern
    const germanPhoneRegex = /^(?:(?:\+|00)49|0)[\d]{9,14}$/;
    
    return germanPhoneRegex.test(cleanPhone);
}

document.getElementById('supportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Prüfe Telefonnummer wenn angegeben
    const phoneInput = document.getElementById('phone');
    if (phoneInput.value && !isValidPhoneNumber(phoneInput.value)) {
        showErrorMessage('Bitte geben Sie eine gültige Telefonnummer ein');
        phoneInput.focus();
        return;
    }
    
    // Konvertiere die Dateien in ein Array von Pfaden
    const fileArray = [];
    for (const file of selectedFiles.values()) {
        if (file instanceof File) {
            // Erstelle einen temporären Pfad für die Datei
            const tempPath = await saveFileToTemp(file);
            if (tempPath) {
                fileArray.push({
                    tempPath: tempPath,
                    originalName: file.name,
                    type: file.type
                });
            }
        }
    }
    
    const supportData = {
        title: document.getElementById('title').value,
        priority: document.getElementById('priority').value,
        description: document.getElementById('description').value,
        occurrence: document.getElementById('occurrence').value,
        attempts: document.getElementById('attempts').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        includeScreenshots: document.getElementById('includeScreenshots').checked,
        attachments: fileArray,
        timestamp: new Date().toISOString()
    };

    try {
        const result = await ipcRenderer.invoke('create-support-session', supportData);
        if (result.success) {
            // Lösche temporäre Dateien
            for (const file of fileArray) {
                try {
                    await ipcRenderer.invoke('delete-temp-file', file.tempPath);
                } catch (error) {
                    console.error('Fehler beim Löschen der temporären Datei:', error);
                }
            }
            window.close();
        }
    } catch (error) {
        console.error('Fehler beim Erstellen der Support-Session:', error);
    }
});

// Funktion zum temporären Speichern der Datei
async function saveFileToTemp(file) {
    try {
        const buffer = await file.arrayBuffer();
        const result = await ipcRenderer.invoke('save-temp-file', {
            name: file.name,
            buffer: buffer
        });
        return result.path;
    } catch (error) {
        console.error('Fehler beim temporären Speichern der Datei:', error);
        return null;
    }
}

// Verhindere Drag & Drop in Input-Feldern
const inputs = document.querySelectorAll('input, textarea');
inputs.forEach(input => {
    input.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    
    input.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
});

// Verhindere Drag & Drop auf dem gesamten Dokument außer der Upload-Zone
document.addEventListener('dragover', (e) => {
    if (!e.target.closest('.file-input-container')) {
        e.preventDefault();
        e.stopPropagation();
    }
});

document.addEventListener('drop', (e) => {
    if (!e.target.closest('.file-input-container')) {
        e.preventDefault();
        e.stopPropagation();
    }
}); 

// Füge eine Funktion hinzu, um den Prioritätstext mit Icon zu formatieren
function getPriorityDisplay(priority) {
    const icons = {
        low: '🔵',
        medium: '🟡',
        high: '🟠',
        critical: '🔴'
    };
    const texts = {
        low: 'Niedrig',
        medium: 'Mittel',
        high: 'Hoch',
        critical: 'Kritisch'
    };
    return `${icons[priority]} ${texts[priority]}`;
} 

// Formatiere Telefonnummer während der Eingabe
document.getElementById('phone').addEventListener('input', (e) => {
    let phone = e.target.value.replace(/[^\d\+]/g, ''); // Entferne alles außer Zahlen und +
    
    if (phone.startsWith('+')) {
        // Format: +49 123 45678901
        if (phone.length > 13) {
            phone = phone.slice(0, 13);
        }
        if (phone.length > 3) {
            phone = `${phone.slice(0, 3)} ${phone.slice(3)}`;
        }
        if (phone.length > 7) {
            phone = `${phone.slice(0, 7)} ${phone.slice(7)}`;
        }
    } else if (phone.startsWith('00')) {
        // Format: 0049 123 45678901
        if (phone.length > 14) {
            phone = phone.slice(0, 14);
        }
        if (phone.length > 4) {
            phone = `${phone.slice(0, 4)} ${phone.slice(4)}`;
        }
        if (phone.length > 8) {
            phone = `${phone.slice(0, 8)} ${phone.slice(8)}`;
        }
    } else {
        // Format: 0123 45678901
        if (phone.length > 11) {
            phone = phone.slice(0, 11);
        }
        if (phone.length > 4) {
            phone = `${phone.slice(0, 4)} ${phone.slice(4)}`;
        }
    }
    
    e.target.value = phone;
}); 