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
- **API Key 管理**：生成/停用对接密钥，供外部 Agent 调用

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
| 认证 | JWT + bcryptjs + API Key 双模式 |

## 数据结构

```
课程(course) → 分组/章节(group) → 题库(bank) → 题目(question)
```

### 支持的题目类型
- 单选题 (single)
- 多选题 (multi)
- 判断题 (judge)
- 填空题 (blank)

---

## AI Agent 对接（LLM API）

> **设计定位**：MyQuiz **本身不集成大模型**（不调用任何 LLM 服务），而是**对外暴露结构化 API**，让外部 AI Agent（如 DeepSeek、Claude、GPT 等对话式大模型，或自动化脚本）直接调用，实现题目的**快速批量录入**，免去教师手动逐题添加。

### 工作流程

```
外部 AI Agent（大模型 / 脚本）
    │  ① 生成题目 JSON
    │  ② 携带 API Key 调用 MyQuiz API
    ▼
MyQuiz API（/api/llm/* 接口）
    │  ③ 自动创建课程 / 分组 / 题库
    │  ④ 批量写入题目
    ▼
MyQuiz 数据库 → 教师后台查看 → 学员刷题
```

### 快速开始（3 步）

1. **生成 API Key**：教师登录后台 →「设置」页 →「API Key 管理」→ 点击「+ 生成新 Key」，得到以 `mq_` 开头的密钥。
2. **让 AI Agent 调接口**：在任意大模型对话中描述题目需求，提供 API Key 与接口说明，让 AI 生成符合格式的 JSON 并调用 `/api/llm/import`。
3. **确认入库**：刷新教师后台题库页面，查看 AI 生成的题目是否已写入，可按需编辑修正。

### LLM 接口一览（需 API Key 认证）

所有接口使用请求头 `Authorization: Bearer mq_xxxxx` 认证：

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/llm/status` | 查看课程 / 题库 / 学员概览 |
| POST | `/api/llm/import` | 导入题目（自动创建课程 / 分组 / 题库，或追加到已有题库）|
| GET | `/api/llm/banks/:bankId/questions` | 查看指定题库的题目列表 |
| POST | `/api/llm/students` | 创建学员账号 |
| PUT | `/api/llm/students/:studentId/courses` | 为学员绑定课程 |

### 题目导入格式（POST /api/llm/import）

```json
{
  "course": "PMP",
  "group": "第一章 项目管理概论",
  "bank": "练习题1",
  "description": "可选的课程描述",
  "questions": [
    {
      "type": "single",
      "question": "下列哪个选项不是 Python 的内置数据类型？",
      "options": [
        { "key": "A", "text": "list" },
        { "key": "B", "text": "dict" },
        { "key": "C", "text": "array" },
        { "key": "D", "text": "tuple" }
      ],
      "answerKeys": ["C"],
      "analysis": "Python 内置数据类型包括 list、dict、tuple 等，array 需导入 array 或 numpy 模块。",
      "topic": "Python 基础",
      "score": 1
    }
  ]
}
```

**字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `course` | ✅ | 课程名，不存在则自动创建 |
| `group` | ❌ | 分组名，缺省为「默认分组」，不存在则自动创建 |
| `bank` | ✅ | 题库名，不存在则自动创建 |
| `questions` | ✅ | 题目数组，非空 |
| `type` | 单题内 | `single` / `multi` / `judge` / `blank`，缺省 `single` |
| `question` | 单题内 | 题干文本 |
| `options` | 选择题 | 选项数组 `[{ key, text }]` |
| `answerKeys` | 选择题 | 正确答案 key 数组，如 `["A"]` 或 `["A","C"]` |
| `answerText` | 填空题 | 填空题答案文本数组 |
| `analysis` | ❌ | 题目解析 |
| `topic` | ❌ | 知识点标签 |

**响应示例：**

```json
{
  "ok": true,
  "course": { "id": 1, "name": "PMP", "created": true },
  "group": { "id": 3, "name": "第一章 项目管理概论", "created": true },
  "bank": { "id": 7, "name": "练习题1", "created": true },
  "imported": 5,
  "total_questions": 5
}
```

### 外部 Agent 调用示例

**curl：**

```bash
curl -X POST http://localhost:3000/api/llm/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mq_你的API_KEY" \
  -d @questions.json
```

**大模型 Prompt 示例（给 AI Agent 的指令）：**

```
请为 MyQuiz 答题系统生成 5 道关于 JavaScript 基础语法的单选题。
要求：
1. 使用下面的 JSON 结构，通过 HTTP 调用 http://localhost:3000/api/llm/import
2. 请求头携带 Authorization: Bearer mq_你的API_KEY
3. course 填 "前端基础"，bank 填 "JS 练习题"
4. 每题包含 question / options / answerKeys / analysis 四个字段
```

**命令行演示脚本：**

仓库提供了演示脚本 `scripts/import-questions.js`，可读取 JSON 文件批量导入：

```bash
node scripts/import-questions.js \
  --api-key mq_你的API_KEY \
  --base-url http://localhost:3000 \
  --file questions.json
```

### 安全说明

- API Key 仅教师账号可生成，格式以 `mq_` 开头，存储在服务端数据库（明文 Key 仅生成时展示一次）。
- 所有 `/api/llm/*` 接口均校验 API Key 有效性，删除后立即失效。
- 每次调用会更新 Key 的 `last_used_at`，便于审计使用情况。
- 建议为不同 Agent 创建不同标签的 Key（如「LLM导入专用」「自动化脚本」），便于追溯。

---

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
3. 导入或手动添加题目（可用 AI Agent 对接快速录入）
4. 创建学员账号并绑定课程
5. 学员使用分配的账号登录开始练习

## 项目结构

```
my-quiz/
├── server.js                 # Express 主服务
├── db.js                     # 数据库层
├── auth.js                   # 认证模块（JWT + API Key）
├── scripts/
│   └── import-questions.js   # AI 对接演示脚本（批量导入题目）
├── miniprogram/              # 学员端微信小程序
│   ├── app.js                # 小程序入口（请求封装、登录态管理）
│   ├── app.json              # 全局配置（页面/导航）
│   ├── app.wxss              # 全局样式
│   ├── project.config.json   # 开发者工具项目配置
│   └── pages/
│       ├── login/            # 登录页
│       ├── home/             # 首页（课程列表 + 统计概览）
│       ├── course/           # 课程详情（分组-题库树）
│       ├── practice/         # 练习/考试配置
│       ├── quiz/             # 答题页（选择/填空/答题卡/倒计时）
│       ├── wrongbook/        # 错题本
│       └── records/          # 答题记录
├── package.json              # 项目配置
├── .gitignore                # Git 忽略配置
├── README.md                 # 项目说明
└── public/                   # 教师端前端静态资源
    ├── index.html            # 单页应用入口
    ├── app.js                # 前端逻辑
    ├── styles.css            # 样式表
    ├── icon.svg              # 图标
    └── icon.png              # 图标
```

## 学员端微信小程序

MyQuiz 提供配套的学员端微信小程序（`miniprogram/`），学员可用手机随时刷题。

### 功能

| 页面 | 功能 |
|------|------|
| 登录 | 学员账号登录（与教师端共用账号体系），可配置服务器地址 |
| 首页 | 绑定课程列表、题目/错题/练习统计、最近成绩 |
| 课程详情 | 分组（章节）→ 题库树浏览 |
| 练习设置 | 练习模式（顺序/随机、题目数量）/ 考试模式（名称/数量/时长/及格线）|
| 答题 | 单选/多选/判断/填空、答题卡、考试倒计时、答案即时反馈、解析 |
| 错题本 | 按掌握状态筛选、一键复习、手动移除 |
| 答题记录 | 历史成绩列表 |

### 使用步骤

1. **启动后端**：`npm start`，服务运行在 `http://localhost:3000`
2. **导入小程序**：微信开发者工具 →「导入项目」→ 选择 `miniprogram/` 目录
3. **配置服务器地址**：小程序登录页底部可填写服务器地址（默认 `http://localhost:3000`）
   - ⚠️ 真机调试时，需将地址改为电脑的局域网 IP（如 `http://192.168.x.x:3000`）
   - ⚠️ 正式发布需 HTTPS 域名并在小程序后台配置 request 合法域名
4. **登录练习**：使用教师创建的学员账号登录

### 技术说明

- 原生小程序框架（WXML/WXSS/JS），无第三方依赖
- 全局请求封装在 `app.js`：自动携带 JWT、401 自动跳登录页
- 会话通过 Storage 在页面间传递（答题页不重复拉取题目）
- 判分逻辑在前端完成（题目接口已返回答案字段），提交时上报正确/错误题目 ID 用于错题本维护

### 学员端专用 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/student/courses` | 我的绑定课程列表（含题目数统计）|
| GET | `/api/student/course/:cid/banks` | 课程下的分组-题库树（校验绑定）|
| GET | `/api/student/dashboard` | 首页概览（课程数/题目数/错题数/最近记录）|

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
- `PUT /api/banks/:bankId/questions/:qid` - 编辑题目
- `DELETE /api/banks/:bankId/questions/:qid` - 删除题目

### 学员管理
- `GET /api/students` - 学员列表
- `POST /api/students` - 创建学员
- `PUT /api/students/:id` - 更新学员
- `DELETE /api/students/:id` - 删除学员
- `PUT /api/students/:id/courses` - 绑定课程
- `GET /api/students/:id/records` - 学员答题记录

### API Key 管理（教师）
- `GET /api/apikeys` - 列出 API Key
- `POST /api/apikeys` - 生成 API Key
- `DELETE /api/apikeys/:keyId` - 删除 API Key

### AI Agent 对接（API Key 认证）
- `GET /api/llm/status` - 系统概览
- `POST /api/llm/import` - 导入题目（自动建课程/分组/题库）
- `GET /api/llm/banks/:bankId/questions` - 查看题库题目
- `POST /api/llm/students` - 创建学员
- `PUT /api/llm/students/:studentId/courses` - 绑定学员课程

### 答题相关（学员）
- `POST /api/records` - 提交答题记录
- `GET /api/records` - 答题记录
- `GET /api/wrongbook` - 错题本
- `DELETE /api/wrongbook/:questionId` - 删除错题
- `DELETE /api/wrongbook/clear-mastered` - 清空已掌握错题

### 学员端专用（小程序）
- `GET /api/student/courses` - 我的绑定课程列表
- `GET /api/student/course/:cid/banks` - 课程下的分组-题库树
- `GET /api/student/dashboard` - 首页概览

### 其他
- `GET /api/health` - 健康检查

## 数据库

使用 SQLite 存储数据，数据库文件 `quizmaster.db` 会自动创建。支持 WAL 模式以提升并发性能。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `JWT_SECRET` | JWT 密钥 | `myquiz-secret-2026-change-in-prod` |

> MyQuiz 本身不调用任何大模型服务，因此**无需配置任何 LLM 相关环境变量**。大模型对接所需的 API Key 由教师在后台生成（见上文「AI Agent 对接」章节）。

## 开源协议

MIT License
