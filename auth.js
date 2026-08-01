/**
 * auth.js - JWT 认证 + API Key 认证 + 权限中间件
 */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'myquiz-secret-2026-change-in-prod';
const JWT_EXPIRES = '7d';

function hashPassword(plain) { return bcrypt.hashSync(plain, 10); }
function verifyPassword(plain, hash) { return bcrypt.compareSync(plain, hash); }
function signToken(payload) { return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES }); }
function verifyToken(token) { try { return jwt.verify(token, JWT_SECRET); } catch { return null; } }

function generateApiKey() {
  return 'mq_' + crypto.randomBytes(24).toString('hex');
}

// 中间件：要求登录（支持 JWT 和 API Key 双模式）
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录（需要 JWT Token 或 API Key）' });
  }
  const credential = header.slice(7);

  // 尝试 API Key（mq_ 开头）
  if (credential.startsWith('mq_')) {
    // 延迟加载 db 避免循环依赖
    const { ApiKey } = require('./db');
    const keyRow = ApiKey.findByKey.get(credential);
    if (!keyRow) return res.status(401).json({ error: 'API Key 无效或已停用' });
    ApiKey.updateLastUsed.run(credential);
    req.user = { id: keyRow.teacher_id, username: keyRow.username, role: 'teacher', parentId: null, viaApiKey: true };
    return next();
  }

  // JWT Token
  const payload = verifyToken(credential);
  if (!payload) return res.status(401).json({ error: 'Token 无效或已过期' });
  req.user = payload;
  next();
}

function requireTeacher(req, res, next) {
  if (req.user.role !== 'teacher') return res.status(403).json({ error: '仅教师可操作' });
  next();
}

function requireStudent(req, res, next) {
  if (req.user.role !== 'student') return res.status(403).json({ error: '仅学员可操作' });
  next();
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, generateApiKey, requireAuth, requireTeacher, requireStudent };
