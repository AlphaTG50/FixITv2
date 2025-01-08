document.addEventListener('DOMContentLoaded', () => {
    // Dark Mode Check
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
    }

    // Event Listeners
    document.getElementById('timeFilter').addEventListener('change', updateHistoryList);
    document.getElementById('clearHistory').addEventListener('click', showConfirmDialog);

    // Initial Update
    updateHistoryList();
});

function updateHistoryList() {
    const historyData = JSON.parse(localStorage.getItem('programHistory') || '[]');
    const timeFilter = document.getElementById('timeFilter').value;
    const container = document.getElementById('historyList');
    container.innerHTML = '';

    const filteredHistory = filterHistoryByTime(historyData, timeFilter);
    const groupedHistory = groupHistoryByProgram(filteredHistory);

    groupedHistory.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        
        const lastUsed = new Date(item.lastUsed);
        const formattedDate = formatDate(lastUsed);
        
        div.innerHTML = `
            <img src="${item.icon}" alt="${item.name}" class="history-icon">
            <div class="history-details">
                <div class="history-title">${item.name}</div>
                <div class="history-info">
                    <span class="history-count">
                        <i class="fas fa-play"></i> ${item.count}x ausgeführt
                    </span>
                    <span class="history-date">
                        <i class="fas fa-clock"></i> Zuletzt: ${formattedDate}
                    </span>
                </div>
            </div>
        `;
        
        container.appendChild(div);
    });
}

function filterHistoryByTime(history, timeFilter) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return history.filter(item => {
        const date = new Date(item.timestamp);
        switch(timeFilter) {
            case 'today':
                return date >= today;
            case 'week':
                const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
                return date >= weekAgo;
            case 'month':
                const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
                return date >= monthAgo;
            default:
                return true;
        }
    });
}

function groupHistoryByProgram(history) {
    const grouped = history.reduce((acc, item) => {
        const existing = acc.find(x => x.name === item.name);
        if (existing) {
            existing.count++;
            if (new Date(item.timestamp) > new Date(existing.lastUsed)) {
                existing.lastUsed = item.timestamp;
            }
        } else {
            acc.push({
                name: item.name,
                icon: item.icon,
                count: 1,
                lastUsed: item.timestamp
            });
        }
        return acc;
    }, []);

    return grouped.sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));
}

function formatDate(date) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date >= today) {
        return `Heute, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (date >= yesterday) {
        return `Gestern, ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
        return date.toLocaleDateString('de-DE', { 
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

function showConfirmDialog() {
    document.querySelector('.dialog-overlay').style.display = 'flex';
}

function hideConfirmDialog() {
    document.querySelector('.dialog-overlay').style.display = 'none';
}

function clearHistory() {
    localStorage.setItem('programHistory', '[]');
    updateHistoryList();
    hideConfirmDialog();
} 