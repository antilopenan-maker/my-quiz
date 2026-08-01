#!/usr/bin/env node

/**
 * import-questions.js - MyQuiz AI Agent 对接演示脚本
 *
 * 设计定位：MyQuiz 本身不集成大模型，本脚本作为【外部调用方】的演示，
 * 读取 JSON 格式的题目文件，携带 API Key 调用 MyQuiz 的 /api/llm/import 接口，
 * 实现题目的快速批量录入。
 *
 * 使用示例：
 * node scripts/import-questions.js \
 *   --api-key mq_你的API_KEY \
 *   --base-url http://localhost:3000 \
 *   --file questions.json
 *
 * questions.json 格式：
 * {
 *   "course": "PMP",
 *   "group": "第一章 项目管理概论",
 *   "bank": "练习题1",
 *   "questions": [
 *     {
 *       "type": "single",
 *       "question": "题干",
 *       "options": [{ "key": "A", "text": "选项A" }],
 *       "answerKeys": ["A"],
 *       "analysis": "解析",
 *       "topic": "知识点"
 *     }
 *   ]
 * }
 */

const fs = require('fs');
const path = require('path');

// 加载 .env（可选，若通过环境变量提供 API Key）
try { require('dotenv').config(); } catch (e) { /* dotenv 未安装时忽略 */ }

// 命令行参数解析
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (args[i].startsWith('--')) {
    options[args[i].substring(2)] = args[i + 1] || '';
  }
}

// 必需参数
const apiKey = options['api-key'] || process.env.MYQUIZ_API_KEY;
const baseUrl = (options['base-url'] || process.env.MYQUIZ_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const file = options['file'];

if (!apiKey) {
  console.error('❌ 缺少 API Key。用法：--api-key mq_xxx （或设置环境变量 MYQUIZ_API_KEY）');
  process.exit(1);
}
if (!file) {
  console.error('❌ 缺少题目文件。用法：--file questions.json');
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`❌ 文件不存在：${file}`);
  process.exit(1);
}

// 读取并校验题目 JSON
let payload;
try {
  payload = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch (e) {
  console.error('❌ JSON 解析失败：', e.message);
  process.exit(1);
}

if (!payload.course || !payload.bank || !Array.isArray(payload.questions) || payload.questions.length === 0) {
  console.error('❌ 题目文件格式不正确。需包含 course、bank 和 questions（非空数组）字段。');
  process.exit(1);
}

console.log('\n===== MyQuiz 题目批量导入 =====');
console.log(`目标服务 : ${baseUrl}`);
console.log(`课程     : ${payload.course}`);
console.log(`分组     : ${payload.group || '(默认分组)'}`);
console.log(`题库     : ${payload.bank}`);
console.log(`题目数量 : ${payload.questions.length}`);
console.log('--------------------------------');

// 发起 HTTP 请求（Node 18+ 内置 fetch，无需额外依赖）
async function main() {
  try {
    const res = await fetch(`${baseUrl}/api/llm/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`❌ 导入失败（HTTP ${res.status}）：`, JSON.stringify(data, null, 2));
      if (data.error) {
        console.error(`\n错误信息：${data.error}`);
        if (data.required) console.error(`必需字段：${JSON.stringify(data.required)}`);
      }
      if (res.status === 401) console.error('提示：API Key 无效或已停用，请到教师后台「设置」页重新生成。');
      process.exit(1);
    }

    console.log('✅ 导入成功！');
    console.log(`   课程 ${data.course?.name}${data.course?.created ? '（新建）' : '（已存在）'}`);
    console.log(`   分组 ${data.group?.name}${data.group?.created ? '（新建）' : '（已存在）'}`);
    console.log(`   题库 ${data.bank?.name}${data.bank?.created ? '（新建）' : '（已存在）'}`);
    console.log(`   本次导入 ${data.imported} 题，题库共 ${data.total_questions} 题`);
    console.log('\n刷新教师后台即可查看已导入的题目。');
  } catch (e) {
    console.error('❌ 网络错误：', e.message);
    console.error('   请确认 MyQuiz 服务已启动，且 base-url 正确。');
    process.exit(1);
  }
}

main();
