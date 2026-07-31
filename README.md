# MyQuiz - 答题系统

前后端分离的答题系统，支持教师-学员模式，适用于在线练习、考试和错题管理。

## 功能特性

### 教师端
- 教师账号注册与管理
- **课程管理**：创建/编辑/删除课程
- **分组管理**：课程下支持多分组（章节）组织
- **题库管理**：支持单题录入和批量导入
- **学员管理**：创建学员账号、绑定课程权限
- **成绩查看**：查看学员答题记录和统计

### 学员端
- 练习模式：顺序/随机刷题
- 考试模式：计时答题、自动评分
- 错题本：自动记录错题，追踪掌握状态
- 答题记录：查看历史成绩和详情

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| 前端 | 原生 HTML5 + CSS3 + JavaScript |
| 认证 | JWT + bcryptjs |

## 数据结构

```
课程(course) → 分组/章节(group) → 题库(bank) → 题目(question)
```

### 支持的题目类型
- 单选题 (single)
- 多选题 (multi)
- 判断题 (judge)
- 填空题 (blank)

## 快速开始

### 安装依赖
```bash
npm install
```

### 启动服务
```bash
# 生产模式
npm start

# 开发模式（带热重载）
npm run dev
```

服务默认运行在 `http://localhost:3000`

### 首次使用
1. 访问首页，点击「教师注册」创建教师账号
2. 登录后创建课程和分组
3. 导入或手动添加题目
4. 创建学员账号并绑定课程
5. 学员使用分配的账号登录开始练习

## 项目结构

```
my-quiz/
├── server.js          # Express 主服务
├── db.js              # 数据库层
├── auth.js            # 认证模块
├── package.json       # 项目配置
├── .gitignore         # Git 忽略配置
├── README.md          # 项目说明
└── public/            # 前端静态资源
    ├── index.html     # 单页应用入口
    ├── app.js         # 前端逻辑
    ├── styles.css     # 样式表
    ├── icon.svg       # 图标
    └── icon.png       # 图标
```

## API 概览

### 认证
- `POST /api/auth/register` - 教师注册
- `POST /api/auth/login` - 登录
- `GET /api/auth/me` - 获取当前用户

### 课程管理
- `GET /api/courses` - 课程列表
- `POST /api/courses` - 创建课程
- `PUT /api/courses/:id` - 更新课程
- `DELETE /api/courses/:id` - 删除课程

### 分组管理
- `GET /api/courses/:cid/groups` - 分组列表
- `POST /api/courses/:cid/groups` - 创建分组
- `PUT /api/courses/:cid/groups/:gid` - 更新分组
- `DELETE /api/courses/:cid/groups/:gid` - 删除分组

### 题库管理
- `GET /api/banks` - 题库列表
- `POST /api/groups/:gid/banks` - 创建题库
- `GET /api/banks/:id/questions` - 题目列表
- `POST /api/banks/:id/import` - 批量导入题目
- `POST /api/banks/:id/questions` - 添加单题

### 学员管理
- `GET /api/students` - 学员列表
- `POST /api/students` - 创建学员
- `PUT /api/students/:id/courses` - 绑定课程

### 答题相关
- `POST /api/records` - 提交答题记录
- `GET /api/records` - 答题记录
- `GET /api/wrongbook` - 错题本

## 数据库

使用 SQLite 存储数据，数据库文件 `quizmaster.db` 会自动创建。支持 WAL 模式以提升并发性能。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `JWT_SECRET` | JWT 密钥 | `quizmaster-secret-2026-change-in-prod` |

## 开源协议

MIT License
