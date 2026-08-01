/**
 * db.js - SQLite 数据库初始化与查询层
 * 层级：课程(course) → 分组(group/章节) → 题库(bank) → 题目(question)
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'quizmaster.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ===== 建表 =====
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  parent_id INTEGER,
  display_name TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS banks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'single',
  number INTEGER DEFAULT 0,
  question TEXT NOT NULL,
  options TEXT,
  answer_keys TEXT,
  answer_text TEXT,
  analysis TEXT,
  topic TEXT,
  score INTEGER DEFAULT 1,
  FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  bank_id INTEGER NOT NULL,
  mode TEXT NOT NULL,
  name TEXT,
  total INTEGER,
  correct INTEGER,
  score INTEGER,
  total_score INTEGER DEFAULT 100,
  duration INTEGER,
  date TEXT DEFAULT (datetime('now', 'localtime')),
  details TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wrong_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  bank_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  wrong_count INTEGER DEFAULT 0,
  right_count INTEGER DEFAULT 0,
  status TEXT DEFAULT '未掌握',
  review_level INTEGER DEFAULT 0,
  last_wrong_at TEXT,
  last_correct_at TEXT,
  next_review_at TEXT,
  UNIQUE(user_id, question_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS student_courses (
  student_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  bound_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_keys (
  key_id TEXT PRIMARY KEY,
  teacher_id INTEGER NOT NULL,
  label TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  last_used_at TEXT,
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

db.exec(SCHEMA);

// ===== 查询辅助 =====

// 用户
const User = {
  create: db.prepare(`INSERT INTO users (username, password_hash, role, parent_id, display_name) VALUES (?, ?, ?, ?, ?)`),
  findByUsername: db.prepare(`SELECT * FROM users WHERE username = ?`),
  findById: db.prepare(`SELECT id, username, role, parent_id, display_name, created_at FROM users WHERE id = ?`),
  findStudents: db.prepare(`SELECT id, username, display_name, created_at FROM users WHERE parent_id = ? ORDER BY id`),
  deleteStudent: db.prepare(`DELETE FROM users WHERE id = ? AND parent_id = ?`),
  updateDisplayName: db.prepare(`UPDATE users SET display_name = ? WHERE id = ?`),
  countStudents: db.prepare(`SELECT COUNT(*) as count FROM users WHERE parent_id = ?`),
};

// 学员-课程绑定
const StudentCourse = {
  bind: db.prepare(`INSERT INTO student_courses (student_id, course_id) VALUES (?, ?) ON CONFLICT DO NOTHING`),
  unbind: db.prepare(`DELETE FROM student_courses WHERE student_id = ? AND course_id = ?`),
  findByStudent: db.prepare(`SELECT sc.*, c.name as course_name FROM student_courses sc JOIN courses c ON sc.course_id = c.id WHERE sc.student_id = ? ORDER BY c.id`),
  findCourseIds: db.prepare(`SELECT course_id FROM student_courses WHERE student_id = ?`),
  isBound: db.prepare(`SELECT COUNT(*) as count FROM student_courses WHERE student_id = ? AND course_id = ?`),
  clearByStudent: db.prepare(`DELETE FROM student_courses WHERE student_id = ?`),
};

// API Key
const ApiKey = {
  create: db.prepare(`INSERT INTO api_keys (key_id, teacher_id, label) VALUES (?, ?, ?)`),
  findByKey: db.prepare(`SELECT ak.*, u.username, u.role FROM api_keys ak JOIN users u ON ak.teacher_id = u.id WHERE ak.key_id = ? AND ak.is_active = 1`),
  findByTeacher: db.prepare(`SELECT key_id, label, created_at, last_used_at, is_active FROM api_keys WHERE teacher_id = ? ORDER BY created_at DESC`),
  updateLastUsed: db.prepare(`UPDATE api_keys SET last_used_at = datetime('now', 'localtime') WHERE key_id = ?`),
  deactivate: db.prepare(`UPDATE api_keys SET is_active = 0 WHERE key_id = ? AND teacher_id = ?`),
  delete: db.prepare(`DELETE FROM api_keys WHERE key_id = ? AND teacher_id = ?`),
};

// 课程
const Course = {
  create: db.prepare(`INSERT INTO courses (teacher_id, name, description) VALUES (?, ?, ?)`),
  findById: db.prepare(`SELECT * FROM courses WHERE id = ?`),
  findByTeacher: db.prepare(`
    SELECT c.*, 
      (SELECT COUNT(*) FROM groups WHERE course_id = c.id) as group_count,
      (SELECT COUNT(*) FROM banks b JOIN groups g ON b.group_id = g.id WHERE g.course_id = c.id) as bank_count,
      (SELECT COUNT(*) FROM questions q JOIN banks b ON q.bank_id = b.id JOIN groups g ON b.group_id = g.id WHERE g.course_id = c.id) as qcount
    FROM courses c WHERE teacher_id = ? ORDER BY c.id DESC
  `),
  rename: db.prepare(`UPDATE courses SET name = ?, description = ? WHERE id = ?`),
  delete: db.prepare(`DELETE FROM courses WHERE id = ?`),
};

// 分组（章节）
const Group = {
  create: db.prepare(`INSERT INTO groups (course_id, name, sort_order) VALUES (?, ?, ?)`),
  findById: db.prepare(`SELECT * FROM groups WHERE id = ?`),
  findByCourse: db.prepare(`
    SELECT g.*, 
      (SELECT COUNT(*) FROM banks WHERE group_id = g.id) as bank_count,
      (SELECT COUNT(*) FROM questions q JOIN banks b ON q.bank_id = b.id WHERE b.group_id = g.id) as qcount
    FROM groups g WHERE course_id = ? ORDER BY g.sort_order, g.id
  `),
  rename: db.prepare(`UPDATE groups SET name = ? WHERE id = ?`),
  delete: db.prepare(`DELETE FROM groups WHERE id = ?`),
};

// 题库
const Bank = {
  create: db.prepare(`INSERT INTO banks (group_id, teacher_id, name) VALUES (?, ?, ?)`),
  findById: db.prepare(`SELECT * FROM banks WHERE id = ?`),
  findByGroup: db.prepare(`SELECT b.*, (SELECT COUNT(*) FROM questions WHERE bank_id = b.id) as qcount FROM banks b WHERE group_id = ? ORDER BY b.id DESC`),
  findByTeacher: db.prepare(`
    SELECT b.*, g.name as group_name, g.course_id, c.name as course_name,
      (SELECT COUNT(*) FROM questions WHERE bank_id = b.id) as qcount
    FROM banks b 
    JOIN groups g ON b.group_id = g.id 
    JOIN courses c ON g.course_id = c.id
    WHERE b.teacher_id = ? ORDER BY c.id DESC, g.sort_order, b.id DESC
  `),
  // 学员已绑定的课程列表（含各课程题目数统计）
  findByStudentCourses: db.prepare(`
    SELECT c.id, c.name, c.description,
      (SELECT COUNT(*) FROM banks b2 JOIN groups g2 ON b2.group_id = g2.id WHERE g2.course_id = c.id) as bank_count,
      (SELECT COUNT(*) FROM questions q JOIN banks b3 ON q.bank_id = b3.id JOIN groups g3 ON b3.group_id = g3.id WHERE g3.course_id = c.id) as qcount,
      (SELECT COUNT(*) FROM groups g4 WHERE g4.course_id = c.id) as group_count
    FROM courses c
    JOIN student_courses sc ON sc.course_id = c.id
    WHERE sc.student_id = ? ORDER BY c.id DESC
  `),
  // 某课程下学员可访问的分组-题库树
  findByCourseForStudent: db.prepare(`
    SELECT b.*, g.name as group_name, g.sort_order,
      (SELECT COUNT(*) FROM questions WHERE bank_id = b.id) as qcount
    FROM banks b
    JOIN groups g ON b.group_id = g.id
    JOIN courses c ON g.course_id = c.id
    JOIN student_courses sc ON sc.course_id = c.id
    WHERE sc.student_id = ? AND c.id = ? ORDER BY g.sort_order, g.id, b.id DESC
  `),
  findByTeacherStudent: db.prepare(`
    SELECT b.*, g.name as group_name, g.course_id, c.name as course_name,
      (SELECT COUNT(*) FROM questions WHERE bank_id = b.id) as qcount
    FROM banks b 
    JOIN groups g ON b.group_id = g.id 
    JOIN courses c ON g.course_id = c.id
    WHERE c.teacher_id = ? ORDER BY c.id DESC, g.sort_order, b.id DESC
  `),
  findByStudentBound: db.prepare(`
    SELECT b.*, g.name as group_name, g.course_id, c.name as course_name,
      (SELECT COUNT(*) FROM questions WHERE bank_id = b.id) as qcount
    FROM banks b 
    JOIN groups g ON b.group_id = g.id 
    JOIN courses c ON g.course_id = c.id
    JOIN student_courses sc ON sc.course_id = c.id
    WHERE sc.student_id = ? ORDER BY c.id DESC, g.sort_order, b.id DESC
  `),
  rename: db.prepare(`UPDATE banks SET name = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`),
  delete: db.prepare(`DELETE FROM banks WHERE id = ?`),
};

// 题目
const Question = {
  insert: db.prepare(`INSERT INTO questions (bank_id, type, number, question, options, answer_keys, answer_text, analysis, topic, score) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  findById: db.prepare(`SELECT * FROM questions WHERE id = ?`),
  findByBank: db.prepare(`SELECT * FROM questions WHERE bank_id = ? ORDER BY number, id`),
  delete: db.prepare(`DELETE FROM questions WHERE id = ? AND bank_id = ?`),
  count: db.prepare(`SELECT COUNT(*) as count FROM questions WHERE bank_id = ?`),
  update: db.prepare(`UPDATE questions SET type = ?, question = ?, options = ?, answer_keys = ?, answer_text = ?, analysis = ?, topic = ?, score = ? WHERE id = ?`),
};

// 记录
const Record = {
  insert: db.prepare(`INSERT INTO records (user_id, bank_id, mode, name, total, correct, score, total_score, duration, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  findByUser: db.prepare(`
    SELECT r.*, b.name as bank_name, c.name as course_name
    FROM records r 
    LEFT JOIN banks b ON r.bank_id = b.id
    LEFT JOIN groups g ON b.group_id = g.id
    LEFT JOIN courses c ON g.course_id = c.id
    WHERE r.user_id = ? ORDER BY r.id DESC LIMIT ?
  `),
  findByStudent: db.prepare(`
    SELECT r.*, b.name as bank_name, c.name as course_name, u.username, u.display_name
    FROM records r 
    LEFT JOIN banks b ON r.bank_id = b.id
    LEFT JOIN groups g ON b.group_id = g.id
    LEFT JOIN courses c ON g.course_id = c.id
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.user_id = ? ORDER BY r.id DESC LIMIT ?
  `),
  findByTeacherStudents: db.prepare(`
    SELECT r.*, b.name as bank_name, c.name as course_name, u.username, u.display_name
    FROM records r 
    LEFT JOIN banks b ON r.bank_id = b.id
    LEFT JOIN groups g ON b.group_id = g.id
    LEFT JOIN courses c ON g.course_id = c.id
    LEFT JOIN users u ON r.user_id = u.id
    WHERE u.parent_id = ? ORDER BY r.id DESC LIMIT ?
  `),
};

// 错题
const WrongEntry = {
  upsert: db.prepare(`
    INSERT INTO wrong_entries (user_id, bank_id, question_id, wrong_count, last_wrong_at) VALUES (?, ?, ?, 1, datetime('now', 'localtime'))
    ON CONFLICT(user_id, question_id) DO UPDATE SET wrong_count = wrong_count + 1, last_wrong_at = datetime('now', 'localtime'), status = '未掌握', review_level = 0
  `),
  markCorrect: db.prepare(`
    UPDATE wrong_entries SET right_count = right_count + 1, last_correct_at = datetime('now', 'localtime'), review_level = review_level + 1,
      status = CASE WHEN review_level + 1 >= 3 THEN '已掌握' ELSE '复习中' END,
      next_review_at = CASE WHEN review_level + 1 >= 3 THEN NULL ELSE datetime('now', 'localtime', '+' || (review_level + 1) || ' days') END
    WHERE user_id = ? AND question_id = ?
  `),
  findByUser: db.prepare(`
    SELECT we.*, q.question, q.type, q.options, q.answer_keys, q.answer_text, q.analysis, q.topic
    FROM wrong_entries we JOIN questions q ON we.question_id = q.id
    WHERE we.user_id = ? AND we.status != '已掌握'
    ORDER BY we.last_wrong_at DESC
  `),
  delete: db.prepare(`DELETE FROM wrong_entries WHERE user_id = ? AND question_id = ?`),
  clearMastered: db.prepare(`DELETE FROM wrong_entries WHERE user_id = ? AND status = '已掌握'`),
};

module.exports = { db, User, StudentCourse, ApiKey, Course, Group, Bank, Question, Record, WrongEntry };
