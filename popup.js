document.addEventListener('DOMContentLoaded', async () => {
  // Tabs logic
  const tabs = document.querySelectorAll('.tab-btn');
  const contents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');
    });
  });

  // Settings elements
  const canvasTokenInput = document.getElementById('canvas-token');
  const tgTokenInput = document.getElementById('tg-token');
  const tgChatIdInput = document.getElementById('tg-chat-id');
  const saveBtn = document.getElementById('save-settings-btn');
  const testMessageBtn = document.getElementById('test-message-btn');
  const settingsMessage = document.getElementById('settings-message');

  // Load existing settings
  chrome.storage.local.get(['canvasToken', 'tgToken', 'tgChatId'], (data) => {
    if (data.canvasToken) canvasTokenInput.value = data.canvasToken;
    if (data.tgToken) tgTokenInput.value = data.tgToken;
    if (data.tgChatId) tgChatIdInput.value = data.tgChatId;
  });

  // Save settings
  saveBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({
      canvasToken: canvasTokenInput.value,
      tgToken: tgTokenInput.value,
      tgChatId: tgChatIdInput.value
    });
    settingsMessage.textContent = 'Settings saved successfully!';
    setTimeout(() => { settingsMessage.textContent = ''; }, 3000);
  });

  // Send Test Message
  testMessageBtn.addEventListener('click', () => {
    settingsMessage.textContent = 'Sending test message...';
    chrome.runtime.sendMessage({ action: 'sendTestMessage' }, (response) => {
      if (response && response.success) {
        settingsMessage.textContent = 'Test message sent!';
      } else {
        settingsMessage.textContent = 'Failed to send message: ' + (response.error || 'Unknown error');
      }
      setTimeout(() => { settingsMessage.textContent = ''; }, 3000);
    });
  });

  // Dashboard logic
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const lastPollTimeEl = document.getElementById('last-poll-time');
  const assignmentsList = document.getElementById('assignments-list');
  const pollNowBtn = document.getElementById('poll-now-btn');

  function updateDashboard(data) {
    if (data.lastPollStatus === 'success') {
      statusIndicator.classList.add('success');
      statusIndicator.classList.remove('error');
      statusText.textContent = 'Polling active';
    } else if (data.lastPollStatus === 'error') {
      statusIndicator.classList.add('error');
      statusIndicator.classList.remove('success');
      statusText.textContent = 'Last poll failed';
    } else {
      statusText.textContent = 'No poll completed yet';
    }

    if (data.lastPollTime) {
      lastPollTimeEl.textContent = 'Last polled: ' + new Date(data.lastPollTime).toLocaleTimeString();
    } else {
      lastPollTimeEl.textContent = '';
    }

    // Render assignments
    let assignments = data.dashboardAssignments || [];
    
    // Sort by due date, filter only upcoming
    assignments = assignments.filter(a => a.due_at && new Date(a.due_at) > new Date())
                             .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
                             .slice(0, 5);

    if (assignments.length === 0) {
      assignmentsList.innerHTML = '<div class="no-assignments">No upcoming assignments!</div>';
      return;
    }

    assignmentsList.innerHTML = '';
    assignments.forEach(asg => {
      const row = document.createElement('div');
      row.className = 'assignment-row';

      const details = document.createElement('div');
      details.className = 'assignment-details';
      
      const title = document.createElement('div');
      title.className = 'assignment-title';
      title.textContent = asg.name;

      const meta = document.createElement('div');
      meta.className = 'assignment-meta';
      const dueDate = new Date(asg.due_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      meta.textContent = `${asg.courseName} | ${dueDate} | ${asg.points_possible || 0} pts`;

      details.appendChild(title);
      details.appendChild(meta);

      const reminderBadge = document.createElement('div');
      reminderBadge.className = 'reminder-badge';
      reminderBadge.textContent = `Remind ${asg.reminderLeadDays}d`;

      row.appendChild(details);
      row.appendChild(reminderBadge);

      assignmentsList.appendChild(row);
    });
  }

  // Initial load
  chrome.storage.local.get(['lastPollStatus', 'lastPollTime', 'dashboardAssignments'], (data) => {
    updateDashboard(data);
  });

  // Listen for storage changes to update UI dynamically
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      chrome.storage.local.get(['lastPollStatus', 'lastPollTime', 'dashboardAssignments'], (data) => {
        updateDashboard(data);
      });
    }
  });

  // Manual Poll
  pollNowBtn.addEventListener('click', () => {
    statusText.textContent = 'Polling...';
    pollNowBtn.disabled = true;
    chrome.runtime.sendMessage({ action: 'pollNow' }, (response) => {
      pollNowBtn.disabled = false;
      if (response && response.success) {
        statusText.textContent = 'Poll requested';
      }
    });
  });
});
