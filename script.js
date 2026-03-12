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
    console.log("Firebase initialized.");
} catch(e) { console.warn("Firebase offline."); }

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
        starter: { id: 'starter', name: 'Starter', unlocked: false },
        warrior: { id: 'warrior', name: 'Warrior', unlocked: false },
        legend: { id: 'legend', name: 'Legend', unlocked: false },
        master: { id: 'master', name: 'Master', unlocked: false }
    }
};

const clickSound = new Audio("sounds/click.mp3");
function playClick() { clickSound.currentTime = 0; clickSound.play().catch(()=>{}); }

function loadState() {
    try {
        const saved = localStorage.getItem('ssc_ai_pro_v11');
        if (saved) {
            const parsed = JSON.parse(saved);
            Object.assign(state, parsed);
        }
    } catch (e) {}
    updateStreak();
    loadMissions();
    renderAll();
    syncGlobal();
}

function saveState() {
    localStorage.setItem('ssc_ai_pro_v11', JSON.stringify(state));
    renderAll();
}

// -----------------------------------------
// FIREBASE REAL-TIME SYNC
// -----------------------------------------
async function syncGlobal() {
    if(!db) return;
    const email = localStorage.getItem('ssc_user_email') || 'Aspirant';
    const name = email.split('@')[0];
    const data = { 
        username: name, 
        xp: state.xp, 
        hours: Math.round(state.studyHours), 
        updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
    };
    try {
        await db.collection('leaderboard').doc(name).set(data, { merge: true });
        const snap = await db.collection('leaderboard').orderBy('xp', 'desc').limit(10).get();
        const lb = [];
        snap.forEach(doc => lb.push(doc.data()));
        renderLeaderboard(lb);
    } catch(e) { console.error("Leaderboard Sync Error:", e); }
}

function renderLeaderboard(data) {
    const tbody = document.getElementById('leaderboard-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    const myName = (localStorage.getItem('ssc_user_email') || '').split('@')[0];
    data.forEach((user, i) => {
        const tr = document.createElement('tr');
        if(user.username === myName) tr.className = 'highlight-user rgb-glow';
        tr.innerHTML = `<td>#${i+1}</td><td>${user.username}</td><td>${user.xp} XP</td><td>${user.hours}h</td>`;
        tbody.appendChild(tr);
    });
}

// -----------------------------------------
// AI BACKEND INTEGRATION
// -----------------------------------------
const BACKEND_URL = "https://ssc-ai-dashboard.onrender.com";

async function callAI(endpoint, body) {
    try {
        const res = await fetch(`${BACKEND_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if(!res.ok) throw new Error("Backend Error");
        return await res.json();
    } catch(e) {
        console.error("AI Error:", e);
        return { response: "❌ System is busy. Check if your backend is running.", source: 'Error' };
    }
}

// Chat Assistant
async function handleChat() {
    playClick();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if(!text) return;
    appendMsg(text, true);
    input.value = '';
    const typing = appendMsg('AI is thinking...', false, true);
    const data = await callAI('/ai-chat', { message: text, weakSubject: getWeakest() });
    typing.remove();
    appendMsg(data.response + ` <small style="opacity:0.5">[${data.source}]</small>`, false);
}

function appendMsg(text, isUser, isTyping=false) {
    const cont = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
    div.innerHTML = isTyping ? `<em>${text}</em>` : marked.parse(text);
    cont.appendChild(div);
    cont.scrollTop = cont.scrollHeight;
    return div;
}

// -----------------------------------------
// CORE LOGIC
// -----------------------------------------
function addStudyMinutes(mins, subject) {
    state.xp += Math.floor(mins / 5);
    state.studyHours += (mins / 60);
    state.level = Math.floor(state.xp / 100) + 1;
    const today = new Date().toISOString().split('T')[0];
    state.heatmapData[today] = (state.heatmapData[today] || 0) + mins;
    if(subject) state.subjectData[subject] = (state.subjectData[subject] || 0) + mins;
    saveState();
    syncGlobal();
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

function getWeakest() {
    const subjects = ['quant', 'reasoning', 'english', 'gk'];
    return subjects.sort((a,b) => (state.subjectData[a] || 0) - (state.subjectData[b] || 0))[0];
}

// -----------------------------------------
// UI RENDERERS
// -----------------------------------------
function renderAll() {
    document.getElementById('user-level').innerText = state.level;
    document.getElementById('user-xp').innerText = state.xp;
    document.getElementById('current-streak').innerText = state.currentStreak;
    document.getElementById('total-days').innerText = state.studyDays;
    document.getElementById('total-hours').innerText = state.studyHours.toFixed(1);
    document.getElementById('xp-progress').style.width = `${state.xp % 100}%`;
    
    renderSyllabus();
    renderHeatmap();
    renderMissions();
    renderBadges();
    updateOverview();
    updateCharts();
}

function renderSyllabus() {
    let total = 0, done = 0;
    ['quant', 'reasoning', 'english', 'gk'].forEach(sub => {
        const ul = document.getElementById(`list-${sub}`);
        if(!ul) return;
        ul.innerHTML = '';
        if(!state.syllabusProgress[sub]) state.syllabusProgress[sub] = [];
        SSC_SYLLABUS[sub].forEach(t => {
            total++;
            const isDone = state.syllabusProgress[sub].includes(t);
            if(isDone) done++;
            const li = document.createElement('li');
            li.className = `topic-item ${isDone ? 'completed' : ''}`;
            li.innerHTML = `<input type="checkbox" ${isDone ? 'checked' : ''} onchange="toggleSyllabus('${sub}', '${t}')"> <span>${t}</span>`;
            ul.appendChild(li);
        });
        const perc = Math.round((state.syllabusProgress[sub].length / SSC_SYLLABUS[sub].length) * 100) || 0;
        document.getElementById(`${sub}-prog`).innerText = `(${perc}%)`;
    });
    const overall = total > 0 ? Math.round((done/total)*100) : 0;
    document.getElementById('syllabus-progress-text').innerText = `${overall}% Complete`;
    document.getElementById('syllabus-progress-bar').style.width = `${overall}%`;
}

window.toggleSyllabus = (sub, t) => {
    playClick();
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
        day.title = `${dateStr}: ${mins}m`;
        cont.appendChild(day);
    }
}

function renderMissions() {
    const list = document.getElementById('missions-list');
    if(!list) return;
    list.innerHTML = `
        <li class="mission-item"><span>Solve 20 Quant questions</span></li>
        <li class="mission-item"><span>Complete 2 Pomodoros</span></li>
        <li class="mission-item"><span>Revise Current Affairs</span></li>
    `;
}

function renderBadges() {
    const cont = document.getElementById('badges-container');
    if(!cont) return;
    cont.innerHTML = '';
    if(state.studyDays >= 3) state.badges.starter.unlocked = true;
    if(state.currentStreak >= 7) state.badges.warrior.unlocked = true;
    if(state.studyHours >= 200) state.badges.master.unlocked = true;
    Object.values(state.badges).forEach(b => {
        const span = document.createElement('span');
        span.className = `badge ${b.unlocked ? 'unlocked rgb-glow' : ''}`;
        span.innerText = b.name;
        cont.appendChild(span);
    });
}

// -----------------------------------------
// ANALYTICS & CHARTS
// -----------------------------------------
let subjChart;
function updateCharts() {
    const ctx = document.getElementById('subjectChart');
    if(!ctx) return;
    if(subjChart) subjChart.destroy();
    const d = [state.subjectData.quant, state.subjectData.reasoning, state.subjectData.english, state.subjectData.gk];
    subjChart = new Chart(ctx, { 
        type: 'doughnut', 
        data: { labels: ['Quant', 'Reas', 'Eng', 'GK'], datasets: [{ data: d.some(v=>v>0)?d:[1,1,1,1], backgroundColor: ['#00f3ff', '#ffaa00', '#39ff14', '#ff4444'] }] }, 
        options: { plugins: { legend: { display: false } } }
    });
}

function updateOverview() {
    const today = new Date().toISOString().split('T')[0];
    const mins = state.heatmapData[today] || 0;
    const rem = Math.max(0, 480 - mins);
    document.getElementById('remaining-hours-display').innerText = `${Math.floor(rem/60)}h ${rem%60}m`;
    document.getElementById('focus-subject-display').innerText = getWeakest().toUpperCase();
}

// -----------------------------------------
// TIMER
// -----------------------------------------
let timerInt, timeLeft = 25*60, isRunning = false;
function updateTimer() {
    const m = Math.floor(timeLeft/60).toString().padStart(2,'0');
    const s = (timeLeft%60).toString().padStart(2,'0');
    document.getElementById('timer-display').innerText = `${m}:${s}`;
}
document.getElementById('start-btn')?.addEventListener('click', () => {
    playClick();
    if(isRunning) return;
    isRunning = true;
    timerInt = setInterval(() => {
        timeLeft--; updateTimer();
        if(timeLeft <= 0) {
            clearInterval(timerInt); isRunning = false;
            addStudyMinutes(25, document.getElementById('study-subject-select').value);
            timeLeft = 25*60; updateTimer();
        }
    }, 1000);
});
document.getElementById('pause-btn')?.addEventListener('click', () => { playClick(); clearInterval(timerInt); isRunning = false; });
document.getElementById('reset-btn')?.addEventListener('click', () => { playClick(); clearInterval(timerInt); isRunning = false; timeLeft = 25*60; updateTimer(); });

// -----------------------------------------
// EVENTS & BOOT
// -----------------------------------------
document.addEventListener('click', (e) => {
    const tab = e.target.closest('.syl-tab');
    if(tab) {
        playClick();
        document.querySelectorAll('.syl-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.syl-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.getAttribute('data-target')).classList.add('active');
    }
});

document.getElementById('theme-toggle')?.addEventListener('click', () => {
    playClick();
    document.body.classList.toggle('light-theme');
});

document.getElementById('chat-send-btn')?.addEventListener('click', handleChat);
document.getElementById('chat-input')?.addEventListener('keypress', (e) => { if(e.key==='Enter') handleChat(); });

window.addEventListener('DOMContentLoaded', loadState);