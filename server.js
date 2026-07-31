/**
 * server.js - MyQuiz 后端主服务
 * 层级：课程 → 分组（章节）→ 题库 → 题目
 * 教师管理课程体系，学员只能答题
 */
const express = require('express');
const path = require('path');
const { db, User, StudentCourse, Course, Group, Bank, Question, Record, WrongEntry } = require('./db');
const { hashPassword, verifyPassword, signToken, requireAuth, requireTeacher, requireStudent } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== 认证路由 =====

app.post('/api/auth/register', (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (username.length < 3) return res.status(400).json({ error: '用户名至少3个字符' });
  const existing = User.findByUsername.get(username);
  if (existing) return res.status(409).json({ error: '用户名已存在' });
  const hash = hashPassword(password);
  const info = User.create.run(username, hash, 'teacher', null, displayName || username);
  const user = User.findById.get(info.lastInsertRowid);
  const token = signToken({ id: user.id, username: user.username, role: user.role, parentId: null });
  res.json({ token, user });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  const user = User.findByUsername.get(username);
  if (!user) return res.status(401).json({ error: '用户不存在' });
  if (!verifyPassword(password, user.password_hash)) return res.status(401).json({ error: '密码错误' });
  const token = signToken({ id: user.id, username: user.username, role: user.role, parentId: user.parent_id });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, parentId: user.parent_id, displayName: user.display_name } });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = User.findById.get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({ user });
});

// ===== 课程管理（教师） =====

app.get('/api/courses', requireAuth, (req, res) => {
  let teacherId;
  if (req.user.role === 'teacher') teacherId = req.user.id;
  else if (req.user.role === 'student') teacherId = req.user.parentId;
  else return res.json({ courses: [] });
  if (!teacherId) return res.json({ courses: [] });
  const courses = Course.findByTeacher.all(teacherId);
  res.json({ courses });
});

app.post('/api/courses', requireAuth, requireTeacher, (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '课程名称不能为空' });
  const info = Course.create.run(req.user.id, name.trim(), description || '');
  res.json({ course: Course.findById.get(info.lastInsertRowid) });
});

app.put('/api/courses/:id', requireAuth, requireTeacher, (req, res) => {
  const { name, description } = req.body;
  const course = Course.findById.get(req.params.id);
  if (!course || course.teacher_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  Course.rename.run(name.trim(), description || '', req.params.id);
  res.json({ course: Course.findById.get(req.params.id) });
});

app.delete('/api/courses/:id', requireAuth, requireTeacher, (req, res) => {
  const course = Course.findById.get(req.params.id);
  if (!course || course.teacher_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  Course.delete.run(req.params.id);
  res.json({ ok: true });
});

// ===== 分组管理（教师） =====

app.get('/api/courses/:cid/groups', requireAuth, (req, res) => {
  const course = Course.findById.get(req.params.cid);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  if (req.user.role === 'teacher' && course.teacher_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  if (req.user.role === 'student' && course.teacher_id !== req.user.parentId) return res.status(403).json({ error: '无权操作' });
  res.json({ groups: Group.findByCourse.all(req.params.cid) });
});

app.post('/api/courses/:cid/groups', requireAuth, requireTeacher, (req, res) => {
  const course = Course.findById.get(req.params.cid);
  if (!course || course.teacher_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  const { name, sortOrder } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '分组名称不能为空' });
  const info = Group.create.run(req.params.cid, name.trim(), sortOrder || 0);
  res.json({ group: Group.findById.get(info.lastInsertRowid) });
});

app.put('/api/courses/:cid/groups/:gid', requireAuth, requireTeacher, (req, res) => {
  const course = Course.findById.get(req.params.cid);
  if (!course || course.teacher_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  const { name } = req.body;
  Group.rename.run(name.trim(), req.params.gid);
  res.json({ group: Group.findById.get(req.params.gid) });
});

app.delete('/api/courses/:cid/groups/:gid', requireAuth, requireTeacher, (req, res) => {
  const course = Course.findById.get(req.params.cid);
  if (!course || course.teacher_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  Group.delete.run(req.params.gid);
  res.json({ ok: true });
});

// ===== 题库管理 =====

// 列出题库（教师看自己的，学员看教师的）
app.get('/api/banks', requireAuth, (req, res) => {
  if (req.user.role === 'teacher') {
    const banks = Bank.findByTeacherStudent.all(req.user.id);
    return res.json({ banks });
  }
  // 学员只看绑定的课程题库
  if (!req.user.parentId) return res.json({ banks: [] });
  const banks = Bank.findByStudentBound.all(req.user.id);
  res.json({ banks });
});

// 列出某分组下的题库
app.get('/api/groups/:gid/banks', requireAuth, (req, res) => {
  const group = Group.findById.get(req.params.gid);
  if (!group) return res.status(404).json({ error: '分组不存在' });
  const course = Course.findById.get(group.course_id);
  if (req.user.role === 'teacher' && course.teacher_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  if (req.user.role === 'student' && course.teacher_id !== req.user.parentId) return res.status(403).json({ error: '无权操作' });
  res.json({ banks: Bank.findByGroup.all(req.params.gid) });
});

// 创建题库（需指定分组）
app.post('/api/groups/:gid/banks', requireAuth, requireTeacher, (req, res) => {
  const group = Group.findById.get(req.params.gid);
  if (!group) return res.status(404).json({ error: '分组不存在' });
  const course = Course.findById.get(group.course_id);
  if (!course || course.teacher_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '题库名称不能为空' });
  const info = Bank.create.run(req.params.gid, req.user.id, name.trim());
  res.json({ bank: Bank.findById.get(info.lastInsertRowid) });
});

// 重命名题库
app.put('/api/banks/:id', requireAuth, requireTeacher, (req, res) => {
  const bank = Bank.findById.get(req.params.id);
  if (!bank || bank.teacher_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  Bank.rename.run(req.body.name.trim(), req.params.id);
  res.json({ bank: Bank.findById.get(req.params.id) });
});

// 删除题库
app.delete('/api/banks/:id', requireAuth, requireTeacher, (req, res) => {
  const bank = Bank.findById.get(req.params.id);
  if (!bank || bank.teacher_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  Bank.delete.run(req.params.id);
  res.json({ ok: true });
});

// 获取题库的题目
app.get('/api/banks/:id/questions', requireAuth, (req, res) => {
  const bank = Bank.findById.get(req.params.id);
  if (!bank) return res.status(404).json({ error: '题库不存在' });
  if (req.user.role === 'teacher' && bank.teacher_id !== req.user.id) return res.status(403).json({ error: '无权访问' });
  if (req.user.role === 'student') {
    if (bank.teacher_id !== req.user.parentId) return res.status(403).json({ error: '无权访问' });
    // 检查课程绑定
    const group = Group.findById.get(bank.group_id);
    if (!group) return res.status(404).json({ error: '分组不存在' });
    const bound = StudentCourse.isBound.get(req.user.id, group.course_id);
    if (!bound || bound.count === 0) return res.status(403).json({ error: '未绑定该课程' });
  }
  const questions = Question.findByBank.all(req.params.id).map(q => ({
    ...q,
    options: q.options ? JSON.parse(q.options) : [],
    answer_keys: q.answer_keys ? JSON.parse(q.answer_keys) : [],
    answer_text: q.answer_text ? JSON.parse(q.answer_text) : [],
  }));
  res.json({ questions, bank });
});

// 导入题目到题库
app.post('/api/banks/:id/import', requireAuth, requireTeacher, (req, res) => {
  const bank = Bank.findById.get(req.params.id);
  if (!bank || bank.teacher_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  const { questions } = req.body;
  if (!Array.isArray(questions) || questions.length === 0) return res.status(400).json({ error: '没有可导入的题目' });
  const startNum = (Question.count.get(req.params.id)?.count) || 0;
  const insertMany = db.transaction((qs) => {
    qs.forEach((q, i) => {
      Question.insert.run(req.params.id, q.type || 'single', startNum + i + 1, q.question || '', JSON.stringify(q.options || []), JSON.stringify(q.answerKeys || q.answer_keys || []), JSON.stringify(q.answerText || q.answer_text || []), q.analysis || '', q.topic || '', q.score || 1);
    });
  });
  insertMany(questions);
  res.json({ imported: questions.length, total: Question.count.get(req.params.id)?.count || 0 });
});

// 添加单道题目
app.post('/api/banks/:id/questions', requireAuth, requireTeacher, (req, res) => {
  const bank = Bank.findById.get(req.params.id);
  if (!bank || bank.teacher_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  const { type, question, options, answerKeys, answerText, analysis, topic, score } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ error: '题目内容不能为空' });
  const startNum = (Question.count.get(req.params.id)?.count) || 0;
  const info = Question.insert.run(req.params.id, type || 'single', startNum + 1, question.trim(), JSON.stringify(options || []), JSON.stringify(answerKeys || []), JSON.stringify(answerText || []), analysis || '', topic || '', score || 1);
  const q = Question.findById.get(info.lastInsertRowid);
  res.json({ question: { ...q, options: JSON.parse(q.options || '[]'), answer_keys: JSON.parse(q.answer_keys || '[]'), answer_text: JSON.parse(q.answer_text || '[]') } });
});

// 编辑题目
app.put('/api/banks/:bankId/questions/:qid', requireAuth, requireTeacher, (req, res) => {
  const bank = Bank.findById.get(req.params.bankId);
  if (!bank || bank.teacher_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  const { type, question, options, answerKeys, answerText, analysis, topic, score } = req.body;
  if (!question || !question.trim()) return res.status(400).json({ error: '题目内容不能为空' });
  Question.update.run(type || 'single', question.trim(), JSON.stringify(options || []), JSON.stringify(answerKeys || []), JSON.stringify(answerText || []), analysis || '', topic || '', score || 1, req.params.qid);
  const q = Question.findById.get(req.params.qid);
  res.json({ question: { ...q, options: JSON.parse(q.options || '[]'), answer_keys: JSON.parse(q.answer_keys || '[]'), answer_text: JSON.parse(q.answer_text || '[]') } });
});

// 删除单个题目
app.delete('/api/banks/:bankId/questions/:qid', requireAuth, requireTeacher, (req, res) => {
  const bank = Bank.findById.get(req.params.bankId);
  if (!bank || bank.teacher_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  Question.delete.run(req.params.qid, req.params.bankId);
  res.json({ ok: true });
});

// ===== 学员管理（教师） =====

app.get('/api/students', requireAuth, requireTeacher, (req, res) => {
  res.json({ students: User.findStudents.all(req.user.id) });
});

app.post('/api/students', requireAuth, requireTeacher, (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  const existing = User.findByUsername.get(username);
  if (existing) return res.status(409).json({ error: '用户名已存在' });
  const hash = hashPassword(password);
  const info = User.create.run(username, hash, 'student', req.user.id, displayName || username);
  res.json({ student: User.findById.get(info.lastInsertRowid) });
});

app.delete('/api/students/:id', requireAuth, requireTeacher, (req, res) => {
  const result = User.deleteStudent.run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: '学员不存在或无权操作' });
  res.json({ ok: true });
});

app.put('/api/students/:id', requireAuth, requireTeacher, (req, res) => {
  const students = User.findStudents.all(req.user.id);
  if (!students.find(s => s.id === parseInt(req.params.id))) return res.status(403).json({ error: '无权操作' });
  User.updateDisplayName.run(req.body.displayName, req.params.id);
  res.json({ student: User.findById.get(req.params.id) });
});

// 查看学员绑定的课程
app.get('/api/students/:id/courses', requireAuth, requireTeacher, (req, res) => {
  const students = User.findStudents.all(req.user.id);
  if (!students.find(s => s.id === parseInt(req.params.id))) return res.status(403).json({ error: '无权操作' });
  res.json({ bindings: StudentCourse.findByStudent.all(req.params.id) });
});

// 批量设置学员绑定的课程（覆盖模式）
app.put('/api/students/:id/courses', requireAuth, requireTeacher, (req, res) => {
  const students = User.findStudents.all(req.user.id);
  if (!students.find(s => s.id === parseInt(req.params.id))) return res.status(403).json({ error: '无权操作' });
  const { courseIds } = req.body;
  // 验证课程都属于该教师
  const teacherCourses = Course.findByTeacher.all(req.user.id).map(c => c.id);
  const validIds = (courseIds || []).filter(id => teacherCourses.includes(id));
  // 清除旧的，写入新的
  StudentCourse.clearByStudent.run(req.params.id);
  validIds.forEach(cid => StudentCourse.bind.run(req.params.id, cid));
  res.json({ bindings: StudentCourse.findByStudent.all(req.params.id) });
});

app.get('/api/students/:id/records', requireAuth, requireTeacher, (req, res) => {
  const students = User.findStudents.all(req.user.id);
  if (!students.find(s => s.id === parseInt(req.params.id))) return res.status(403).json({ error: '无权操作' });
  const records = Record.findByStudent.all(req.params.id, parseInt(req.query.limit) || 50).map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : [] }));
  res.json({ records });
});

app.get('/api/students/records', requireAuth, requireTeacher, (req, res) => {
  const records = Record.findByTeacherStudents.all(req.user.id, parseInt(req.query.limit) || 100).map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : [] }));
  res.json({ records });
});

// ===== 学员答题 =====

app.post('/api/records', requireAuth, requireStudent, (req, res) => {
  const { bankId, mode, name, total, correct, score, duration, details, wrongQuestions, correctQuestions } = req.body;
  const bank = Bank.findById.get(bankId);
  if (!bank) return res.status(404).json({ error: '题库不存在' });
  if (bank.teacher_id !== req.user.parentId) return res.status(403).json({ error: '无权访问' });
  // 检查课程绑定
  const group = Group.findById.get(bank.group_id);
  if (group) {
    const bound = StudentCourse.isBound.get(req.user.id, group.course_id);
    if (!bound || bound.count === 0) return res.status(403).json({ error: '未绑定该课程' });
  }
  const info = Record.insert.run(req.user.id, bankId, mode, name, total, correct, score, 100, duration, JSON.stringify(details || []));
  if (Array.isArray(wrongQuestions)) wrongQuestions.forEach(qid => WrongEntry.upsert.run(req.user.id, bankId, qid));
  if (Array.isArray(correctQuestions)) correctQuestions.forEach(qid => WrongEntry.markCorrect.run(req.user.id, qid));
  res.json({ recordId: info.lastInsertRowid });
});

app.get('/api/records', requireAuth, requireStudent, (req, res) => {
  const records = Record.findByUser.all(req.user.id, parseInt(req.query.limit) || 50).map(r => ({ ...r, details: r.details ? JSON.parse(r.details) : [] }));
  res.json({ records });
});

app.get('/api/wrongbook', requireAuth, requireStudent, (req, res) => {
  const entries = WrongEntry.findByUser.all(req.user.id);
  res.json({ entries: entries.map(e => ({ ...e, options: e.options ? JSON.parse(e.options) : [], answer_keys: e.answer_keys ? JSON.parse(e.answer_keys) : [], answer_text: e.answer_text ? JSON.parse(e.answer_text) : [] })) });
});

app.delete('/api/wrongbook/:questionId', requireAuth, requireStudent, (req, res) => {
  WrongEntry.delete.run(req.user.id, req.params.questionId);
  res.json({ ok: true });
});

app.delete('/api/wrongbook/clear-mastered', requireAuth, requireStudent, (req, res) => {
  WrongEntry.clearMastered.run(req.user.id);
  res.json({ ok: true });
});

// ===== Health & Fallback =====
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) res.status(404).json({ error: 'Not found' });
  else res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`MyQuiz 服务已启动: http://localhost:${PORT}`));
