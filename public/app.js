/* ============================================================
   MyQuiz - 前端逻辑（三级结构：课程→分组→题库→题目）
   教师端：课程管理、导入题库、学员管理、成绩查看
   学员端：练习、考试、错题本、记录
   ============================================================ */
const QM = (() => {
'use strict';

// ===== Constants =====
const API = '/api';
const TOKEN_KEY = 'qm_token';
const USER_KEY = 'qm_user';
const TYPE_LABELS = { single: '单选', multi: '多选', judge: '判断', blank: '填空' };
const TYPE_BADGE = { single: 'badge-single', multi: 'badge-multi', judge: 'badge-judge', blank: 'badge-blank' };
const VIEW_TITLES = {
  dashboard: '首页', courses: '课程管理', import: '导入题库',
  students: '学员管理', practice: '刷题练习', exam: '考试模式',
  wrongbook: '错题本', records: '练习记录', settings: '设置'
};
const TEACHER_NAV = ['dashboard', 'courses', 'import', 'students', 'records', 'settings'];
const STUDENT_NAV = ['dashboard', 'practice', 'exam', 'wrongbook', 'records'];

// ===== State =====
let currentUser = null, token = null, currentView = 'dashboard';
let courses = [], banks = [], activeBankId = null;
let quizSession = null, examTimer = null;

// ===== API Helper =====
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API + path, { ...options, headers });
  if (res.status === 401) { logout(); throw new Error('未登录'); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

// ===== Utils =====
function $(id) { return document.getElementById(id); }
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function formatDate(s) { return s ? s.slice(0, 16).replace('T', ' ') : '-'; }
function formatDuration(sec) { if (!sec) return '0秒'; const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60; return h > 0 ? `${h}时${m}分` : m > 0 ? `${m}分${s}秒` : `${s}秒`; }
function shuffle(arr) { for (let i = arr.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; }
function toast(msg, type = 'info') { const c = $('toast-container'); const el = document.createElement('div'); el.className = 'toast toast-' + type; el.textContent = msg; c.appendChild(el); setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2500); }
function showModal(title, body, footer) { $('modal-title').textContent = title; $('modal-body').innerHTML = body; $('modal-footer').innerHTML = footer || ''; $('modal-overlay').classList.add('show'); }
function closeModal() { $('modal-overlay').classList.remove('show'); }

// ===== Auth =====
function saveSession(t, u) { token = t; currentUser = u; localStorage.setItem(TOKEN_KEY, t); localStorage.setItem(USER_KEY, JSON.stringify(u)); }
function loadSession() { const t = localStorage.getItem(TOKEN_KEY); const u = localStorage.getItem(USER_KEY); if (t && u) { token = t; currentUser = JSON.parse(u); return true; } return false; }
function logout() { token = null; currentUser = null; localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); showLogin(); }

async function login() {
  const username = $('login-username').value.trim(), password = $('login-password').value.trim();
  if (!username || !password) { toast('请输入用户名和密码', 'error'); return; }
  try { const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }); saveSession(data.token, data.user); showApp(); }
  catch (e) { toast(e.message, 'error'); }
}

async function register() {
  const username = $('reg-username').value.trim(), password = $('reg-password').value.trim(), displayName = $('reg-displayname').value.trim();
  if (!username || username.length < 3) { toast('用户名至少3字符', 'error'); return; }
  if (!password) { toast('请输入密码', 'error'); return; }
  try { const data = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, displayName }) }); saveSession(data.token, data.user); showApp(); }
  catch (e) { toast(e.message, 'error'); }
}

function showLogin() { $('login-page').style.display = 'flex'; $('app').classList.remove('show'); }
function showApp() { $('login-page').style.display = 'none'; $('app').classList.add('show'); setupNav(); loadData().then(() => switchView('dashboard')); }

// ===== Navigation =====
function setupNav() {
  const nav = currentUser.role === 'teacher' ? TEACHER_NAV : STUDENT_NAV;
  $('nav-items').innerHTML = nav.map(v => `<button class="nav-item" data-view="${v}"><span class="nav-icon">${getNavIcon(v)}</span> ${VIEW_TITLES[v]}</button>`).join('');
  $('nav-items').querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => {
    switchView(btn.dataset.view);
    // Close sidebar on mobile
    const sb = $('sidebar'); const ov = $('sidebar-overlay');
    if (sb) sb.classList.remove('open');
    if (ov) ov.style.display = 'none';
  }));
  $('user-role-label').textContent = currentUser.role === 'teacher' ? '教师端' : '学员端';
  $('sidebar-user').textContent = (currentUser.displayName || currentUser.username) + (currentUser.role === 'teacher' ? ' (教师)' : ' (学员)');
}

function getNavIcon(view) {
  const icons = { dashboard: '\u2630', courses: '\uD83D\uDCDA', import: '\u21A9', students: '\uD83D\uDC65', practice: '\u270E', exam: '\uD83D\uDCDD', wrongbook: '\u274C', records: '\uD83D\uDCCA', settings: '\u2699' };
  return icons[view] || '';
}

function switchView(view) {
  if (quizSession && (view === 'practice' || view === 'exam') && currentView === view) return;
  if (quizSession && view !== 'practice' && view !== 'exam') { if (examTimer) { clearInterval(examTimer); examTimer = null; } document.body.classList.remove('focus-mode'); }
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('view-' + view)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  $('topbar-title').textContent = VIEW_TITLES[view] || view;
  renderView(view);
}

function renderView(view) {
  switch (view) {
    case 'dashboard': renderDashboard(); break;
    case 'courses': currentUser.role === 'teacher' ? renderCourses() : null; break;
    case 'import': currentUser.role === 'teacher' ? renderImport() : null; break;
    case 'students': currentUser.role === 'teacher' ? renderStudents() : null; break;
    case 'practice': renderPracticeConfig(); break;
    case 'exam': renderExamConfig(); break;
    case 'wrongbook': renderWrongBook(); break;
    case 'records': renderRecords(); break;
    case 'settings': currentUser.role === 'teacher' ? renderSettings() : null; break;
  }
}

// ===== Data Loading =====
async function loadData() {
  try {
    const data = await api('/banks');
    banks = data.banks || [];
    if (banks.length > 0 && !activeBankId) activeBankId = banks[0].id;
    updateTopbarBankSelect();
  } catch { banks = []; }
}

function updateTopbarBankSelect() {
  const right = $('topbar-right');
  if (currentUser.role === 'teacher') {
    right.innerHTML = '';
  } else {
    // Group banks by course_name then group_name
    const grouped = {};
    banks.forEach(b => {
      const key = `${b.course_name || '未分类'} / ${b.group_name || '未分组'}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(b);
    });
    const opts = Object.entries(grouped).map(([label, bs]) =>
      `<optgroup label="${esc(label)}">${bs.map(b => `<option value="${b.id}"${b.id === activeBankId ? ' selected' : ''}>${esc(b.name)} (${b.qcount})</option>`).join('')}</optgroup>`
    ).join('');
    right.innerHTML = `<select class="bank-select" onchange="QM.setActiveBank(this.value)">${opts || '<option value="">暂无题库</option>'}</select>`;
  }
}

function setActiveBank(id) { activeBankId = parseInt(id); renderView(currentView); }

// ===== Dashboard =====
async function renderDashboard() {
  const el = $('view-dashboard');
  const totalBanks = banks.length;
  const totalQ = banks.reduce((s, b) => s + (b.qcount || 0), 0);

  if (currentUser.role === 'teacher') {
    let courseCount = 0, studentCount = 0;
    try { const data = await api('/courses'); courses = data.courses || []; courseCount = courses.length; } catch {}
    try { const data = await api('/students'); studentCount = (data.students || []).length; } catch {}
    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${courseCount}</div><div class="stat-label">课程数量</div></div>
        <div class="stat-card"><div class="stat-value">${totalBanks}</div><div class="stat-label">题库数量</div></div>
        <div class="stat-card"><div class="stat-value">${totalQ}</div><div class="stat-label">题目总数</div></div>
        <div class="stat-card"><div class="stat-value">${studentCount}</div><div class="stat-label">学员数量</div></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">快捷操作</span></div>
        <div class="quick-actions">
          <div class="quick-action" onclick="QM.switchView('courses')"><div class="quick-action-icon blue">\uD83D\uDCDA</div><div><div class="quick-action-label">课程管理</div><div class="quick-action-desc">创建课程/分组/题库</div></div></div>
          <div class="quick-action" onclick="QM.switchView('import')"><div class="quick-action-icon green">\u21A9</div><div><div class="quick-action-label">导入题库</div><div class="quick-action-desc">TXT / JSON 格式</div></div></div>
          <div class="quick-action" onclick="QM.switchView('students')"><div class="quick-action-icon orange">\uD83D\uDC65</div><div><div class="quick-action-label">学员管理</div><div class="quick-action-desc">创建查看学员</div></div></div>
          <div class="quick-action" onclick="QM.switchView('records')"><div class="quick-action-icon red">\uD83D\uDCCA</div><div><div class="quick-action-label">成绩查看</div><div class="quick-action-desc">学员答题记录</div></div></div>
        </div>
      </div>
      ${courseCount === 0 ? `<div class="card" style="text-align:center;padding:40px;"><div style="font-size:40px;margin-bottom:12px;">\uD83D\uDCDA</div><div style="font-size:15px;font-weight:500;margin-bottom:6px;">还没有课程</div><div style="font-size:13px;color:var(--text-sec);margin-bottom:16px;">先创建课程，再添加分组和题库</div><button class="btn btn-primary" onclick="QM.switchView('courses')">去创建课程</button></div>` : ''}
    `;
  } else {
    let wrongCount = 0, recordCount = 0, todayCount = 0, todayCorrect = 0, totalAnswered = 0, totalCorrect = 0;
    try {
      const [wbRes, recRes] = await Promise.all([api('/wrongbook'), api('/records')]);
      wrongCount = (wbRes.entries || []).length;
      const records = recRes.records || [];
      recordCount = records.length;
      const today = new Date().toISOString().slice(0, 10);
      const todayRecs = records.filter(r => r.date && r.date.slice(0, 10) === today);
      todayCount = todayRecs.reduce((s, r) => s + r.total, 0);
      todayCorrect = todayRecs.reduce((s, r) => s + r.correct, 0);
      totalAnswered = records.reduce((s, r) => s + r.total, 0);
      totalCorrect = records.reduce((s, r) => s + r.correct, 0);
    } catch {}
    const todayAcc = todayCount > 0 ? Math.round(todayCorrect / todayCount * 100) : 0;
    const overallAcc = totalAnswered > 0 ? Math.round(totalCorrect / totalAnswered * 100) : 0;
    const bank = banks.find(b => b.id === activeBankId) || banks[0];
    el.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${bank ? bank.qcount : 0}</div><div class="stat-label">当前题库题数</div></div>
        <div class="stat-card ${wrongCount > 0 ? 'danger' : 'success'}"><div class="stat-value">${wrongCount}</div><div class="stat-label">待复习错题</div></div>
        <div class="stat-card"><div class="stat-value">${recordCount}</div><div class="stat-label">练习/考试次数</div></div>
        <div class="stat-card ${todayAcc >= 80 ? 'success' : todayAcc > 0 ? 'warning' : ''}"><div class="stat-value">${todayAcc}%</div><div class="stat-label">今日正确率</div></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">快捷操作</span></div>
        <div class="quick-actions">
          <div class="quick-action" onclick="QM.switchView('practice')"><div class="quick-action-icon green">\u270E</div><div><div class="quick-action-label">开始刷题</div><div class="quick-action-desc">顺序或随机练习</div></div></div>
          <div class="quick-action" onclick="QM.switchView('exam')"><div class="quick-action-icon orange">\uD83D\uDCDD</div><div><div class="quick-action-label">模拟考试</div><div class="quick-action-desc">限时答题测试</div></div></div>
          <div class="quick-action" onclick="QM.switchView('wrongbook')"><div class="quick-action-icon red">\u274C</div><div><div class="quick-action-label">错题复习</div><div class="quick-action-desc">${wrongCount} 道待复习</div></div></div>
        </div>
      </div>
      ${overallAcc > 0 ? `<div class="card"><div class="card-header"><span class="card-title">学习概览</span></div><div class="stats-bar" style="background:transparent;padding:0;"><div class="stats-bar-item"><div class="stats-bar-dot blue"></div> 总答题 ${totalAnswered} 次</div><div class="stats-bar-item"><div class="stats-bar-dot green"></div> 总正确 ${totalCorrect} 次</div><div class="stats-bar-item"><div class="stats-bar-dot gray"></div> 总正确率 ${overallAcc}%</div></div></div>` : ''}
      ${banks.length === 0 ? `<div class="card" style="text-align:center;padding:40px;"><div style="font-size:40px;margin-bottom:12px;">\u23F3</div><div style="font-size:15px;font-weight:500;margin-bottom:6px;">教师还没有上传题库</div><div style="font-size:13px;color:var(--text-sec);">请联系教师创建课程和题库</div></div>` : ''}
    `;
  }
}

// ===== Course Management (Teacher) =====
async function renderCourses() {
  const el = $('view-courses');
  try {
    const data = await api('/courses');
    courses = data.courses || [];
    if (courses.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\uD83D\uDCDA</div><div class="empty-state-text">还没有课程</div><div class="empty-state-hint">创建课程（如 PMP、高项），再添加分组和题库</div><button class="btn btn-primary mt-4" onclick="QM.createCourse()">+ 创建课程</button></div>`;
      return;
    }
    el.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <span class="text-sm text-sec">${courses.length} 个课程</span>
        <button class="btn btn-primary btn-sm" onclick="QM.createCourse()">+ 创建课程</button>
      </div>
      ${courses.map(c => `
        <div class="card">
          <div class="flex items-center justify-between mb-2">
            <div>
              <span style="font-size:16px;font-weight:600;">${esc(c.name)}</span>
              ${c.description ? `<span class="text-sm text-sec" style="margin-left:8px;">${esc(c.description)}</span>` : ''}
            </div>
            <div class="flex gap-2">
              <span class="badge badge-ok">${c.group_count || 0} 分组</span>
              <span class="badge badge-single">${c.bank_count || 0} 题库</span>
              <span class="badge badge-blank">${c.qcount || 0} 题</span>
              <button class="btn btn-ghost btn-sm" onclick="QM.editCourse(${c.id})" title="编辑">\u270E</button>
              <button class="btn btn-ghost btn-sm" onclick="QM.deleteCourse(${c.id})" title="删除" style="color:var(--danger);">\uD83D\uDDD1</button>
            </div>
          </div>
          <div id="course-${c.id}-groups"></div>
          <button class="btn btn-outline btn-sm mt-3" onclick="QM.createGroup(${c.id})">+ 添加分组</button>
        </div>
      `).join('')}
    `;
    // Load groups for each course
    courses.forEach(c => loadGroups(c.id));
  } catch (e) { toast(e.message, 'error'); }
}

async function loadGroups(courseId) {
  try {
    const data = await api(`/courses/${courseId}/groups`);
    const groups = data.groups || [];
    const el = $(`course-${courseId}-groups`);
    if (!el) return;
    if (groups.length === 0) { el.innerHTML = '<p class="text-sm text-sec" style="padding:8px 0;">暂无分组，点击下方按钮添加</p>'; return; }
    el.innerHTML = groups.map(g => `
      <div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:8px;">
        <div class="flex items-center justify-between mb-2">
          <span style="font-weight:500;">${esc(g.name)}</span>
          <div class="flex gap-2">
            <span class="badge badge-single">${g.bank_count || 0} 题库</span>
            <span class="badge badge-blank">${g.qcount || 0} 题</span>
            <button class="btn btn-ghost btn-sm" onclick="QM.renameGroup(${courseId}, ${g.id})" title="重命名">\u270E</button>
            <button class="btn btn-ghost btn-sm" onclick="QM.deleteGroup(${courseId}, ${g.id})" title="删除" style="color:var(--danger);">\u2715</button>
          </div>
        </div>
        <div id="group-${g.id}-banks"></div>
        <button class="btn btn-outline btn-sm" onclick="QM.createBankUnderGroup(${g.id})">+ 创建题库</button>
      </div>
    `).join('');
    groups.forEach(g => loadGroupBanks(g.id));
  } catch (e) { console.error(e); }
}

async function loadGroupBanks(groupId) {
  try {
    const data = await api(`/groups/${groupId}/banks`);
    const bks = data.banks || [];
    const el = $(`group-${groupId}-banks`);
    if (!el) return;
    if (bks.length === 0) { el.innerHTML = '<p class="text-sm text-sec" style="padding:4px 0;">暂无题库</p>'; return; }
    el.innerHTML = bks.map(b => `
      <div class="bank-item">
        <div class="bank-item-info">
          <div class="bank-item-name">${esc(b.name)}</div>
          <div class="bank-item-meta">${b.qcount || 0} 题 · ${formatDate(b.created_at)}</div>
        </div>
        <div class="bank-item-actions">
          <button class="btn btn-ghost btn-sm" onclick="QM.viewBankQuestions(${b.id})" title="查看题目">\uD83D\uDCC4</button>
          <button class="btn btn-ghost btn-sm" onclick="QM.renameBank(${b.id})" title="重命名">\u270E</button>
          <button class="btn btn-ghost btn-sm" onclick="QM.deleteBank(${b.id})" title="删除" style="color:var(--danger);">\uD83D\uDDD1</button>
        </div>
      </div>
    `).join('');
  } catch (e) { console.error(e); }
}

// --- Course CRUD ---
function createCourse() {
  showModal('创建课程', `
    <div class="form-group"><label class="form-label">课程名称</label><input class="form-input" id="course-name" placeholder="如：PMP、高项" autofocus></div>
    <div class="form-group"><label class="form-label">描述（可选）</label><input class="form-input" id="course-desc" placeholder="课程简介"></div>
  `, `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-primary" onclick="QM.doCreateCourse()">创建</button>`);
}

async function doCreateCourse() {
  const name = $('course-name').value.trim(), description = $('course-desc').value.trim();
  if (!name) { toast('请输入名称', 'error'); return; }
  try { await api('/courses', { method: 'POST', body: JSON.stringify({ name, description }) }); closeModal(); toast('课程创建成功', 'success'); renderCourses(); }
  catch (e) { toast(e.message, 'error'); }
}

function editCourse(id) {
  const c = courses.find(x => x.id === id); if (!c) return;
  showModal('编辑课程', `
    <div class="form-group"><label class="form-label">课程名称</label><input class="form-input" id="edit-course-name" value="${esc(c.name)}"></div>
    <div class="form-group"><label class="form-label">描述</label><input class="form-input" id="edit-course-desc" value="${esc(c.description || '')}"></div>
  `, `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-primary" onclick="QM.doEditCourse(${id})">保存</button>`);
}

async function doEditCourse(id) {
  const name = $('edit-course-name').value.trim(), description = $('edit-course-desc').value.trim();
  if (!name) { toast('请输入名称', 'error'); return; }
  try { await api(`/courses/${id}`, { method: 'PUT', body: JSON.stringify({ name, description }) }); closeModal(); toast('已更新', 'success'); renderCourses(); }
  catch (e) { toast(e.message, 'error'); }
}

async function deleteCourse(id) {
  showModal('确认删除', '<p>删除课程将同时删除其下所有分组、题库和题目，不可恢复。</p>', `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-danger" onclick="QM.doDeleteCourse(${id})">删除</button>`);
}

async function doDeleteCourse(id) {
  try { await api(`/courses/${id}`, { method: 'DELETE' }); closeModal(); toast('课程已删除', 'success'); await loadData(); renderCourses(); }
  catch (e) { toast(e.message, 'error'); }
}

// --- Group CRUD ---
function createGroup(courseId) {
  showModal('添加分组', `<div class="form-group"><label class="form-label">分组名称</label><input class="form-input" id="group-name" placeholder="如：第一章 项目管理概论" autofocus></div>`,
    `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-primary" onclick="QM.doCreateGroup(${courseId})">创建</button>`);
}

async function doCreateGroup(courseId) {
  const name = $('group-name').value.trim();
  if (!name) { toast('请输入名称', 'error'); return; }
  try { await api(`/courses/${courseId}/groups`, { method: 'POST', body: JSON.stringify({ name }) }); closeModal(); toast('分组创建成功', 'success'); loadGroups(courseId); }
  catch (e) { toast(e.message, 'error'); }
}

function renameGroup(courseId, gid) {
  showModal('重命名分组', `<div class="form-group"><input class="form-input" id="rename-group-input" placeholder="分组名称"></div>`,
    `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-primary" onclick="QM.doRenameGroup(${courseId}, ${gid})">保存</button>`);
  // Fetch current name
  api(`/courses/${courseId}/groups`).then(data => { const g = (data.groups || []).find(x => x.id === gid); if (g) $('rename-group-input').value = g.name; });
}

async function doRenameGroup(courseId, gid) {
  const name = $('rename-group-input').value.trim();
  if (!name) { toast('请输入名称', 'error'); return; }
  try { await api(`/courses/${courseId}/groups/${gid}`, { method: 'PUT', body: JSON.stringify({ name }) }); closeModal(); toast('已重命名', 'success'); loadGroups(courseId); }
  catch (e) { toast(e.message, 'error'); }
}

async function deleteGroup(courseId, gid) {
  showModal('确认删除', '<p>删除分组将同时删除其下所有题库和题目，不可恢复。</p>', `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-danger" onclick="QM.doDeleteGroup(${courseId}, ${gid})">删除</button>`);
}

async function doDeleteGroup(courseId, gid) {
  try { await api(`/courses/${courseId}/groups/${gid}`, { method: 'DELETE' }); closeModal(); toast('分组已删除', 'success'); await loadData(); loadGroups(courseId); }
  catch (e) { toast(e.message, 'error'); }
}

// --- Bank CRUD (under group) ---
function createBankUnderGroup(groupId) {
  showModal('创建题库', `<div class="form-group"><label class="form-label">题库名称</label><input class="form-input" id="bank-name-input" placeholder="如：第一章练习题" autofocus></div>`,
    `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-primary" onclick="QM.doCreateBankUnderGroup(${groupId})">创建</button>`);
}

async function doCreateBankUnderGroup(groupId) {
  const name = $('bank-name-input').value.trim();
  if (!name) { toast('请输入名称', 'error'); return; }
  try { await api(`/groups/${groupId}/banks`, { method: 'POST', body: JSON.stringify({ name }) }); closeModal(); toast('题库创建成功', 'success'); await loadData(); loadGroupBanks(groupId); }
  catch (e) { toast(e.message, 'error'); }
}

function renameBank(id) {
  showModal('重命名题库', `<div class="form-group"><input class="form-input" id="rename-bank-input"></div>`,
    `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-primary" onclick="QM.doRenameBank(${id})">保存</button>`);
  const bank = banks.find(b => b.id === id); if (bank) $('rename-bank-input').value = bank.name;
}

async function doRenameBank(id) {
  const name = $('rename-bank-input').value.trim();
  if (!name) { toast('请输入名称', 'error'); return; }
  try { await api(`/banks/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }); closeModal(); toast('已重命名', 'success'); await loadData(); renderCourses(); }
  catch (e) { toast(e.message, 'error'); }
}

async function deleteBank(id) {
  showModal('确认删除', '<p>删除题库将同时删除其所有题目，不可恢复。</p>', `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-danger" onclick="QM.doDeleteBank(${id})">删除</button>`);
}

async function doDeleteBank(id) {
  try { await api(`/banks/${id}`, { method: 'DELETE' }); closeModal(); toast('题库已删除', 'success'); await loadData(); renderCourses(); }
  catch (e) { toast(e.message, 'error'); }
}

// --- Bank Questions View (add/edit/delete questions) ---
async function viewBankQuestions(id) {
  try {
    const data = await api(`/banks/${id}/questions`);
    const bank = data.bank;
    window._viewingBankId = id;
    const qs = data.questions || [];
    showModal(`题库：${esc(bank.name)}（${qs.length} 题）`, `
      <div style="max-height:400px;overflow-y:auto;">
        ${qs.length === 0 ? '<p class="text-sm text-sec text-center" style="padding:20px;">暂无题目，点击下方按钮添加或导入</p>' : `
        <table class="preview-table"><thead><tr><th style="width:36px">#</th><th style="width:60px">类型</th><th>题目</th><th style="width:80px">答案</th><th style="width:60px">操作</th></tr></thead><tbody>
          ${qs.map((q, i) => `<tr><td>${i+1}</td><td><span class="badge ${TYPE_BADGE[q.type]}">${TYPE_LABELS[q.type]}</span></td><td class="truncate" style="max-width:260px;">${esc(q.question.slice(0,50))}</td><td class="text-sm">${esc(q.answer_keys?.join(',')||q.answer_text?.join(',')||'-')}</td><td><button class="btn btn-ghost btn-sm" onclick="QM.editQuestion(${q.id})" title="编辑">\u270E</button> <button class="btn btn-ghost btn-sm" onclick="QM.deleteQuestion(${q.id})" title="删除" style="color:var(--danger);">\u2715</button></td></tr>`).join('')}
        </tbody></table>`}
      </div>`, `<button class="btn btn-outline" onclick="QM.closeModal()">关闭</button><button class="btn btn-primary" onclick="QM.addQuestion(${id})">+ 添加题目</button>`);
  } catch (e) { toast(e.message, 'error'); }
}

function addQuestion(bankId) { showQuestionEditor(bankId, null); }

async function editQuestion(qid) {
  try {
    const bankId = window._viewingBankId;
    const data = await api(`/banks/${bankId}/questions`);
    const q = (data.questions || []).find(x => x.id === qid);
    if (!q) { toast('题目不存在', 'error'); return; }
    showQuestionEditor(bankId, q);
  } catch (e) { toast(e.message, 'error'); }
}

function showQuestionEditor(bankId, q) {
  const isEdit = !!q;
  showModal(isEdit ? '编辑题目' : '添加题目', `
    <div class="form-group"><label class="form-label">题型</label><select class="form-select" id="qe-type">
      <option value="single" ${q?.type==='single'?'selected':''}>单选题</option>
      <option value="multi" ${q?.type==='multi'?'selected':''}>多选题</option>
      <option value="judge" ${q?.type==='judge'?'selected':''}>判断题</option>
      <option value="blank" ${q?.type==='blank'?'selected':''}>填空题</option>
    </select></div>
    <div class="form-group"><label class="form-label">题干</label><textarea class="form-textarea" id="qe-question" rows="3" style="min-height:80px;" placeholder="输入题目内容，填空题用 ____ 标记空位">${esc(q?.question || '')}</textarea></div>
    <div class="form-group"><label class="form-label">选项（每行一个，格式：A. 选项内容）</label><textarea class="form-textarea" id="qe-options" rows="4" style="min-height:100px;" placeholder="A. 选项一${'\n'}B. 选项二${'\n'}C. 选项三${'\n'}D. 选项四">${q?.options?.map(o => o.key + '. ' + o.text).join('\n') || ''}</textarea><div class="form-hint">判断题选项可留空，自动生成正确/错误</div></div>
    <div class="form-group"><label class="form-label">答案</label><input class="form-input" id="qe-answer" placeholder="选择题填字母（如 B 或 ABD），判断题填 正确/错误，填空题填答案文本" value="${esc(q?.answer_keys?.join('') || q?.answer_text?.join(', ') || '')}"></div>
    <div class="form-group"><label class="form-label">解析（可选）</label><textarea class="form-textarea" id="qe-analysis" rows="2" style="min-height:60px;" placeholder="答案解析">${esc(q?.analysis || '')}</textarea></div>
    <div class="form-row"><div class="form-group"><label class="form-label">分类（可选）</label><input class="form-input" id="qe-topic" placeholder="如：常识" value="${esc(q?.topic || '')}"></div><div class="form-group"><label class="form-label">分值</label><input class="form-input" id="qe-score" type="number" value="${q?.score || 1}" min="1" max="10"></div></div>
  `, `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-primary" onclick="QM.doSaveQuestion(${bankId}, ${q?.id || 'null'})">${isEdit ? '保存' : '添加'}</button>`);
}

async function doSaveQuestion(bankId, qid) {
  const type = $('qe-type').value, question = $('qe-question').value.trim(), optionsText = $('qe-options').value.trim();
  const answerRaw = $('qe-answer').value.trim(), analysis = $('qe-analysis').value.trim(), topic = $('qe-topic').value.trim();
  const score = parseInt($('qe-score').value) || 1;
  if (!question) { toast('题干不能为空', 'error'); return; }
  let options = [];
  if (type === 'judge') { options = [{ key: 'A', text: '正确' }, { key: 'B', text: '错误' }]; }
  else if (type !== 'blank') {
    optionsText.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => { const m = line.match(/^([A-Da-d])\s*[.、)）:：]\s*(.+)/); if (m) options.push({ key: m[1].toUpperCase(), text: m[2].trim() }); });
    if (options.length < 2) { toast('至少需要2个选项', 'error'); return; }
  }
  let answerKeys = [], answerText = [];
  if (type === 'judge') { if (/正确|对|true|√/i.test(answerRaw)) { answerKeys = ['正确']; answerText = ['正确']; } else if (/错误|错|false|×/i.test(answerRaw)) { answerKeys = ['错误']; answerText = ['错误']; } else { toast('判断题答案填"正确"或"错误"', 'error'); return; } }
  else if (type === 'blank') { answerText = answerRaw.split(/[,，;；]/).map(s => s.trim()).filter(Boolean); if (!answerText.length) { toast('请填写答案', 'error'); return; } }
  else { const letters = answerRaw.match(/[A-Da-d]/g); if (!letters) { toast('选择题答案填字母', 'error'); return; } answerKeys = [...new Set(letters.map(l => l.toUpperCase()))]; answerText = [answerKeys.join('')]; }
  const body = { type, question, options, answerKeys, answerText, analysis, topic, score };
  try {
    if (qid) { await api(`/banks/${bankId}/questions/${qid}`, { method: 'PUT', body: JSON.stringify(body) }); toast('题目已更新', 'success'); }
    else { await api(`/banks/${bankId}/questions`, { method: 'POST', body: JSON.stringify(body) }); toast('题目已添加', 'success'); }
    closeModal(); viewBankQuestions(bankId); await loadData();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteQuestion(qid) {
  showModal('确认删除', '<p>确定删除此题目？</p>', `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-danger" onclick="QM.doDeleteQuestion(${qid})">删除</button>`);
}

async function doDeleteQuestion(qid) {
  const bankId = window._viewingBankId;
  try { await api(`/banks/${bankId}/questions/${qid}`, { method: 'DELETE' }); toast('题目已删除', 'success'); closeModal(); viewBankQuestions(bankId); await loadData(); }
  catch (e) { toast(e.message, 'error'); }
}

// ===== Import (Teacher) =====
const TXT_TEMPLATE = `【题库导入模板 - TXT 格式】

说明：
- 题号用 "数字." 或 "数字、" 标记，如 1. 或 1、
- 选项用 A. B. C. D. 标记
- 答案行用 "答案：" 或 "【答案】" 标记
- 解析行用 "解析：" 或 "【解析】" 标记
- 可按题型分段（单选题、多选题、判断题、填空题）
- 各题之间用空行分隔

===== 模板开始 =====

单选题：
1. 中国的首都是哪里？
A. 上海
B. 北京
C. 广州
D. 深圳
答案：B
解析：北京是中华人民共和国的首都。

多选题：
2. 以下哪些是中国的直辖市？
A. 北京
B. 天津
C. 成都
D. 重庆
答案：ABD
解析：中国四个直辖市为北京、天津、上海、重庆。

判断题：
3. 光年是时间单位。
A. 正确
B. 错误
答案：B
解析：光年是距离单位。

填空题：
4. 中华人民共和国成立于____年。
答案：1949
解析：1949年10月1日成立。

===== 模板结束 =====`;

const JSON_TEMPLATE = `[
  {
    "type": "single",
    "question": "中国的首都是哪里？",
    "options": [
      { "key": "A", "text": "上海" },
      { "key": "B", "text": "北京" }
    ],
    "answerKeys": ["B"],
    "answerText": ["B"],
    "analysis": "北京是中华人民共和国的首都。",
    "topic": "常识",
    "score": 1
  },
  {
    "type": "multi",
    "question": "以下哪些是直辖市？",
    "options": [
      { "key": "A", "text": "北京" },
      { "key": "B", "text": "天津" },
      { "key": "C", "text": "成都" },
      { "key": "D", "text": "重庆" }
    ],
    "answerKeys": ["A", "B", "D"],
    "answerText": ["ABD"],
    "analysis": "北京、天津、上海、重庆。",
    "score": 1
  },
  {
    "type": "judge",
    "question": "光年是时间单位。",
    "options": [
      { "key": "A", "text": "正确" },
      { "key": "B", "text": "错误" }
    ],
    "answerKeys": ["B"],
    "answerText": ["错误"],
    "analysis": "光年是距离单位。",
    "score": 1
  },
  {
    "type": "blank",
    "question": "中华人民共和国成立于____年。",
    "options": [],
    "answerKeys": [],
    "answerText": ["1949"],
    "analysis": "1949年10月1日。",
    "score": 1
  }
]`;

function renderImport() {
  const el = $('view-import');
  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">导入模板</span>
        <div class="flex gap-2">
          <button class="btn btn-outline btn-sm" onclick="QM.copyTemplate('txt')">复制 TXT 模板</button>
          <button class="btn btn-outline btn-sm" onclick="QM.copyTemplate('json')">复制 JSON 模板</button>
        </div>
      </div>
      <p class="text-sm text-sec mb-3">把模板发给大模型，让它按格式整理题库，然后粘贴到下方解析导入。导入时需选择题库（需先在课程管理中创建好课程→分组→题库）。</p>
      <div class="import-tabs">
        <button class="import-tab active" data-tab="file">文件导入</button>
        <button class="import-tab" data-tab="text">文本粘贴</button>
        <button class="import-tab" data-tab="json">JSON 导入</button>
        <button class="import-tab" data-tab="template">查看模板</button>
      </div>
      <div id="import-file" style="display:block;">
        <div class="import-zone" id="import-zone">
          <div class="import-zone-icon">\uD83D\uDCC4</div>
          <div class="import-zone-text">点击或拖拽文件到此处</div>
          <div class="import-zone-hint">支持 .txt / .json 格式</div>
        </div>
        <input type="file" id="import-file-input" accept=".txt,.json,.csv" style="display:none">
        <div id="import-file-preview" class="mt-4"></div>
      </div>
      <div id="import-text" style="display:none;">
        <div class="form-group"><label class="form-label">粘贴题目文本</label><textarea class="form-textarea" id="import-textarea" rows="14" placeholder="1. 中国的首都是哪里？\nA. 上海\nB. 北京\nC. 广州\nD. 深圳\n答案：B\n解析：北京是首都。\n\n2. ..."></textarea></div>
        <button class="btn btn-primary" onclick="QM.parseTextImport()">解析题目</button>
        <div id="import-text-preview" class="mt-4"></div>
      </div>
      <div id="import-json" style="display:none;">
        <div class="form-group"><label class="form-label">粘贴 JSON 数组</label><textarea class="form-textarea" id="import-json-area" rows="14" placeholder='[{"type":"single","question":"题目","options":[{"key":"A","text":"选项"}],"answerKeys":["A"]}]'></textarea></div>
        <button class="btn btn-primary" onclick="QM.parseJSONImport()">解析 JSON</button>
        <div id="import-json-preview" class="mt-4"></div>
      </div>
      <div id="import-template" style="display:none;">
        <div class="form-group"><label class="form-label">TXT 模板</label><div class="flex gap-2 mb-2"><button class="btn btn-outline btn-sm" onclick="QM.copyTemplate('txt')">复制到剪贴板</button><button class="btn btn-outline btn-sm" onclick="QM.fillTemplate('text')">填入文本粘贴框</button></div><textarea class="form-textarea" rows="16" readonly style="background:#f9fafb;">${esc(TXT_TEMPLATE)}</textarea></div>
        <div class="form-group mt-4"><label class="form-label">JSON 模板</label><div class="flex gap-2 mb-2"><button class="btn btn-outline btn-sm" onclick="QM.copyTemplate('json')">复制到剪贴板</button><button class="btn btn-outline btn-sm" onclick="QM.fillTemplate('json')">填入 JSON 框</button></div><textarea class="form-textarea" rows="20" readonly style="background:#f9fafb;">${esc(JSON_TEMPLATE)}</textarea></div>
      </div>
    </div>
  `;
  el.querySelectorAll('.import-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      el.querySelectorAll('.import-tab').forEach(t => { t.classList.remove('active'); t.style.borderBottomColor = 'transparent'; });
      tab.classList.add('active'); tab.style.borderBottomColor = 'var(--primary)';
      ['file','text','json','template'].forEach(p => { $('import-'+p).style.display = 'none'; });
      $('import-' + tab.dataset.tab).style.display = 'block';
    });
  });
  const zone = $('import-zone'), fi = $('import-file-input');
  zone.addEventListener('click', () => fi.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
  fi.addEventListener('change', () => { if (fi.files[0]) handleFile(fi.files[0]); });
}

function copyTemplate(type) {
  const text = type === 'json' ? JSON_TEMPLATE : TXT_TEMPLATE;
  navigator.clipboard.writeText(text).then(() => toast('模板已复制', 'success')).catch(() => {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('模板已复制', 'success'); } catch { toast('复制失败', 'error'); }
    document.body.removeChild(ta);
  });
}

function fillTemplate(type) {
  if (type === 'json') $('import-json-area').value = JSON_TEMPLATE; else $('import-textarea').value = TXT_TEMPLATE;
  toast('模板已填入', 'success');
}

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => { const text = e.target.result; const qs = file.name.endsWith('.json') ? parseJSON(text) : parseText(text); showPreview(qs, file.name, 'import-file-preview'); };
  reader.readAsText(file);
}

function parseTextImport() { const text = $('import-textarea').value; if (!text.trim()) { toast('请输入文本', 'error'); return; } showPreview(parseText(text), '文本', 'import-text-preview'); }
function parseJSONImport() { const text = $('import-json-area').value; if (!text.trim()) { toast('请输入 JSON', 'error'); return; } showPreview(parseJSON(text), 'JSON', 'import-json-preview'); }

let pendingQuestions = [];

function showPreview(qs, source, targetId) {
  pendingQuestions = qs;
  const target = $(targetId);
  if (qs.length === 0) { target.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\uD83D\uDE13</div><div class="empty-state-text">未能解析出题目</div></div>`; return; }
  const valid = qs.filter(q => q.answerKeys?.length > 0 || q.answerText?.length > 0).length;
  target.innerHTML = `
    <div class="card" style="background:#fafbfc;">
      <div class="flex items-center justify-between mb-3">
        <div><span style="font-weight:600;font-size:14px;">解析结果</span><span class="text-sm text-sec" style="margin-left:8px;">共 ${qs.length} 题（有效 ${valid} 题）</span></div>
        <button class="btn btn-primary btn-sm" onclick="QM.importToBank()">选择题库导入</button>
      </div>
      <div style="max-height:400px;overflow-y:auto;">
        <table class="preview-table"><thead><tr><th style="width:40px">#</th><th style="width:60px">类型</th><th>题目</th><th style="width:80px">答案</th><th style="width:60px">状态</th></tr></thead><tbody>
          ${qs.slice(0, 100).map((q, i) => `<tr><td>${i+1}</td><td><span class="badge ${TYPE_BADGE[q.type]||'badge-single'}">${TYPE_LABELS[q.type]||q.type}</span></td><td class="truncate" style="max-width:400px;">${esc(q.question.slice(0,60))}</td><td class="text-sm">${esc(q.answerKeys?.join(',')||q.answerText?.join(',')||'-')}</td><td>${q.answerKeys?.length>0||q.answerText?.length>0?'<span class="badge badge-ok">有效</span>':'<span class="badge badge-err">缺答案</span>'}</td></tr>`).join('')}
        </tbody></table>
      </div>
    </div>`;
}

// 导入到题库：选课程→分组→题库
async function importToBank() {
  if (pendingQuestions.length === 0) { toast('没有题目', 'error'); return; }
  try {
    const data = await api('/courses');
    courses = data.courses || [];
    if (courses.length === 0) {
      toast('请先创建课程和题库', 'error');
      switchView('courses');
      return;
    }
    // Build a hierarchical select: course > group > bank
    let bankOptions = banks.map(b => `<option value="${b.id}">${esc(b.course_name)} / ${esc(b.group_name)} / ${esc(b.name)} (${b.qcount}题)</option>`).join('');
    showModal('选择目标题库', `
      <div class="form-group"><label class="form-label">选择题库</label><select class="form-select" id="import-target-bank"><option value="">— 请选择题库 —</option>${bankOptions}</select></div>
      <p class="text-sm text-sec">如需新建题库，请到课程管理页面创建。</p>
    `, `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-primary" onclick="QM.doImportToBank()">导入</button>`);
  } catch (e) { toast(e.message, 'error'); }
}

async function doImportToBank() {
  const bankId = parseInt($('import-target-bank').value);
  if (!bankId) { toast('请选择题库', 'error'); return; }
  try {
    const res = await api(`/banks/${bankId}/import`, { method: 'POST', body: JSON.stringify({ questions: pendingQuestions }) });
    toast(`成功导入 ${res.imported} 题`, 'success');
    closeModal(); await loadData(); pendingQuestions = [];
    // Clear preview
    ['import-file-preview','import-text-preview','import-json-preview'].forEach(id => { const el = $(id); if (el) el.innerHTML = ''; });
  } catch (e) { toast(e.message, 'error'); }
}

// ===== Question Parser =====
function parseText(text) {
  if (!text || !text.trim()) return [];
  text = text.replace(/\uFEFF/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return splitBlocks(text).map(b => parseBlock(b.text, b.type)).filter(Boolean);
}

function splitBlocks(text) {
  const blocks = [], typeSections = [];
  const typeRe = /(?:^|\n)\s*(?:[一二三四五六七八九十]+[、.．]\s*)?(单选题|多选题|判断题|填空题|选择题|单项选择|多项选择|判断|填空)\s*[：:.\n]/gi;
  let m;
  while ((m = typeRe.exec(text)) !== null) typeSections.push({ index: m.index, type: mapType(m[1]) });
  const qRe = /(?:^|\n)\s*(?:第\s*)?(\d+)\s*[.、)）:：]\s*/g;
  const qPos = [];
  while ((m = qRe.exec(text)) !== null) qPos.push(m.index);
  if (qPos.length === 0) { text.split('\n').filter(l => l.trim()).forEach(l => { if (/[A-D][.、)）]/.test(l) || /答案/.test(l) || l.length > 20) blocks.push({ text: l.trim(), type: null }); }); if (blocks.length === 0 && text.trim().length > 10) blocks.push({ text: text.trim(), type: null }); return blocks; }
  for (let i = 0; i < qPos.length; i++) {
    const end = i + 1 < qPos.length ? qPos[i+1] : text.length;
    let bt = text.substring(qPos[i], end).trim().replace(/^\s*(?:第\s*)?\d+\s*[.、)）:：]\s*/, '');
    let type = null;
    for (let s = typeSections.length - 1; s >= 0; s--) { if (typeSections[s].index <= qPos[i]) { type = typeSections[s].type; break; } }
    if (bt.trim().length > 2) blocks.push({ text: bt.trim(), type });
  }
  return blocks;
}

function mapType(r) { r = r.trim(); if (/单选|单项选择/.test(r)) return 'single'; if (/多选|多项选择/.test(r)) return 'multi'; if (/判断/.test(r)) return 'judge'; if (/填空/.test(r)) return 'blank'; return null; }

function parseBlock(text, dt) {
  const q = { type: dt || 'single', question: '', options: [], answerKeys: [], answerText: [], analysis: '', topic: '', score: 1 };
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  let oL = [], aL = [], anL = [], qL = []; let inA = false, inAn = false;
  for (const l of lines) {
    if (/^(?:【)?\s*(?:答案|参考答案|正确答案|解答)\s*[】：:]/i.test(l)) { inA = true; inAn = false; aL.push(l.replace(/^(?:【)?\s*(?:答案|参考答案|正确答案|解答)\s*[】：:]/i, '').trim()); continue; }
    if (/^(?:【)?\s*(?:解析|答案解析|分析|说明)\s*[】：:]/i.test(l)) { inAn = true; inA = false; anL.push(l.replace(/^(?:【)?\s*(?:解析|答案解析|分析|说明)\s*[】：:]/i, '').trim()); continue; }
    if (/^[A-Da-d]\s*[.、)）:：]/.test(l) || /^[（(]\s*[A-Da-d]\s*[)）]/.test(l)) { if (!inA && !inAn) { oL.push(l); continue; } }
    if (inA) { aL.push(l); continue; } if (inAn) { anL.push(l); continue; } qL.push(l);
  }
  q.question = qL.join('\n'); if (!q.question) return null;
  const oR = /^[A-Da-d]\s*[.、)）:：]\s*/, oR2 = /^[（(]\s*([A-Da-d])\s*[)）]\s*/;
  for (const l of oL) { let k, t; const m2 = l.match(oR2); if (m2) { k = m2[1].toUpperCase(); t = l.substring(m2[0].length).trim(); } else { const m1 = l.match(oR); if (m1) { k = l[0].toUpperCase(); t = l.substring(m1[0].length).trim(); } else continue; } q.options.push({ key: k, text: t }); }
  const aS = aL.join(' ').trim();
  if (aS) { q.answerKeys = parseAns(aS, q.options); q.answerText = [aS]; }
  q.analysis = anL.join('\n').trim();
  if (!dt) q.type = detectType(q, aS);
  if (!q.question || q.question.length < 2) return null;
  if (q.type !== 'blank' && q.type !== 'judge' && q.options.length < 2) return null;
  return q;
}

function parseAns(str, opts) {
  str = str.trim();
  const ls = str.match(/[A-Da-d]/g);
  if (ls && ls.length) { const r = str.match(/([A-Da-d])\s*[-~到至]\s*([A-Da-d])/); if (r) { const s = r[1].toUpperCase().charCodeAt(0), e = r[2].toUpperCase().charCodeAt(0); const ks = []; for (let c = s; c <= e; c++) ks.push(String.fromCharCode(c)); return ks; } return [...new Set(ls.map(l => l.toUpperCase()))]; }
  if (/对|正确|true|√|yes/i.test(str)) return ['正确'];
  if (/错|错误|false|×|no/i.test(str)) return ['错误'];
  return str ? [str] : [];
}

function detectType(q, ans) {
  if (q.options.length === 2) { const t = q.options.map(o => o.text).join(''); if (/对|错|正确|错误|true|false|√|×/i.test(t)) return 'judge'; }
  if (q.options.length <= 2 && !ans) return 'judge';
  if (ans) { const ls = ans.match(/[A-Da-d]/g); if (ls && ls.length > 1) return 'multi'; if (/对|错|正确|错误|true|false|√|×/i.test(ans)) return 'judge'; }
  if (q.options.length >= 2) return 'single';
  return 'blank';
}

function parseJSON(text) {
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data.map((item, i) => ({
      type: item.type || (item.options?.length > 0 ? (item.answerKeys?.length > 1 ? 'multi' : 'single') : 'blank'),
      number: item.number || i + 1, question: item.question || item.stem || '',
      options: (item.options || []).map((o, j) => typeof o === 'string' ? { key: String.fromCharCode(65+j), text: o } : o),
      answerKeys: item.answerKeys || item.answer || [], answerText: item.answerText || item.answer || [],
      analysis: item.analysis || item.explanation || '', topic: item.topic || '', score: item.score || 1
    })).filter(q => q.question);
  } catch (e) { toast('JSON 解析失败', 'error'); }
  return [];
}

// ===== Student Management (Teacher) =====
async function renderStudents() {
  const el = $('view-students');
  try {
    const data = await api('/students');
    const students = data.students || [];
    el.innerHTML = `
      <div class="flex items-center justify-between mb-4"><span class="text-sm text-sec">${students.length} 名学员</span><button class="btn btn-primary btn-sm" onclick="QM.createStudent()">+ 添加学员</button></div>
      ${students.length === 0 ? `<div class="empty-state"><div class="empty-state-icon">\uD83D\uDC65</div><div class="empty-state-text">暂无学员</div><div class="empty-state-hint">添加学员后，他们可用学员账号登录答题</div></div>` : students.map(s => `<div class="bank-item"><div class="bank-item-info"><div class="bank-item-name">${esc(s.display_name || s.username)} <span class="badge badge-student">${esc(s.username)}</span></div><div class="bank-item-meta">创建于 ${formatDate(s.created_at)}</div></div><div class="bank-item-actions"><button class="btn btn-outline btn-sm" onclick="QM.manageStudentCourses(${s.id})" title="课程绑定">\uD83D\uDCDA 绑定课程</button><button class="btn btn-ghost btn-sm" onclick="QM.viewStudentRecords(${s.id})" title="查看记录">\uD83D\uDCCA</button><button class="btn btn-ghost btn-sm" onclick="QM.deleteStudent(${s.id})" title="删除" style="color:var(--danger);">\uD83D\uDDD1</button></div></div>`).join('')}`;
  } catch (e) { toast(e.message, 'error'); }
}

function createStudent() {
  showModal('添加学员', `
    <div class="form-group"><label class="form-label">用户名</label><input class="form-input" id="stu-username" placeholder="学员登录用户名"></div>
    <div class="form-group"><label class="form-label">密码</label><input class="form-input" id="stu-password" type="password" placeholder="学员登录密码"></div>
    <div class="form-group"><label class="form-label">显示名称（可选）</label><input class="form-input" id="stu-displayname" placeholder="如：张三"></div>
  `, `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-primary" onclick="QM.doCreateStudent()">创建</button>`);
}

async function doCreateStudent() {
  const username = $('stu-username').value.trim(), password = $('stu-password').value.trim(), displayName = $('stu-displayname').value.trim();
  if (!username || !password) { toast('用户名和密码不能为空', 'error'); return; }
  try { await api('/students', { method: 'POST', body: JSON.stringify({ username, password, displayName }) }); closeModal(); toast('学员创建成功', 'success'); renderStudents(); }
  catch (e) { toast(e.message, 'error'); }
}

async function deleteStudent(id) { showModal('确认删除', '<p>删除学员将同时删除其所有记录和错题数据。</p>', `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-danger" onclick="QM.doDeleteStudent(${id})">删除</button>`); }
async function doDeleteStudent(id) { try { await api(`/students/${id}`, { method: 'DELETE' }); closeModal(); toast('学员已删除', 'success'); renderStudents(); } catch (e) { toast(e.message, 'error'); } }
async function viewStudentRecords(id) {
  try {
    const data = await api(`/students/${id}/records`);
    const records = data.records || [];
    showModal('学员答题记录', records.length === 0 ? '<p>暂无记录</p>' : `<div style="max-height:400px;overflow-y:auto;">${records.map(r => `<div class="record-item"><div class="record-icon ${r.mode==='练习'?'practice':'exam'}">${r.mode==='练习'?'\u270E':'\uD83D\uDCDD'}</div><div class="record-info"><div class="record-title">${esc(r.name||r.mode)} · ${esc(r.bank_name||'-')}</div><div class="record-meta">${r.mode} · ${r.correct}/${r.total} · ${formatDuration(r.duration)} · ${formatDate(r.date)}</div></div><div class="record-score ${r.score>=80?'high':r.score<60?'low':''}">${r.score}分</div></div>`).join('')}</div>`, `<button class="btn btn-primary" onclick="QM.closeModal()">关闭</button>`);
  } catch (e) { toast(e.message, 'error'); }
}

// 学员课程绑定管理
async function manageStudentCourses(studentId) {
  try {
    const [coursesRes, bindingsRes] = await Promise.all([api('/courses'), api(`/students/${studentId}/courses`)]);
    const allCourses = coursesRes.courses || [];
    const boundIds = (bindingsRes.bindings || []).map(b => b.course_id);

    if (allCourses.length === 0) {
      showModal('绑定课程', '<p>暂无课程，请先创建课程。</p>', `<button class="btn btn-primary" onclick="QM.closeModal()">关闭</button>`);
      return;
    }

    const student = (await api('/students')).students.find(s => s.id === studentId);
    const studentName = student ? (student.display_name || student.username) : '学员';

    showModal(`${esc(studentName)} - 课程绑定`, `
      <p class="text-sm text-sec mb-3">勾选学员可访问的课程，只有绑定的课程其题库才会对学员可见。</p>
      <div class="form-group">
        ${allCourses.map(c => `
          <label class="form-check" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
            <input type="checkbox" class="sc-check" value="${c.id}" ${boundIds.includes(c.id) ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--primary);">
            <div>
              <span style="font-weight:500;">${esc(c.name)}</span>
              <span class="text-sm text-sec" style="margin-left:8px;">${c.group_count || 0}分组 · ${c.bank_count || 0}题库 · ${c.qcount || 0}题</span>
            </div>
          </label>
        `).join('')}
      </div>
    `, `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-primary" onclick="QM.doManageStudentCourses(${studentId})">保存绑定</button>`);
  } catch (e) { toast(e.message, 'error'); }
}

async function doManageStudentCourses(studentId) {
  const checks = document.querySelectorAll('.sc-check');
  const courseIds = [...checks].filter(c => c.checked).map(c => parseInt(c.value));
  try {
    await api(`/students/${studentId}/courses`, { method: 'PUT', body: JSON.stringify({ courseIds }) });
    toast('课程绑定已更新', 'success');
    closeModal();
  } catch (e) { toast(e.message, 'error'); }
}

// ===== Practice Config (Student) =====
function renderPracticeConfig() {
  const el = $('view-practice');
  const bank = banks.find(b => b.id === activeBankId) || banks[0];
  if (!bank || bank.qcount === 0) { el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\u270E</div><div class="empty-state-text">暂无题目可练习</div></div>`; return; }
  el.innerHTML = `
    <div class="quiz-container"><div class="card">
      <div class="card-header"><span class="card-title">练习设置</span><span class="text-sm text-sec">${esc(bank.course_name||'')} / ${esc(bank.group_name||'')} / ${esc(bank.name)} · ${bank.qcount} 题</span></div>
      <div class="config-grid">
        <div><div class="config-section-title">出题顺序</div><div class="chip-group" id="p-order"><button class="chip active" data-value="sequential">顺序</button><button class="chip" data-value="random">随机</button></div></div>
        <div><div class="config-section-title">题目数量</div><div class="chip-group" id="p-count"><button class="chip" data-value="20">20题</button><button class="chip" data-value="50">50题</button><button class="chip active" data-value="all">全部</button></div></div>
      </div>
      <div class="mt-4 text-center"><button class="btn btn-primary btn-lg" onclick="QM.startPractice()">\u270E 开始练习</button></div>
    </div></div>`;
  el.querySelectorAll('.chip-group').forEach(g => g.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => { g.querySelectorAll('.chip').forEach(x => x.classList.remove('active')); c.classList.add('active'); })));
}

function chipVal(id) { return $(id)?.querySelector('.chip.active')?.dataset.value; }

async function startPractice() {
  const bank = banks.find(b => b.id === activeBankId) || banks[0];
  try {
    const data = await api(`/banks/${bank.id}/questions`);
    let qs = data.questions || [];
    const order = chipVal('p-order'), countStr = chipVal('p-count');
    if (order === 'random') shuffle(qs);
    qs = qs.slice(0, countStr === 'all' ? qs.length : Math.min(parseInt(countStr), qs.length));
    if (!qs.length) { toast('没有题目', 'error'); return; }
    quizSession = { mode: 'practice', bankId: bank.id, bankName: bank.name, questions: qs, currentIndex: 0, answers: {}, revealed: {}, submitted: new Set(), startTime: Date.now() };
    document.body.classList.add('focus-mode'); switchView('practice'); renderQuiz();
  } catch (e) { toast(e.message, 'error'); }
}

// ===== Exam Config (Student) =====
function renderExamConfig() {
  const el = $('view-exam');
  const bank = banks.find(b => b.id === activeBankId) || banks[0];
  if (!bank || bank.qcount === 0) { el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\uD83D\uDCDD</div><div class="empty-state-text">暂无题目</div></div>`; return; }
  el.innerHTML = `
    <div class="quiz-container"><div class="card">
      <div class="card-header"><span class="card-title">考试设置</span><span class="text-sm text-sec">${esc(bank.course_name||'')} / ${esc(bank.group_name||'')} / ${esc(bank.name)} · ${bank.qcount} 题</span></div>
      <div class="form-row"><div class="form-group"><label class="form-label">考试名称</label><input class="form-input" id="exam-name" value="模拟考试"></div><div class="form-group"><label class="form-label">题目数量</label><input class="form-input" id="exam-count" type="number" value="${Math.min(50, bank.qcount)}" min="1" max="${bank.qcount}"></div></div>
      <div class="form-row"><div class="form-group"><label class="form-label">时长（分钟）</label><input class="form-input" id="exam-time" type="number" value="60" min="1"></div><div class="form-group"><label class="form-label">及格线</label><input class="form-input" id="exam-pass" type="number" value="60" min="0" max="100"></div></div>
      <div class="mt-4 text-center"><button class="btn btn-primary btn-lg" onclick="QM.startExam()">\uD83D\uDCDD 开始考试</button></div>
    </div></div>`;
}

async function startExam() {
  const bank = banks.find(b => b.id === activeBankId) || banks[0];
  const name = $('exam-name').value.trim(), count = parseInt($('exam-count').value), timeMin = parseInt($('exam-time').value), pass = parseInt($('exam-pass').value);
  try {
    const data = await api(`/banks/${bank.id}/questions`);
    let qs = data.questions || []; shuffle(qs); qs = qs.slice(0, Math.min(count, qs.length));
    if (!qs.length) { toast('没有题目', 'error'); return; }
    quizSession = { mode: 'exam', bankId: bank.id, bankName: bank.name, examName: name, questions: qs, currentIndex: 0, answers: {}, revealed: {}, submitted: new Set(), startTime: Date.now(), timeLimit: timeMin*60, passScore: pass };
    if (examTimer) clearInterval(examTimer); examTimer = setInterval(updateExamTimer, 1000);
    document.body.classList.add('focus-mode'); switchView('exam'); renderQuiz();
  } catch (e) { toast(e.message, 'error'); }
}

function updateExamTimer() {
  if (!quizSession || quizSession.mode !== 'exam') { clearInterval(examTimer); return; }
  const elapsed = Math.floor((Date.now() - quizSession.startTime) / 1000), remaining = quizSession.timeLimit - elapsed;
  const el = $('exam-timer'); if (!el) return;
  if (remaining <= 0) { clearInterval(examTimer); el.textContent = '00:00'; el.classList.add('warning'); submitExam(); return; }
  el.textContent = `${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
  if (remaining <= 60) el.classList.add('warning');
}

// ===== Quiz Rendering =====
function renderQuiz() {
  if (!quizSession) return;
  const { questions, currentIndex, mode, answers, revealed } = quizSession;
  const q = questions[currentIndex], ans = answers[currentIndex], isRev = revealed[currentIndex];
  const isSubmitted = quizSession.submitted?.has(currentIndex);
  const el = $('view-' + mode);
  // Stats: only count submitted/revealed answers
  const evaluated = [...(quizSession.submitted || new Set()), ...Object.keys(revealed).map(Number)];
  const tAns = evaluated.length;
  const tCor = evaluated.filter(i => answers[i]?.correct).length;
  const tWrg = tAns - tCor;

  // Option display logic
  function optionClass(opt) {
    let cls = 'option-item';
    if (ans?.keys?.includes(opt.key)) {
      if (isSubmitted || isRev) {
        // After submit: show correct/wrong
        cls += ans.correct ? ' correct' : ' wrong';
      } else {
        // Before submit: just selected
        cls += ' selected';
      }
    } else if ((isSubmitted || isRev) && q.answer_keys?.includes(opt.key)) {
      // Show the correct answer in feedback
      cls += ' revealed';
    }
    return cls;
  }

  // Feedback only shows after submit or reveal
  const showFeedback = isSubmitted || isRev;

  el.innerHTML = `<div class="quiz-container">
    <div class="quiz-header"><div class="quiz-progress">第 ${currentIndex+1} / ${questions.length} 题</div><div class="flex gap-2">${mode==='exam'?`<div class="quiz-timer" id="exam-timer">--:--</div>`:''}<button class="btn btn-ghost btn-sm" onclick="QM.exitQuiz()">\u2715</button></div></div>
    <div class="question-card"><div class="question-number"><span>${TYPE_LABELS[q.type]||q.type}</span><span class="text-sm text-sec">第 ${q.number||currentIndex+1} 题</span></div><div class="question-text">${esc(q.question)}</div>
    ${q.type === 'blank' ? `<div class="form-group mt-3"><input class="form-input ${(isSubmitted||isRev)?(ans?.correct?'':'wrong'):''}" style="font-size:14px;" placeholder="请输入答案" value="${esc(ans?.text||'')}" ${(isSubmitted||isRev)?'readonly':''} oninput="QM.fillBlank(${currentIndex}, this.value)"></div>` : `<div class="options-list">${q.options.map(opt => `<div class="${optionClass(opt)}" onclick="${(isSubmitted||isRev)?'':`QM.selectOption(${currentIndex}, '${opt.key}')`}"><div class="option-key">${opt.key}</div><div class="option-text">${esc(opt.text)}</div></div>`).join('')}</div>`}
    ${showFeedback ? `<div class="feedback show ${ans?.correct?'correct':isRev?'revealed':'wrong'}"><div class="feedback-label">${ans?.correct?'\u2714 回答正确':isRev?'\u2728 已显示答案':'\u2718 回答错误'}</div><div>正确答案：${esc(q.answer_keys?.join(', ')||q.answer_text?.join(', '))}</div>${q.analysis?`<div class="feedback-analysis"><strong>解析：</strong>${esc(q.analysis)}</div>`:''}</div>` : ''}
    </div>
    <div class="quiz-controls"><div class="quiz-nav-btns"><button class="btn btn-outline" onclick="QM.prevQ()" ${currentIndex===0?'disabled':''}>上一题</button><button class="btn btn-outline" onclick="QM.nextQ()" ${currentIndex===questions.length-1?'disabled':''}>下一题</button></div><div class="flex gap-2">
      ${mode==='practice' && !showFeedback && !ans ? `<button class="btn btn-ghost" onclick="QM.revealAns(${currentIndex})">显示答案</button>` : ''}
      ${mode==='practice' && !showFeedback && ans ? `<button class="btn btn-primary" onclick="QM.submitAns()">提交答案</button>` : ''}
      ${mode==='exam' ? `<button class="btn btn-primary" onclick="QM.submitExam()">交卷</button>` : ''}
    </div></div>
    <div class="stats-bar"><div class="stats-bar-item"><div class="stats-bar-dot blue"></div> 已答 ${tAns}</div><div class="stats-bar-item"><div class="stats-bar-dot green"></div> 正确 ${tCor}</div><div class="stats-bar-item"><div class="stats-bar-dot red"></div> 错误 ${tWrg}</div><div class="stats-bar-item"><div class="stats-bar-dot gray"></div> 剩余 ${questions.length-tAns}</div></div>
    <div class="answer-card"><div class="answer-card-title">答题卡</div><div class="answer-grid">${Array.from({length: questions.length}, (_, i) => { let c = 'answer-btn'; const iSub = quizSession.submitted?.has(i); const iRev = revealed[i]; if (i===currentIndex) c+=' current'; else if (iSub||iRev) c += answers[i]?.correct ? ' correct-card' : ' wrong-card'; else if (answers[i]) c += ' answered'; return `<button class="${c}" onclick="QM.goTo(${i})">${i+1}</button>`; }).join('')}</div></div>
  </div>`;
  if (mode === 'exam') updateExamTimer();
}

function selectOption(idx, key) {
  if (!quizSession) return;
  const q = quizSession.questions[idx]; if (!q) return;
  // Don't evaluate in practice mode - just track selections
  if (q.type === 'multi') {
    const ex = quizSession.answers[idx]?.keys || [];
    const i = ex.indexOf(key);
    if (i >= 0) ex.splice(i, 1); else ex.push(key);
    quizSession.answers[idx] = { keys: [...ex], correct: false };
  } else {
    quizSession.answers[idx] = { keys: [key], correct: false };
  }
  renderQuiz();
}

function fillBlank(idx, val) {
  if (!quizSession) return;
  const wasEmpty = !quizSession.answers[idx]?.text;
  quizSession.answers[idx] = quizSession.answers[idx] || { keys: [], correct: false };
  quizSession.answers[idx].text = val;
  // Re-render only when button visibility changes (empty <-> non-empty)
  const isEmpty = !val.trim();
  if (wasEmpty !== isEmpty) {
    renderQuiz();
    // Restore focus to input after re-render
    const input = document.querySelector('.question-card input');
    if (input) { input.focus(); input.setSelectionRange(val.length, val.length); }
  }
}

function submitAns() {
  if (!quizSession) return;
  const idx = quizSession.currentIndex, q = quizSession.questions[idx], a = quizSession.answers[idx];
  if (!a) { toast('请先选择答案', 'error'); return; }
  // Evaluate and show feedback
  a.correct = checkAns(q, a);
  quizSession.submitted = quizSession.submitted || new Set();
  quizSession.submitted.add(idx);
  renderQuiz();
}

function revealAns(idx) {
  if (!quizSession) return;
  quizSession.revealed[idx] = true;
  quizSession.submitted = quizSession.submitted || new Set();
  quizSession.submitted.add(idx);
  renderQuiz();
}

function checkAns(q, a) {
  if (!a) return false;
  if (q.type === 'blank') { const t = (a.text||'').trim().toLowerCase(); return t && (q.answer_text?.some(x => x.trim().toLowerCase() === t) || q.answer_keys?.some(k => k.trim().toLowerCase() === t)); }
  if (q.type === 'judge') { const u = a.keys?.[0]||'', c = q.answer_keys?.[0]||''; const n = v => /对|正确|true|√/i.test(v) ? '正确' : /错|错误|false|×/i.test(v) ? '错误' : v; return n(u) === n(c); }
  return [...(a.keys||[])].sort().join('') === [...(q.answer_keys||[])].sort().join('');
}

function prevQ() { if (quizSession && quizSession.currentIndex > 0) { quizSession.currentIndex--; renderQuiz(); } }
function nextQ() { if (quizSession && quizSession.currentIndex < quizSession.questions.length - 1) { quizSession.currentIndex++; renderQuiz(); } }
function goTo(i) { if (quizSession) { quizSession.currentIndex = i; renderQuiz(); } }

function exitQuiz() {
  if (!quizSession) return;
  if (examTimer) { clearInterval(examTimer); examTimer = null; }
  if (quizSession.mode === 'practice' && Object.keys(quizSession.answers).length > 0) savePracticeRecord();
  quizSession = null; document.body.classList.remove('focus-mode');
  if (currentView === 'practice') renderPracticeConfig(); else renderExamConfig();
}

async function savePracticeRecord() {
  if (!quizSession) return;
  const submitted = quizSession.submitted || new Set();
  const answers = quizSession.answers;
  const total = submitted.size;
  let correct = 0;
  const wrongQs = [], correctQs = [];
  const details = [];
  for (const idx of submitted) {
    const a = answers[idx]; if (!a) continue;
    const qid = quizSession.questions[idx].id;
    if (a.correct) { correct++; correctQs.push(qid); } else wrongQs.push(qid);
    details.push({ questionId: qid, userAnswer: a.keys, correct: a.correct });
  }
  try { await api('/records', { method: 'POST', body: JSON.stringify({ bankId: quizSession.bankId, mode: '练习', name: '刷题练习', total, correct, score: total > 0 ? Math.round(correct/total*100) : 0, duration: Math.floor((Date.now()-quizSession.startTime)/1000), details, wrongQuestions: wrongQs, correctQuestions: correctQs }) }); } catch {}
}

async function submitExam() {
  if (!quizSession || quizSession.mode !== 'exam') return;
  if (examTimer) { clearInterval(examTimer); examTimer = null; }
  const answers = quizSession.answers, questions = quizSession.questions, total = questions.length;
  let correct = 0; const wrongQs = [], correctQs = [], details = [];
  for (let i = 0; i < total; i++) { const q = questions[i], a = answers[i]; let ok = false; if (a) { ok = checkAns(q, a); a.correct = ok; } if (ok) { correct++; correctQs.push(q.id); } else wrongQs.push(q.id); details.push({ questionId: q.id, userAnswer: a?.keys || [], correct: ok }); }
  const score = Math.round(correct/total*100), passed = score >= quizSession.passScore, duration = Math.floor((Date.now()-quizSession.startTime)/1000);
  try { await api('/records', { method: 'POST', body: JSON.stringify({ bankId: quizSession.bankId, mode: '考试', name: quizSession.examName, total, correct, score, duration, details, wrongQuestions: wrongQs, correctQuestions: correctQs }) }); } catch {}
  const el = $('view-exam');
  el.innerHTML = `<div class="quiz-container"><div class="card"><div class="exam-result"><div class="exam-result-label">${esc(quizSession.examName)}</div><div class="exam-result-score ${passed?'pass':'fail'}">${score}</div><div class="exam-result-label">${passed?'\uD83C\uDF89 恭喜通过！':'\uD83D\uDE22 继续加油'}</div><div class="exam-result-details"><div class="exam-result-detail"><div class="exam-result-detail-value">${total}</div><div class="exam-result-detail-label">总题数</div></div><div class="exam-result-detail"><div class="exam-result-detail-value" style="color:var(--success)">${correct}</div><div class="exam-result-detail-label">正确</div></div><div class="exam-result-detail"><div class="exam-result-detail-value" style="color:var(--danger)">${total-correct}</div><div class="exam-result-detail-label">错误</div></div><div class="exam-result-detail"><div class="exam-result-detail-value">${formatDuration(duration)}</div><div class="exam-result-detail-label">用时</div></div></div></div></div><div class="card"><div class="card-header"><span class="card-title">答题详情</span></div>${questions.map((q, i) => { const a = answers[i], ok = a?.correct || false; return `<div class="bank-item" style="border-left:3px solid ${ok?'var(--success)':'var(--danger)'};display:block;"><div class="flex items-center justify-between mb-2"><span class="badge ${TYPE_BADGE[q.type]}">${TYPE_LABELS[q.type]}</span><span class="badge ${ok?'badge-ok':'badge-err'}">${ok?'正确':'错误'}</span></div><div class="question-text" style="font-size:13px;">${i+1}. ${esc(q.question)}</div>${!ok?`<div class="text-sm" style="color:var(--success);">正确答案：${esc(q.answer_keys?.join(', ')||q.answer_text?.join(', '))}</div><div class="text-sm" style="color:var(--danger);">你的答案：${esc(a?.keys?.join(', ')||a?.text||'-')}</div>`:''}${q.analysis?`<div class="text-sm text-sec mt-2">解析：${esc(q.analysis)}</div>`:''}</div>`; }).join('')}</div><div style="text-align:center;margin-top:16px;"><button class="btn btn-primary" onclick="QM.exitQuiz()">返回</button></div></div>`;
  quizSession = null; document.body.classList.remove('focus-mode');
}

// ===== Wrong Book (Student) =====
async function renderWrongBook() {
  const el = $('view-wrongbook');
  try {
    const data = await api('/wrongbook');
    const entries = data.entries || [];
    if (!entries.length) { el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\uD83C\uDF89</div><div class="empty-state-text">暂无错题</div></div>`; return; }
    el.innerHTML = `<div class="flex items-center justify-between mb-4"><span class="text-sm text-sec">${entries.length} 道待复习</span><button class="btn btn-outline btn-sm" onclick="QM.clearMastered()">清除已掌握</button></div>${entries.map(e => `<div class="card"><div class="flex items-center justify-between mb-2"><div class="flex gap-2"><span class="badge ${TYPE_BADGE[e.type]}">${TYPE_LABELS[e.type]}</span><span class="badge ${e.status==='未掌握'?'badge-err':e.status==='复习中'?'badge-judge':'badge-ok'}">${e.status}</span></div><div class="text-sm text-sec">错${e.wrong_count}次 · 对${e.right_count}次</div></div><div class="question-text" style="font-size:13px;">${esc(e.question)}</div>${e.options?.length > 0 ? `<div class="text-sm text-sec">${e.options.map(o => o.key+'. '+o.text).join('  ')}</div>` : ''}<div class="text-sm mt-2" style="color:var(--success);">正确答案：${esc(e.answer_keys?.join(', ')||e.answer_text?.join(', '))}</div>${e.analysis ? `<div class="text-sm text-sec mt-2">解析：${esc(e.analysis)}</div>` : ''}</div>`).join('')}`;
  } catch (e) { toast(e.message, 'error'); }
}

async function clearMastered() { try { await api('/wrongbook/clear-mastered', { method: 'DELETE' }); toast('已清除', 'success'); renderWrongBook(); } catch (e) { toast(e.message, 'error'); } }

// ===== Records =====
async function renderRecords() {
  const el = $('view-records');
  try {
    let records;
    if (currentUser.role === 'teacher') { const data = await api('/students/records'); records = data.records || []; }
    else { const data = await api('/records'); records = data.records || []; }
    if (!records.length) { el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">\uD83D\uDCCA</div><div class="empty-state-text">暂无记录</div></div>`; return; }
    el.innerHTML = `<div class="flex items-center justify-between mb-4"><span class="text-sm text-sec">共 ${records.length} 条记录</span></div>${records.slice(0, 50).map(r => { const sc = r.score >= 80 ? 'high' : r.score < 60 ? 'low' : ''; return `<div class="record-item"><div class="record-icon ${r.mode==='练习'?'practice':'exam'}">${r.mode==='练习'?'\u270E':'\uD83D\uDCDD'}</div><div class="record-info"><div class="record-title">${esc(r.name||r.mode)} · ${esc(r.course_name||'')} / ${esc(r.bank_name||'-')}${r.username ? ' · ' + esc(r.display_name || r.username) : ''}</div><div class="record-meta">${r.mode} · ${r.correct}/${r.total} · ${formatDuration(r.duration)} · ${formatDate(r.date)}</div></div><div class="record-score ${sc}">${r.score}分</div></div>`; }).join('')}`;
  } catch (e) { toast(e.message, 'error'); }
}

// ===== Settings (Teacher) =====
async function renderSettings() {
  const el = $('view-settings');
  const bankCount = banks.length;
  const totalQ = banks.reduce((s, b) => s + (b.qcount || 0), 0);
  try {
    const [coursesRes, stuRes, keyRes] = await Promise.all([api('/courses'), api('/students'), api('/apikeys')]);
    courses = coursesRes.courses || [];
    const studentCount = (stuRes.students || []).length;
    const keys = keyRes.keys || [];

    el.innerHTML = `
      <div class="quiz-container">
        <div class="card">
          <div class="card-header"><span class="card-title">数据统计</span></div>
          <div class="stats-bar" style="background:transparent;padding:0;">
            <div class="stats-bar-item">${courses.length} 个课程</div>
            <div class="stats-bar-item">${bankCount} 个题库</div>
            <div class="stats-bar-item">${totalQ} 道题目</div>
            <div class="stats-bar-item">${studentCount} 名学员</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">API Key 管理</span><button class="btn btn-primary btn-sm" onclick="QM.createApiKey()">+ 生成新 Key</button></div>
          <p class="text-sm text-sec mb-3">API Key 用于大模型对接，无需登录即可通过接口导入题库、创建学员等。Key 格式以 <code>mq_</code> 开头。</p>
          ${keys.length === 0 ? '<p class="text-sm text-sec">暂无 API Key，点击上方按钮生成。</p>' : `
          <table class="preview-table"><thead><tr><th>Key</th><th>标签</th><th>创建时间</th><th>最近使用</th><th>状态</th><th>操作</th></tr></thead><tbody>
            ${keys.map(k => `<tr>
              <td class="text-sm" style="font-family:monospace;max-width:200px;" title="${esc(k.key_id)}">${esc(k.key_id.slice(0,20))}...</td>
              <td class="text-sm">${esc(k.label || '-')}</td>
              <td class="text-sm">${formatDate(k.created_at)}</td>
              <td class="text-sm">${formatDate(k.last_used_at)}</td>
              <td>${k.is_active ? '<span class="badge badge-ok">活跃</span>' : '<span class="badge badge-err">停用</span>'}</td>
              <td><button class="btn btn-ghost btn-sm" onclick="QM.copyApiKey('${esc(k.key_id)}')" title="复制">复制</button> <button class="btn btn-ghost btn-sm" onclick="QM.deleteApiKey('${esc(k.key_id)}')" title="删除" style="color:var(--danger);">删除</button></td>
            </tr>`).join('')}
          </tbody></table>`}
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">LLM 接口说明</span></div>
          <p class="text-sm text-sec mb-2">大模型可通过以下接口操作 MyQuiz 系统（使用 API Key 认证）：</p>
          <table class="preview-table"><thead><tr><th>方法</th><th>路径</th><th>功能</th></tr></thead><tbody>
            <tr><td><span class="badge badge-single">GET</span></td><td class="text-sm" style="font-family:monospace;">/api/llm/status</td><td class="text-sm">查看课程/题库概览</td></tr>
            <tr><td><span class="badge badge-ok">POST</span></td><td class="text-sm" style="font-family:monospace;">/api/llm/import</td><td class="text-sm">导入题目（自动建课程/分组/题库）</td></tr>
            <tr><td><span class="badge badge-single">GET</span></td><td class="text-sm" style="font-family:monospace;">/api/llm/banks/:id/questions</td><td class="text-sm">查看题库题目</td></tr>
            <tr><td><span class="badge badge-ok">POST</span></td><td class="text-sm" style="font-family:monospace;">/api/llm/students</td><td class="text-sm">创建学员</td></tr>
            <tr><td><span class="badge badge-ok">PUT</span></td><td class="text-sm" style="font-family:monospace;">/api/llm/students/:id/courses</td><td class="text-sm">绑定学员课程</td></tr>
          </tbody></table>
          <p class="text-sm text-sec mt-2">认证方式：请求头 <code>Authorization: Bearer mq_xxxxx</code></p>
        </div>
      </div>
    `;
  } catch (e) { toast(e.message, 'error'); }
}

function createApiKey() {
  showModal('生成 API Key', `<div class="form-group"><label class="form-label">标签（可选）</label><input class="form-input" id="apikey-label" placeholder="如：LLM导入专用"></div>`, `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-primary" onclick="QM.doCreateApiKey()">生成</button>`);
}

async function doCreateApiKey() {
  const label = $('apikey-label').value.trim();
  try {
    const data = await api('/apikeys', { method: 'POST', body: JSON.stringify({ label }) });
    closeModal();
    showModal('API Key 已生成', `
      <p class="text-sm text-sec mb-2">请妥善保存以下 Key，它不会再次显示：</p>
      <div style="background:var(--bg);padding:12px;border-radius:8px;font-family:monospace;font-size:12px;word-break:break-all;">${esc(data.key)}</div>
      <p class="text-sm text-sec mt-2">使用方式：在请求头中携带 <code>Authorization: Bearer ${esc(data.key)}</code></p>
    `, `<button class="btn btn-primary" onclick="QM.copyApiKey('${esc(data.key)}')">复制 Key</button><button class="btn btn-outline" onclick="QM.closeModal()">关闭</button>`);
  } catch (e) { toast(e.message, 'error'); }
}

function copyApiKey(key) {
  navigator.clipboard.writeText(key).then(() => toast('已复制到剪贴板', 'success')).catch(() => {
    const ta = document.createElement('textarea'); ta.value = key; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('已复制', 'success'); } catch { toast('复制失败', 'error'); }
    document.body.removeChild(ta);
  });
}

async function deleteApiKey(key) {
  showModal('确认删除', '<p>删除后使用该 Key 的所有接口将无法访问，确定删除？</p>', `<button class="btn btn-outline" onclick="QM.closeModal()">取消</button><button class="btn btn-danger" onclick="QM.doDeleteApiKey('${esc(key)}')">删除</button>`);
}

async function doDeleteApiKey(key) {
  try { await api(`/apikeys/${key}`, { method: 'DELETE' }); closeModal(); toast('API Key 已删除', 'success'); renderSettings(); }
  catch (e) { toast(e.message, 'error'); }
}

// ===== Init =====
function init() {
  document.querySelectorAll('.login-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.login-tab').forEach(x => { x.classList.remove('active'); x.style.borderBottomColor = 'transparent'; });
      t.classList.add('active'); t.style.borderBottomColor = 'var(--primary)';
      $('login-form').style.display = t.dataset.tab === 'login' ? 'block' : 'none';
      $('register-form').style.display = t.dataset.tab === 'register' ? 'block' : 'none';
    });
  });
  $('login-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  $('reg-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') register(); });
  $('modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
  if (loadSession()) showApp(); else showLogin();
}

return {
  init, login, register, logout, switchView, closeModal, setActiveBank,
  createCourse, doCreateCourse, editCourse, doEditCourse, deleteCourse, doDeleteCourse,
  createGroup, doCreateGroup, renameGroup, doRenameGroup, deleteGroup, doDeleteGroup,
  createBankUnderGroup, doCreateBankUnderGroup, renameBank, doRenameBank, deleteBank, doDeleteBank,
  viewBankQuestions, addQuestion, editQuestion, doSaveQuestion, deleteQuestion, doDeleteQuestion,
  copyTemplate, fillTemplate, parseTextImport, parseJSONImport, importToBank, doImportToBank,
  createStudent, doCreateStudent, deleteStudent, doDeleteStudent, viewStudentRecords, manageStudentCourses, doManageStudentCourses,
  startPractice, startExam, selectOption, fillBlank, submitAns, revealAns,
  prevQ, nextQ, goTo, exitQuiz, submitExam, clearMastered,
  createApiKey, doCreateApiKey, copyApiKey, deleteApiKey, doDeleteApiKey
};

})();

document.addEventListener('DOMContentLoaded', QM.init);
