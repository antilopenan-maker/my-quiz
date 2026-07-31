/**
 * auth.js - JWT 认证 + 权限中间件
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'quizmaster-secret-2026-change-in-prod';
const JWT_EXPIRES = '7d';

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

// 中间件：要求登录
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Token 无效或已过期' });
  req.user = payload; // { id, username, role, parentId }
  next();
}

// 中间件：要求教师身份
function requireTeacher(req, res, next) {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: '仅教师可操作' });
  }
  next();
}

// 中间件：要求学员身份
function requireStudent(req, res, next) {
  if (req.user.role !== 'student') {
    return res.status(403).json({ error: '仅学员可操作' });
  }
  next();
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, requireAuth, requireTeacher, requireStudent };
