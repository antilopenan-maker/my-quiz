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

## 大模型 API 集成

MyQuiz 支持通过大模型 API 自动生成和添加题目，提升题库建设效率。

### 支持的大模型服务
- OpenAI API (GPT-3.5/GPT-4)
- Anthropic Claude
- 通义千问 (Qwen)
- 文心一言 (ERNIE Bot)
- 其他兼容 OpenAI API 格式的模型服务

### 配置大模型 API

在 `.env` 文件中配置以下环境变量：

| 变量 | 说明 | 示例 |
|------|------|------|
| `LLM_PROVIDER` | 大模型服务商 | `openai`, `anthropic`, `qwen`, `ernie` |
| `LLM_API_KEY` | API 密钥 | `sk-xxx` |
| `LLM_BASE_URL` | API 基础 URL（可选） | `https://api.openai.com/v1` |
| `LLM_MODEL` | 模型名称 | `gpt-3.5-turbo`, `claude-2`, `qwen-max` |
| `LLM_TEMPERATURE` | 温度参数（0.0-1.0） | `0.3` |
| `LLM_MAX_TOKENS` | 最大生成 token 数 | `1024` |

### 使用大模型 API 添加题目

#### 方法一：通过 API 接口添加

教师端可通过以下 API 接口使用大模型生成题目：

```bash
# 生成单题
POST /api/banks/:id/questions/generate
{
  "topic": "JavaScript 基础",
  "difficulty": "medium",
  "type": "single",
  "count": 5,
  "instructions": "生成5道关于JavaScript基础语法的单选题，难度中等"
}

# 批量生成题目
POST /api/banks/:id/import/generate
{
  "topic": "React Hooks",
  "difficulty": "hard",
  "type": "multi",
  "count": 10,
  "instructions": "生成10道关于React Hooks高级用法的多选题，难度高"
}
```

#### 方法二：通过教师界面添加

1. 登录教师后台
2. 进入目标题库
3. 点击「AI生成题目」按钮
4. 输入题目主题、难度、类型和数量
5. 点击「生成」按钮
6. 审核生成的题目并确认添加

#### 方法三：通过命令行工具添加

```bash
# 生成并添加题目到指定题库
cd D:\Applications\Projects\MyQuiz
node scripts/generate-questions.js \
  --bank-id 123 \
  --topic "Python 数据结构" \
  --difficulty easy \
  --type single \
  --count 10 \
  --instructions "生成10道关于Python列表、字典、元组的基础单选题"
```

### 大模型题目生成示例

```json
{
  "question": "下列哪个选项不是 Python 的内置数据类型？",
  "options": ["list", "dict", "array", "tuple"],
  "answer": ["array"],
  "explanation": "Python 的内置数据类型包括 list、dict、tuple、set 等，但 array 不是内置类型，需要 import array 或 numpy 才能使用。",
  "difficulty": "easy"
}
```

### 安全与质量控制

- 所有大模型生成的题目都会经过本地规则验证
- 支持人工审核模式，生成后需教师确认才能入库
- 提供题目质量评分，帮助教师筛选高质量题目
- 支持对生成题目进行编辑和修改

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
- `POST /api/banks/:id/questions/generate` - AI 生成单题
- `POST /api/banks/:id/import/generate` - AI 批量生成题目

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
| `LLM_PROVIDER` | 大模型服务商 | `openai` |
| `LLM_API_KEY` | API 密钥 | `none` |
| `LLM_BASE_URL` | API 基础 URL | `https://api.openai.com/v1` |
| `LLM_MODEL` | 模型名称 | `gpt-3.5-turbo` |
| `LLM_TEMPERATURE` | 温度参数 | `0.3` |
| `LLM_MAX_TOKENS` | 最大生成 token 数 | `1024` |

## 开源协议

MIT License