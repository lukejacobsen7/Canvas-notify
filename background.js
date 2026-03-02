// background.js

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('pollCanvas', { periodInMinutes: 30 });
  pollCanvas();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pollCanvas') {
    pollCanvas();
  }
});

function getReminderLeadDays(assignment) {
  const pts = assignment.points_possible || 0;
  let step = 0;
  if (pts <= 10) step = 0;
  else if (pts <= 50) step = 1;
  else if (pts <= 150) step = 2;
  else if (pts <= 300) step = 3;
  else step = 4;

  const subTypes = assignment.submission_types || [];
  if (subTypes.includes('online_quiz')) step -= 1;
  if (subTypes.includes('online_upload')) step += 1;
  
  step = Math.max(0, Math.min(4, step));

  const stepDays = [0.5, 1, 3, 7, 14];
  let days = stepDays[step];

  const desc = assignment.description || '';
  if (/\d+[\s-]*(page|pg)s?/i.test(desc)) {
    days += 3;
  }
  return days;
}

function escapeMd(text) {
  if (!text) return '';
  return text.replace(/([_*`\[])/g, '\\$1');
}

function stripHtml(html) {
  return html.replace(/<[^>]*>?/gm, '').trim();
}

async function sendTelegram(text, tgToken, tgChatId) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: tgChatId,
        text: text,
        parse_mode: 'Markdown'
      })
    });
    if (!res.ok) {
      console.error('Telegram send failed:', await res.text());
    }
  } catch (err) {
    console.error("Telegram send error", err);
  }
}

async function updateStatus(status) {
  await chrome.storage.local.set({
    lastPollStatus: status,
    lastPollTime: Date.now()
  });
}

async function pollCanvas() {
  try {
    const data = await chrome.storage.local.get(['canvasToken', 'tgToken', 'tgChatId', 'appState']);
    const { canvasToken, tgToken, tgChatId } = data;
    const appState = data.appState || { assignments: {}, announcements: {} };
    
    if (!canvasToken || !tgToken || !tgChatId) {
      console.log('Canvas Notify: Missing credentials, aborting poll.');
      return;
    }

    const headers = { 'Authorization': `Bearer ${canvasToken}` };

    const coursesRes = await fetch('https://canvas.ut.edu/api/v1/courses?enrollment_state=active', { headers });
    if (coursesRes.status === 401) {
      await sendTelegram('Canvas Notify: Your Canvas token has expired. Please update it in the extension settings.', tgToken, tgChatId);
      await updateStatus('error');
      return;
    }
    if (!coursesRes.ok) throw new Error(`Courses fetch failed: ${coursesRes.status}`);

    const courses = await coursesRes.json();
    let updatedAssignmentsState = { ...appState.assignments };
    let updatedAnnouncementsState = { ...appState.announcements };
    let dashboardAssignments = [];

    for (const course of courses) {
      if (!course.id) continue;
      const courseName = course.name || `Course ${course.id}`;

      // 1. Fetch assignments
      try {
        const asgRes = await fetch(`https://canvas.ut.edu/api/v1/courses/${course.id}/assignments?bucket=upcoming&per_page=50&include[]=submission`, { headers });
        if (asgRes.ok) {
          const assignments = await asgRes.json();
          for (const asg of assignments) {
            const leadDays = getReminderLeadDays(asg);
            
            dashboardAssignments.push({
              id: asg.id,
              name: asg.name,
              courseName: courseName,
              due_at: asg.due_at,
              points_possible: asg.points_possible,
              reminderLeadDays: leadDays
            });

            const asgState = updatedAssignmentsState[asg.id] || { seen: false, score: null, reminderSent: false };

            // Check if new
            if (!asgState.seen) {
              const dueDiff = asg.due_at ? (new Date(asg.due_at) - new Date()) / (1000 * 60 * 60 * 24) : null;
              const dueStr = dueDiff !== null ? `due in ${Math.max(0, Math.round(dueDiff * 10) / 10)} days` : 'with no due date';
              await sendTelegram(`New assignment posted in ${escapeMd(courseName)}: ${escapeMd(asg.name)} — ${dueStr}`, tgToken, tgChatId);
              asgState.seen = true;
            }

            // Check grade
            const currentScore = (asg.submission && asg.submission.score !== undefined) ? asg.submission.score : null;
            if (asgState.score === null && currentScore !== null) {
              await sendTelegram(`Grade posted: ${escapeMd(courseName)} ${escapeMd(asg.name)} — You scored ${currentScore}/${asg.points_possible || 0}`, tgToken, tgChatId);
              asgState.score = currentScore;
            } else if (currentScore !== null) {
              asgState.score = currentScore; // Just in case it updates
            }

            // Check reminder
            if (asg.due_at && !asgState.reminderSent) {
              const dueDiff = (new Date(asg.due_at) - new Date()) / (1000 * 60 * 60 * 24);
              if (dueDiff > 0 && dueDiff <= leadDays) {
                const formattedDate = new Date(asg.due_at).toLocaleString();
                await sendTelegram(`📚 Reminder: ${escapeMd(asg.name)} (${asg.points_possible || 0} pts) is due in ${Math.round(dueDiff * 10) / 10} days — ${formattedDate}`, tgToken, tgChatId);
                asgState.reminderSent = true;
              }
            }

            updatedAssignmentsState[asg.id] = asgState;
          }
        }
      } catch (err) {
        console.error(`Failed to fetch assignments for course ${course.id}`, err);
      }

      // 2. Fetch announcements
      try {
        const annRes = await fetch(`https://canvas.ut.edu/api/v1/courses/${course.id}/discussion_topics?only_announcements=true&per_page=10`, { headers });
        if (annRes.ok) {
          const announcements = await annRes.json();
          for (const ann of announcements) {
            if (!updatedAnnouncementsState[ann.id]) {
              let bodyText = stripHtml(ann.message || '');
              if (bodyText.length > 200) {
                bodyText = bodyText.substring(0, 197) + '...';
              }
              await sendTelegram(`Announcement from ${escapeMd(courseName)}: ${escapeMd(ann.title)} — ${escapeMd(bodyText)}`, tgToken, tgChatId);
              updatedAnnouncementsState[ann.id] = true;
            }
          }
        }
      } catch (err) {
        console.error(`Failed to fetch announcements for course ${course.id}`, err);
      }
    }

    await chrome.storage.local.set({
      appState: { assignments: updatedAssignmentsState, announcements: updatedAnnouncementsState },
      dashboardAssignments,
      lastPollStatus: 'success',
      lastPollTime: Date.now()
    });

  } catch (err) {
    console.error('Canvas poll error:', err);
    await updateStatus('error');
  }
}

// Optional listener to run a test message or manual poll from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendTestMessage') {
    chrome.storage.local.get(['tgToken', 'tgChatId']).then(({ tgToken, tgChatId }) => {
      if (tgToken && tgChatId) {
        sendTelegram('Canvas Notify is connected and working!', tgToken, tgChatId).then(() => {
          sendResponse({ success: true });
        });
      } else {
        sendResponse({ success: false, error: 'Missing Telegram credentials' });
      }
    });
    return true; // Indicates async response
  }
  if (request.action === 'pollNow') {
    pollCanvas().then(() => sendResponse({ success: true }));
    return true;
  }
});
