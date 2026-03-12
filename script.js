// -----------------------------------------
// STATE MANAGEMENT & REAL FIREBASE SYNC
// -----------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyD_TI84V2nl9nJbuOh30hhQ-YM9xi4JzZI",
  authDomain: "ssc-ai-dashboard.firebaseapp.com",
  projectId: "ssc-ai-dashboard",
  storageBucket: "ssc-ai-dashboard.firebasestorage.app",
  messagingSenderId: "498558954969",
  appId: "1:498558954969:web:67922c3b2c80fc755ffdc8",
  measurementId: "G-0FRMLC3QTW"
};

let db;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    console.log("Firebase connected");
} catch(e) {
    console.warn("Firebase config error. Check console.");
}

// -----------------------------------------
// UI SOUND SYSTEM
// -----------------------------------------
const clickSound = new Audio("sounds/click.mp3");

function playClickSound() {
    try {
        clickSound.currentTime = 0;
        clickSound.play().catch(e => {
            // Ignore autoplay blocking errors
        });
    } catch(e) {}
}

// Global click listener for all buttons to ensure sounds
document.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.classList.contains('heatmap-day') || e.target.classList.contains('cal-day')) {
        playClickSound();
    }
});

// -----------------------------------------
// FIREBASE SYNC LOGIC
// -----------------------------------------
async function syncGlobalData() {
    if(!db) return;
    
    const userEmail = localStorage.getItem('ssc_user_email') || 'Aspirant';
    const username = userEmail.split('@')[0];
    
    const userData = {
        username: username,
        xp: state.xp,
        hours: Math.round(state.studyHours),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection('leaderboard').doc(username).set(userData, { merge: true });
        
        const snapshot = await db.collection('leaderboard')
            .orderBy('xp', 'desc')
            .limit(10)
            .get();
            
        const leaderboardData = [];
        snapshot.forEach(doc => leaderboardData.push(doc.data()));
        renderLeaderboardUI(leaderboardData);
    } catch(e) {
        console.error("Firebase Sync Error:", e);
    }
}

function renderLeaderboardUI(data) {
    const tbody = document.getElementById('leaderboard-body');
    if(!tbody) return;
    
    tbody.innerHTML = '';
    const myName = localStorage.getItem('ssc_user_email')?.split('@')[0];
    
    data.forEach((user, index) => {
        const tr = document.createElement('tr');
        if(user.username === myName) tr.className = 'highlight-user rgb-glow';
        tr.innerHTML = `
            <td>#${index + 1}</td>
            <td>${user.username}</td>
            <td>${user.xp} XP</td>
            <td>${user.hours}h</td>
        `;
        tbody.appendChild(tr);
    });
}

// -----------------------------------------
// DATA STRUCTURES
// -----------------------------------------
const SSC_SYLLABUS = {
    quant: ['Percentage', 'Ratio & Proportion', 'Profit & Loss', 'Time & Work', 'Time Speed Distance', 'Number System', 'Algebra', 'Geometry', 'Data Interpretation', 'Trigonometry', 'Mensuration'],
    reasoning: ['Coding Decoding', 'Blood Relation', 'Syllogism', 'Puzzles', 'Seating Arrangement', 'Series', 'Venn Diagram', 'Mirror Images'],
    english: ['Vocabulary', 'Synonyms', 'Antonyms', 'Reading Comprehension', 'Error Detection', 'Grammar', 'Cloze Test', 'Active/Passive'],
    gk: ['Polity', 'History', 'Geography', 'Economy', 'Current Affairs', 'Static GK', 'Science']
};

const state = {
    xp: 0,
    level: 1,
    studyHours: 0,
    studyDays: 0,
    currentStreak: 0,
    lastStudyDate: null,
    lastMissionDate: null,
    goals: [],
    missions: [],
    calendarData: {},
    heatmapData: {},
    subjectData: { quant: 0, reasoning: 0, english: 0, gk: 0, mock: 0 },
    syllabusProgress: { quant: [], reasoning: [], english: [], gk: [] },
    badges: {
        starter: { id: 'starter', name: 'Starter', desc: '3 study days', unlocked: false },
        warrior: { id: 'warrior', name: 'Warrior', desc: '7 day streak', unlocked: false },
        legend: { id: 'legend', name: 'Legend', desc: '30 day streak', unlocked: false },
        master: { id: 'master', name: 'ITI Master', desc: '200 study hours', unlocked: false }
    }
};

function loadState() {
    try {
        const saved = localStorage.getItem('ssc_ai_pro_final_v2');
        if (saved) {
            const parsed = JSON.parse(saved);
            // Robust merging to prevent undefined subjects in syllabus
            for (let key in parsed) {
                if (key === 'syllabusProgress' || key === 'subjectData') {
                    state[key] = { ...state[key], ...parsed[key] };
                } else {
                    state[key] = parsed[key];
                }
            }
        }
    } catch (e) { console.error("Error loading state:", e); }
    
    updateStreak();
    loadMissions();
    renderAll();
    setupReminders();
    updateOverview();
    updateWeakTopicAnalyzer();
    syncGlobalData();
}

function saveState() {
    localStorage.setItem('ssc_ai_pro_final_v2', JSON.stringify(state));
    renderAll();
}

// -----------------------------------------
// CORE LOGIC & XP UPDATES
// -----------------------------------------
function addStudyMinutes(minutes, subject) {
    state.xp += Math.floor(minutes / 5);
    state.studyHours += (minutes / 60);
    
    const newLevel = Math.floor(state.xp / 100) + 1;
    if (newLevel > state.level) {
        state.level = newLevel;
        notify(`🎉 LEVEL UP! You reached Level ${state.level}!`, "success");
    }

    const todayStr = new Date().toISOString().split('T')[0];
    state.heatmapData[todayStr] = (state.heatmapData[todayStr] || 0) + minutes;

    if(subject && state.subjectData[subject] !== undefined) {
        state.subjectData[subject] += minutes;
    }

    updateStreak();
    saveState();
    updateCharts();
    updateOverview();
    updateWeakTopicAnalyzer();
    syncGlobalData();
}

function updateStreak() {
    const today = new Date().toISOString().split('T')[0];
    if (state.lastStudyDate === today) return;
    if (state.lastStudyDate) {
        const diff = Math.floor((new Date(today) - new Date(state.lastStudyDate)) / 86400000);
        if (diff === 1) state.currentStreak++;
        else if (diff > 1) state.currentStreak = 1;
    } else { state.currentStreak = 1; }
    if (state.lastStudyDate !== today) { state.studyDays++; state.lastStudyDate = today; }
}

function updateRank() {
    const totalTopics = Object.values(SSC_SYLLABUS).flat().length;
    const completedTopics = Object.values(state.syllabusProgress).flat().length;
    const syllabusWeight = totalTopics > 0 ? (completedTopics / totalTopics) * 5000 : 0;
    const xpWeight = (state.xp / 1000) * 2000;
    
    let rank = 50000 - (syllabusWeight + xpWeight);
    rank = Math.max(1, Math.round(rank));
    
    const rankElem = document.getElementById('predicted-rank');
    if (rankElem) {
        rankElem.innerText = `# ${rank.toLocaleString()}`;
    }
}

document.getElementById('update-rank-btn')?.addEventListener('click', () => {
    const btn = document.getElementById('update-rank-btn');
    btn.innerText = "Analyzing...";
    setTimeout(() => {
        updateRank();
        btn.innerText = "Recalculate Rank";
        notify("Rank Estimated!", "success");
    }, 1000);
});

// -----------------------------------------
// MISSIONS
// -----------------------------------------
const defaultMissions = [
    { id: 1, text: 'Solve 20 Quant questions', xp: 20, done: false },
    { id: 2, text: 'Complete 2 Pomodoros', xp: 15, done: false },
    { id: 3, text: 'Revise History', xp: 10, done: false }
];

function loadMissions() {
    const today = new Date().toISOString().split('T')[0];
    if (state.lastMissionDate !== today) {
        state.missions = JSON.parse(JSON.stringify(defaultMissions));
        state.lastMissionDate = today;
        saveState();
    }
}

function renderMissions() {
    const list = document.getElementById('missions-list');
    if(!list) return;
    list.innerHTML = '';
    state.missions.forEach(m => {
        const li = document.createElement('li');
        li.className = `mission-item ${m.done ? 'completed' : ''}`;
        li.innerHTML = `
            <input type="checkbox" ${m.done ? 'checked' : ''} onchange="toggleMission(${m.id})">
            <span>${m.text} (+${m.xp} XP)</span>
        `;
        list.appendChild(li);
    });
}

function addMissionAlert(id, message) {
    const alertId = `mission-alert-${id}`;
    if (document.getElementById(alertId)) return;
    const area = document.getElementById('notification-area');
    if(!area) return;
    const div = document.createElement('div');
    div.className = 'notif-item rgb-glow';
    div.id = alertId;
    div.innerText = message;
    area.prepend(div);
}

window.toggleMission = (id) => {
    playClickSound();
    const m = state.missions.find(x => x.id === id);
    if(m) {
        m.done = !m.done;
        if(m.done) {
            state.xp += m.xp;
            addMissionAlert(id, `🚀 Mission Accomplished: ${m.text} (+${m.xp} XP)`);
        } else {
            state.xp = Math.max(0, state.xp - m.xp);
            const alertElem = document.getElementById(`mission-alert-${id}`);
            if(alertElem) alertElem.remove();
        }
        state.level = Math.floor(state.xp / 100) + 1;
        saveState();
        syncGlobalData();
    }
}

// -----------------------------------------
// NOTIFICATIONS
// -----------------------------------------
function notify(msg, type="info") {
    const area = document.getElementById('notification-area');
    if(!area) return;
    const div = document.createElement('div');
    div.className = `notif-item ${type === 'success' ? 'rgb-glow' : ''}`;
    div.innerText = msg;
    area.prepend(div);
    if ('Notification' in window && Notification.permission === "granted") {
        new Notification("SSC CGL Coach", { body: msg, icon: "images/icon-192.png" });
    }
}

document.getElementById('enable-notif-btn')?.addEventListener('click', () => {
    if ('Notification' in window) {
        Notification.requestPermission().then(perm => {
            if (perm === "granted") notify("Notifications Enabled! 👮‍♂️", "success");
        });
    } else {
        alert("Your browser does not support notifications.");
    }
});

function setupReminders() {
    if(state.studyDays > 0 && state.studyDays % 14 === 0) {
        notify("Reminder: It's been 2 weeks. Please attempt a Full Mock Test today!", "warning");
    }
}

// -----------------------------------------
// AI CHAT (BACKEND INTEGRATION)
// -----------------------------------------
const BACKEND_URL = "http://localhost:3000";

async function handleChat() {
    playClickSound();
    const input = document.getElementById('chat-input');
    if(!input) return;
    const text = input.value.trim();
    if(!text) return;
    
    appendMessage(text, true);
    input.value = '';
    const typing = appendMessage('AI is thinking...', false, true);

    try {
        const weakSub = getWeakestSubject();
        const res = await fetch(`${BACKEND_URL}/ai-chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, weakSubject: weakSub })
        });
        if(!res.ok) throw new Error("Backend API Error");
        const data = await res.json();
        typing.remove();
        
        // Add a small badge indicating the source (Local or Cloud)
        const sourceBadge = `<span style="font-size: 10px; opacity: 0.5; float: right;">[${data.source}]</span>`;
        appendMessage(data.response + sourceBadge, false);
    } catch(e) {
        console.error("AI connection error:", e);
        typing.remove();
        appendMessage("❌ **Connection Error:** Ensure backend server is running (`node backend/server.js`)", false);
    }
}

function appendMessage(text, isUser, isTyping=false) {
    const cont = document.getElementById('chat-messages');
    if(!cont) return;
    const div = document.createElement('div');
    div.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
    div.innerHTML = isTyping ? `<em>${text}</em>` : marked.parse(text);
    cont.appendChild(div);
    cont.scrollTop = cont.scrollHeight;
    return div;
}

document.getElementById('chat-send-btn')?.addEventListener('click', handleChat);
document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleChat();
});

// -----------------------------------------
// AI QUANT SOLVER & MOCK TEST GENERATOR
// -----------------------------------------
document.getElementById('solve-quant-btn')?.addEventListener('click', async () => {
    playClickSound();
    const input = document.getElementById('quant-input');
    const solutionDiv = document.getElementById('quant-solution');
    const text = input.value.trim();
    if(!text) return;

    solutionDiv.style.display = 'block';
    solutionDiv.innerHTML = "<em>AI is solving the problem... Please wait.</em>";

    try {
        const res = await fetch(`${BACKEND_URL}/solve-quant`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ problem: text })
        });
        if(!res.ok) throw new Error("Backend API Error");
        const data = await res.json();
        
        const sourceBadge = `<div style="font-size: 10px; opacity: 0.5; margin-top: 10px; text-align: right;">[Source: ${data.source}]</div>`;
        solutionDiv.innerHTML = marked.parse(data.response) + sourceBadge;
    } catch(e) {
        console.error("Quant solver error:", e);
        solutionDiv.innerHTML = "❌ **Error:** Could not connect to AI backend. Ensure node server is running.";
    }
});

document.getElementById('generate-mock-btn')?.addEventListener('click', async () => {
    playClickSound();
    const testArea = document.getElementById('mock-test-area');
    const btn = document.getElementById('generate-mock-btn');
    
    btn.innerText = "Generating Test...";
    btn.disabled = true;
    testArea.style.display = 'block';
    testArea.innerHTML = "<em>AI is generating a customized mock test... This might take a few seconds.</em>";

    try {
        const res = await fetch(`${BACKEND_URL}/generate-mock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        if(!res.ok) throw new Error("Backend API Error");
        const data = await res.json();
        
        if (data.test && Array.isArray(data.test)) {
            let testHTML = `<h4>Generated Mock Test <span style="font-size: 10px; opacity: 0.5;">[${data.source}]</span></h4><form id="mock-test-form">`;
            data.test.forEach((q, index) => {
                testHTML += `
                    <div class="mb" style="background: rgba(0,0,0,0.1); padding: 15px; border-radius: 8px;">
                        <p><strong>Q${index + 1} (${q.subject}):</strong> ${q.question}</p>
                        ${q.options.map((opt, i) => `
                            <label style="display:block; margin-top: 5px;">
                                <input type="radio" name="q${index}" value="${opt}"> ${opt}
                            </label>
                        `).join('')}
                    </div>
                `;
            });
            testHTML += `<button type="button" id="submit-mock-btn" class="btn success-btn mt">Submit Answers</button></form>`;
            testArea.innerHTML = testHTML;
            
            // Add submit logic
            document.getElementById('submit-mock-btn').addEventListener('click', () => {
                playClickSound();
                let score = 0;
                let resultsHTML = "<h4>Test Results</h4><ul>";
                data.test.forEach((q, index) => {
                    const selected = document.querySelector(`input[name="q${index}"]:checked`)?.value;
                    if (selected === q.correctAnswer) {
                        score++;
                        resultsHTML += `<li style="color: var(--success-neon)">Q${index + 1}: Correct!</li>`;
                    } else {
                        resultsHTML += `<li style="color: var(--danger-neon)">Q${index + 1}: Incorrect. Correct answer was ${q.correctAnswer}.<br><span style="font-size:12px; color:var(--text-muted)">Exp: ${q.explanation}</span></li>`;
                    }
                });
                resultsHTML += `</ul><p class="mt"><strong>Final Score: ${score} / ${data.test.length}</strong></p>`;
                
                // Award XP
                const earnedXP = score * 5;
                state.xp += earnedXP;
                state.level = Math.floor(state.xp / 100) + 1;
                saveState();
                syncGlobalData();
                notify(`Test Completed! Earned ${earnedXP} XP.`, "success");
                
                testArea.innerHTML = resultsHTML;
            });
            
        } else {
            throw new Error("Invalid format received from AI");
        }
    } catch(e) {
        console.error("Mock test error:", e);
        testArea.innerHTML = "❌ **Error:** Could not generate test. Ensure node server is running.";
    } finally {
        btn.innerText = "Generate Mock Test";
        btn.disabled = false;
    }
});

// -----------------------------------------
// ANALYZERS & OVERVIEW
// -----------------------------------------
function getWeakestSubject() {
    const subjects = ['quant', 'reasoning', 'english', 'gk'];
    return subjects.sort((a,b) => (state.subjectData[a] || 0) - (state.subjectData[b] || 0))[0];
}

async function updateWeakTopicAnalyzer() {
    const subElem = document.getElementById('wt-subject');
    const topElem = document.getElementById('wt-topic');
    const recElem = document.getElementById('wt-rec');
    
    if(subElem) subElem.innerHTML = "<em>Analyzing...</em>";
    if(topElem) topElem.innerHTML = "<em>Analyzing...</em>";
    if(recElem) recElem.innerHTML = "<em>Analyzing...</em>";
    
    try {
        const mockScores = {
            quant: parseInt(document.getElementById('mock-quant')?.value) || state.subjectData.quant,
            reasoning: parseInt(document.getElementById('mock-reasoning')?.value) || state.subjectData.reasoning,
            english: parseInt(document.getElementById('mock-english')?.value) || state.subjectData.english,
            gk: parseInt(document.getElementById('mock-gk')?.value) || state.subjectData.gk
        };
        
        const res = await fetch(`${BACKEND_URL}/weak-topic`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studyData: state.subjectData, mockScores: mockScores })
        });
        
        if(!res.ok) throw new Error("API Error");
        const data = await res.json();
        
        // Simple parsing of AI response assuming format:
        // Weak Subject: ...
        // Recommended Topic: ...
        // Action: ...
        const lines = data.response.split('\n').filter(l => l.trim() !== '');
        
        let weakSubject = "Data Insufficient";
        let recommendedTopic = "Practice More";
        let action = data.response; // Fallback
        
        lines.forEach(line => {
            if(line.toLowerCase().includes('weak subject:')) weakSubject = line.split(':')[1].trim();
            else if(line.toLowerCase().includes('recommended topic:')) recommendedTopic = line.split(':')[1].trim();
            else if(line.toLowerCase().includes('action:')) action = line.split(':')[1].trim();
        });
        
        if(subElem) subElem.innerText = weakSubject;
        if(topElem) topElem.innerText = recommendedTopic;
        if(recElem) recElem.innerHTML = `${action} <span style="font-size: 10px; opacity: 0.5;">[${data.source}]</span>`;

    } catch(e) {
        console.error("Weak topic analyzer error:", e);
        // Fallback to simple local logic if backend fails
        const weak = getWeakestSubject();
        const weakMap = { quant: 'Quantitative Aptitude', reasoning: 'Reasoning', english: 'English Language', gk: 'General Awareness' };
        const topicMap = { quant: 'Algebra', reasoning: 'Puzzles', english: 'Comprehension', gk: 'Current Affairs' };
        if(subElem) subElem.innerText = weakMap[weak];
        if(topElem) topElem.innerText = topicMap[weak];
        if(recElem) recElem.innerText = `Focus on ${topicMap[weak]} to boost your scores. (Local Fallback)`;
    }
}

function updateOverview() {
    const target = 8;
    const today = new Date().toISOString().split('T')[0];
    const mins = state.heatmapData[today] || 0;
    const rem = Math.max(0, (target * 60) - mins);
    const elem = document.getElementById('remaining-hours-display');
    if(elem) elem.innerText = Math.floor(rem/60) + "h " + (rem%60) + "m";
    
    const weakSub = getWeakestSubject();
    const weakMap = { quant: 'Quant', reasoning: 'Reasoning', english: 'English', gk: 'GK' };
    const focusElem = document.getElementById('focus-subject-display');
    if(focusElem) focusElem.innerText = weakMap[weakSub];
    
    const now = new Date();
    const hour = now.getHours();
    let nextSess = "Rest";
    if (hour < 6) nextSess = "Wake up & Exercise";
    else if (hour < 8) nextSess = "Quant Practice";
    else if (hour < 10) nextSess = "Reasoning";
    else if (hour < 12) nextSess = "English";
    else if (hour < 14) nextSess = "GK & Current Affairs";
    else if (hour < 16) nextSess = "Mock Test / Revision";
    else if (hour < 20) nextSess = "Deep Study Session";
    else if (hour < 22) nextSess = "Daily Review";
    const nextElem = document.getElementById('next-session-display');
    if(nextElem) nextElem.innerText = nextSess;
}

// -----------------------------------------
// POMODORO TIMER
// -----------------------------------------
let timerInterval, timeLeft = 25*60, isRunning = false, currentModeTime = 25;
const timerDisplay = document.getElementById('timer-display');

function updateTimerDisplay() {
    const m = Math.floor(timeLeft/60).toString().padStart(2,'0');
    const s = (timeLeft%60).toString().padStart(2,'0');
    if(timerDisplay) timerDisplay.innerText = m + ":" + s;
}

document.getElementById('start-btn')?.addEventListener('click', () => {
    if(isRunning) return;
    isRunning = true;
    timerInterval = setInterval(() => {
        timeLeft--; updateTimerDisplay();
        if(timeLeft <= 0) {
            clearInterval(timerInterval); isRunning = false;
            const sub = document.getElementById('study-subject-select').value;
            addStudyMinutes(currentModeTime, sub);
            notify("Session Finished! Take a break.", "success");
            timeLeft = currentModeTime*60; updateTimerDisplay();
        }
    }, 1000);
});

document.getElementById('pause-btn')?.addEventListener('click', () => { clearInterval(timerInterval); isRunning = false; });
document.getElementById('reset-btn')?.addEventListener('click', () => { clearInterval(timerInterval); isRunning = false; timeLeft = currentModeTime*60; updateTimerDisplay(); });

document.querySelectorAll('.btn-mode').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentModeTime = parseInt(e.target.dataset.time);
        timeLeft = currentModeTime*60; isRunning = false; clearInterval(timerInterval); updateTimerDisplay();
    });
});

// -----------------------------------------
// SYLLABUS & HEATMAP
// -----------------------------------------
function renderSyllabus() {
    let total = 0, done = 0;
    ['quant', 'reasoning', 'english', 'gk'].forEach(sub => {
        const ul = document.getElementById(`list-${sub}`);
        if(!ul) return;
        ul.innerHTML = '';
        
        // Safety check for undefined progress
        if (!state.syllabusProgress[sub]) state.syllabusProgress[sub] = [];
        
        SSC_SYLLABUS[sub].forEach(t => {
            const isDone = state.syllabusProgress[sub].includes(t);
            total++; if(isDone) done++;
            const li = document.createElement('li');
            li.className = `topic-item ${isDone ? 'completed' : ''}`;
            li.innerHTML = `<input type="checkbox" ${isDone ? 'checked' : ''} onchange="toggleSyllabus('${sub}', '${t}')"> <span>${t}</span>`;
            ul.appendChild(li);
        });
        const subProg = document.getElementById(`${sub}-prog`);
        if(subProg) {
            const perc = Math.round((state.syllabusProgress[sub].length / SSC_SYLLABUS[sub].length) * 100) || 0;
            subProg.innerText = `(${perc}%)`;
        }
    });
    const overall = total > 0 ? Math.round((done/total)*100) : 0;
    const progText = document.getElementById('syllabus-progress-text');
    if(progText) progText.innerText = overall + "% Complete";
    const progBar = document.getElementById('syllabus-progress-bar');
    if(progBar) progBar.style.width = overall + "%";
}

window.toggleSyllabus = (sub, t) => {
    if (!state.syllabusProgress[sub]) state.syllabusProgress[sub] = [];
    const list = state.syllabusProgress[sub];
    if(list.includes(t)) state.syllabusProgress[sub] = list.filter(x => x !== t);
    else state.syllabusProgress[sub].push(t);
    saveState();
};

function renderHeatmap() {
    const cont = document.getElementById('heatmap-container');
    if(!cont) return;
    cont.innerHTML = '';
    const today = new Date();
    for (let i = 364; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const day = document.createElement('div');
        day.className = 'heatmap-day';
        const mins = state.heatmapData[dateStr] || 0;
        if(mins > 0) day.dataset.level = mins < 30 ? "1" : mins < 60 ? "2" : mins < 120 ? "3" : "4";
        day.title = `${dateStr}: ${mins}m (Click to edit)`;
        
        day.addEventListener('click', () => {
            const newMins = prompt(`Edit study minutes for ${dateStr}:`, mins);
            if (newMins !== null && !isNaN(newMins)) {
                state.heatmapData[dateStr] = parseInt(newMins);
                saveState();
                updateCharts();
            }
        });
        
        cont.appendChild(day);
    }
}

// -----------------------------------------
// CALENDAR & GOALS
// -----------------------------------------
let currentDate = new Date();

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    if(!grid) return;
    grid.innerHTML = '';
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    const monthYear = document.getElementById('month-year-display');
    if(monthYear) monthYear.innerText = `${monthNames[month]} ${year}`;
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayNames.forEach(d => {
        const div = document.createElement('div');
        div.className = 'cal-day-header';
        div.innerText = d;
        grid.appendChild(div);
    });

    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div');
        div.className = 'cal-day empty';
        grid.appendChild(div);
    }

    const todayStr = new Date().toISOString().split('T')[0];

    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const div = document.createElement('div');
        div.className = `cal-day ${dateStr === todayStr ? 'today' : ''}`;
        
        let contentHTML = `<span>${i}</span>`;
        if (state.calendarData[dateStr]) {
            contentHTML += `<div class="cal-topic">${state.calendarData[dateStr]}</div>`;
        }
        div.innerHTML = contentHTML;

        div.addEventListener('click', () => {
            const task = prompt(`Add study task for ${dateStr}:`, state.calendarData[dateStr] || "");
            if(task !== null) {
                if(task.trim() === "") delete state.calendarData[dateStr];
                else state.calendarData[dateStr] = task;
                saveState();
            }
        });
        grid.appendChild(div);
    }
}

document.getElementById('prev-month')?.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); });
document.getElementById('next-month')?.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); });


const addGoalBtn = document.getElementById('add-goal-btn');
if(addGoalBtn) {
    addGoalBtn.addEventListener('click', () => {
        const input = document.getElementById('goal-text');
        const text = input.value.trim();
        if(text) {
            state.goals.push({ id: Date.now(), text, completed: false });
            input.value = '';
            saveState();
        }
    });
}

function renderGoals() {
    const list = document.getElementById('goal-list');
    if(!list) return;
    list.innerHTML = '';
    state.goals.forEach(g => {
        const li = document.createElement('li');
        li.className = `goal-item ${g.completed ? 'completed' : ''}`;
        li.innerHTML = `
            <div>
                <input type="checkbox" ${g.completed ? 'checked' : ''} onchange="toggleGoal(${g.id})">
                <span>${g.text}</span>
            </div>
            <button class="del-btn" onclick="deleteGoal(${g.id})">&times;</button>
        `;
        list.appendChild(li);
    });
}

window.toggleGoal = (id) => {
    const goal = state.goals.find(g => g.id === id);
    if(goal) goal.completed = !goal.completed;
    saveState();
}
window.deleteGoal = (id) => {
    state.goals = state.goals.filter(g => g.id !== id);
    saveState();
}

// -----------------------------------------
// CHARTS (Chart.js)
// -----------------------------------------
let subjectChart, weeklyHoursChart, monthlyChart;

function getChartTextColor() { return document.body.classList.contains('light-theme') ? '#475569' : '#e2e8f0'; }
function getChartGridColor() { return document.body.classList.contains('light-theme') ? '#cbd5e1' : 'rgba(255,255,255,0.1)'; }

function initCharts() {
    const sCtx = document.getElementById('subjectChart');
    if(sCtx) {
        const data = [state.subjectData.quant || 0, state.subjectData.reasoning || 0, state.subjectData.english || 0, state.subjectData.gk || 0, state.subjectData.mock || 0];
        subjectChart = new Chart(sCtx, { 
            type: 'doughnut', 
            data: { 
                labels: ['Quant', 'Reasoning', 'Eng', 'GK', 'Mock'], 
                datasets: [{ data: data.some(v => v > 0) ? data : [1,1,1,1,1], backgroundColor: ['#00f3ff', '#ffaa00', '#39ff14', '#ff4444', '#b026ff'], borderWidth: 0 }] 
            }, 
            options: { plugins: { legend: { position: 'bottom', labels: { color: getChartTextColor() } } } }
        });
    }

    const wCtx = document.getElementById('weeklyHoursChart');
    if(wCtx) {
        weeklyHoursChart = new Chart(wCtx, {
            type: 'bar',
            data: { labels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], datasets: [{ label: 'Study Hours', data: [0,0,0,0,0,0,0], backgroundColor: 'rgba(0, 243, 255, 0.5)', borderColor: '#00f3ff', borderWidth: 1, borderRadius: 4 }] },
            options: { responsive: true, scales: { y: { beginAtZero: true, grid: { color: getChartGridColor() }, ticks: { color: getChartTextColor() } }, x: { grid: { display: false }, ticks: { color: getChartTextColor() } } }, plugins: { legend: { display: false } } }
        });
    }

    const mCtx = document.getElementById('monthlyChart');
    if(mCtx) {
        monthlyChart = new Chart(mCtx, {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Study Minutes', data: [], backgroundColor: 'rgba(57, 255, 20, 0.2)', borderColor: '#39ff14', borderWidth: 2, fill: true, tension: 0.3 }] },
            options: { responsive: true, scales: { y: { beginAtZero: true, grid: { color: getChartGridColor() }, ticks: { color: getChartTextColor() } }, x: { grid: { display: false }, ticks: { color: getChartTextColor(), maxTicksLimit: 7 } } }, plugins: { legend: { display: false } } }
        });
    }
    updateCharts();
}

function updateCharts() {
    const tc = getChartTextColor(), gc = getChartGridColor();
    if(subjectChart) {
        const d = [state.subjectData.quant || 0, state.subjectData.reasoning || 0, state.subjectData.english || 0, state.subjectData.gk || 0, state.subjectData.mock || 0];
        subjectChart.data.datasets[0].data = d.some(v => v > 0) ? d : [1,1,1,1,1];
        subjectChart.options.plugins.legend.labels.color = tc;
        subjectChart.update();
    }
    if(weeklyHoursChart) {
        const today = new Date(); const data = []; const labels = []; const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        for(let i=6; i>=0; i--) {
            const d = new Date(today); d.setDate(d.getDate() - i);
            labels.push(days[d.getDay()]);
            data.push((state.heatmapData[d.toISOString().split('T')[0]] || 0)/60);
        }
        weeklyHoursChart.data.labels = labels; weeklyHoursChart.data.datasets[0].data = data;
        weeklyHoursChart.options.scales.x.ticks.color = tc; weeklyHoursChart.options.scales.y.ticks.color = tc;
        weeklyHoursChart.options.scales.y.grid.color = gc;
        weeklyHoursChart.update();
    }
    if(monthlyChart) {
        const today = new Date(); const data = []; const labels = [];
        for(let i=29; i>=0; i--) {
            const d = new Date(today); d.setDate(d.getDate() - i);
            labels.push(`${d.getMonth()+1}/${d.getDate()}`);
            data.push(state.heatmapData[d.toISOString().split('T')[0]] || 0);
        }
        monthlyChart.data.labels = labels; monthlyChart.data.datasets[0].data = data;
        monthlyChart.options.scales.x.ticks.color = tc; monthlyChart.options.scales.y.ticks.color = tc;
        monthlyChart.options.scales.y.grid.color = gc;
        monthlyChart.update();
    }
}

// -----------------------------------------
// OTHER TOOLS (Mock Intelligence, Coach)
// -----------------------------------------
document.getElementById('analyze-mock-btn')?.addEventListener('click', () => {
    const q = parseInt(document.getElementById('mock-quant').value) || 0;
    const r = parseInt(document.getElementById('mock-reasoning').value) || 0;
    const e = parseInt(document.getElementById('mock-english').value) || 0;
    const gk = parseInt(document.getElementById('mock-gk').value) || 0;
    
    const total = q + r + e + gk;
    const accuracy = Math.round((total / 200) * 100);
    const estRank = Math.max(1, 50000 - (total * 200));
    
    let weakSec = 'Quant'; let minScore = q;
    if(r < minScore) { minScore = r; weakSec = 'Reasoning'; }
    if(e < minScore) { minScore = e; weakSec = 'English'; }
    if(gk < minScore) { minScore = gk; weakSec = 'GK'; }
    
    const res = document.getElementById('mock-analysis-result');
    if(res) {
        res.style.display = 'block';
        res.innerHTML = `
            <strong>Total Score:</strong> ${total} / 200 <br>
            <strong>Accuracy Estimate:</strong> ${accuracy}% <br>
            <strong>Estimated AIR:</strong> #${estRank.toLocaleString()} <br>
            <strong>Weakest Section:</strong> <span style="color:var(--danger-neon)">${weakSec}</span> <br><br>
            <em>AI Plan:</em> Focus entirely on ${weakSec} for the next 3 days. Practice sectional mocks.
        `;
    }
});

function updateCoachMessage() {
    const msgElem = document.getElementById('ai-coach-message');
    if(!msgElem) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const mins = state.heatmapData[todayStr] || 0;
    
    if (mins === 0) msgElem.innerText = "\"Start your day right! A 25m Pomodoro awaits.\"";
    else if (mins < 60) msgElem.innerText = `"Great start! You're ${mins} minutes in. Push for 2 hours!"`;
    else msgElem.innerText = "\"Incredible focus! You are studying like an Inspector.\"";
}

document.getElementById('gen-routine-btn')?.addEventListener('click', () => {
    const weak = getWeakestSubject();
    const routine = `**AI Pro Schedule (Focus: ${weak})**
* 04:30 AM - Wake up & Hydrate
* 05:00 AM - Exercise
* 06:00 AM - Quant Practice
* 07:30 AM - Reasoning
* 09:00 AM - Breakfast
* 10:00 AM - English Practice
* 11:30 AM - GK Revision
* 02:00 PM - Mock Test
* 06:00 PM - **Deep Revision (${weak})**
* 09:00 PM - Daily Review`;
    const rDisplay = document.getElementById('routine-display');
    if(rDisplay) rDisplay.innerHTML = marked.parse(routine);
});

// -----------------------------------------
// RENDER ALL
// -----------------------------------------
function renderAll() {
    const levelElem = document.getElementById('user-level');
    if(levelElem) levelElem.innerText = state.level;
    const xpElem = document.getElementById('user-xp');
    if(xpElem) xpElem.innerText = state.xp;
    const streakElem = document.getElementById('current-streak');
    if(streakElem) streakElem.innerText = state.currentStreak;
    const daysElem = document.getElementById('total-days');
    if(daysElem) daysElem.innerText = state.studyDays;
    const hoursElem = document.getElementById('total-hours');
    if(hoursElem) hoursElem.innerText = state.studyHours.toFixed(1);
    const xpProg = document.getElementById('xp-progress');
    if(xpProg) xpProg.style.width = `${state.xp % 100}%`;
    
    renderMissions();
    renderHeatmap();
    renderCalendar();
    renderSyllabus();
    renderGoals();
    renderBadges();
    updateRank();
}

function renderBadges() {
    const container = document.getElementById('badges-container');
    if(!container) return;
    container.innerHTML = '';
    
    // Check constraints
    if(state.studyDays >= 3) state.badges.starter.unlocked = true;
    if(state.currentStreak >= 7) state.badges.warrior.unlocked = true;
    if(state.currentStreak >= 30) state.badges.legend.unlocked = true;
    if(state.studyHours >= 200) state.badges.master.unlocked = true;

    Object.values(state.badges).forEach(b => {
        const span = document.createElement('span');
        span.className = `badge ${b.unlocked ? 'unlocked rgb-glow' : ''}`;
        span.innerText = b.name;
        span.title = b.desc;
        container.appendChild(span);
    });
}

// Syllabus Tabs Logic via Event Delegation
document.querySelector('.syllabus-tabs')?.addEventListener('click', (e) => {
    const tab = e.target.closest('.syl-tab');
    if (!tab) return;
    
    playClickSound();
    document.querySelectorAll('.syl-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.syl-pane').forEach(p => p.classList.remove('active'));
    
    tab.classList.add('active');
    const targetId = tab.getAttribute('data-target');
    const targetPane = document.getElementById(targetId);
    if (targetPane) targetPane.classList.add('active');
});

// -----------------------------------------
// BOOTSTRAP
// -----------------------------------------
window.addEventListener('DOMContentLoaded', () => {
    const theme = localStorage.getItem('ssc_ai_theme');
    if (theme === 'light') document.body.classList.add('light-theme');
    
    loadState();
    initCharts();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js').catch(err => console.log(err));
    }
});