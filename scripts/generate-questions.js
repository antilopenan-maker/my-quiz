#!/usr/bin/env node

/**
 * generate-questions.js - 大模型题目生成脚本
 * 
 * 使用示例：
 * node scripts/generate-questions.js \
 *   --bank-id 123 \
 *   --topic "JavaScript 基础" \
 *   --difficulty medium \
 *   --type single \
 *   --count 5 \
 *   --instructions "生成5道关于JavaScript基础语法的单选题，难度中等"
 * 
 * 环境变量要求：
 * LLM_PROVIDER, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 加载环境变量
require('dotenv').config();

// 命令行参数解析
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i += 2) {
  if (args[i].startsWith('--')) {
    const key = args[i].substring(2);
    const value = args[i + 1] || '';
    options[key] = value;
  }
}

// 验证必需参数
const requiredOptions = ['bank-id', 'topic', 'difficulty', 'type', 'count'];
const missingOptions = requiredOptions.filter(opt => !options[opt]);
if (missingOptions.length > 0) {
  console.error(`错误：缺少必需参数: ${missingOptions.join(', ')}`);
  console.log('使用方法：node scripts/generate-questions.js --bank-id <ID> --topic <主题> --difficulty <难度> --type <类型> --count <数量> [--instructions <提示>]');
  process.exit(1);
}

// 获取环境变量
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-3.5-turbo';
const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE) || 0.3;
const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS) || 1024;

if (!LLM_API_KEY) {
  console.error('错误：LLM_API_KEY 环境变量未设置');
  console.log('请在 .env 文件中设置 LLM_API_KEY');
  process.exit(1);
}

// 构建请求数据
const requestData = {
  topic: options['topic'],
  difficulty: options['difficulty'],
  type: options['type'],
  count: parseInt(options['count']),
  instructions: options['instructions'] || `生成${options['count']}道关于${options['topic']}的${options['type']}题，难度${options['difficulty']}`
};

// 构建 curl 命令
const curlCommand = `curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${LLM_API_KEY}" \
  --data '${JSON.stringify(requestData)}' \
  ${LLM_BASE_URL.replace('/v1', '')}/api/banks/${options['bank-id']}/import/generate`;

console.log('\n=== 大模型题目生成脚本 ===');
console.log(`题库ID: ${options['bank-id']}`);
console.log(`主题: ${options['topic']}`);
console.log(`难度: ${options['difficulty']}`);
console.log(`类型: ${options['type']}`);
console.log(`数量: ${options['count']}`);
console.log(`提示: ${requestData.instructions}`);
console.log(`\n正在调用大模型 API...\n`);

try {
  // 执行 curl 命令
  const result = execSync(curlCommand, { encoding: 'utf8', timeout: 30000 });
  
  try {
    const parsedResult = JSON.parse(result);
    console.log('✅ 生成成功！');
    console.log(`生成了 ${parsedResult.generatedCount || parsedResult.count || '未知'} 道题目`);
    
    if (parsedResult.questions && Array.isArray(parsedResult.questions)) {
      console.log(`\n生成的题目：`);
      parsedResult.questions.forEach((q, index) => {
        console.log(`\n${index + 1}. ${q.question}`);
        if (q.options && q.options.length > 0) {
          console.log(`   选项: ${q.options.join(' | ')}`);
        }
        if (q.answer) {
          console.log(`   答案: ${Array.isArray(q.answer) ? q.answer.join(', ') : q.answer}`);
        }
        if (q.explanation) {
          console.log(`   解析: ${q.explanation}`);
        }
      });
    }
    
    console.log(`\n🎉 题目已成功添加到题库 ID ${options['bank-id']}！`);
    console.log(`\n提示：可以在教师后台查看和管理这些题目。`);
  } catch (parseError) {
    console.log('API 响应:', result);
    console.log('\n⚠️  注意：响应不是标准 JSON 格式，但题目可能已成功添加。');
  }
} catch (error) {
  console.error('\n❌ 生成失败！');
  console.error('错误详情:', error.message);
  
  if (error.stdout) {
    console.log('响应内容:', error.stdout);
  }
  
  if (error.stderr) {
    console.log('错误输出:', error.stderr);
  }
  
  console.log('\n常见问题排查：');
  console.log('- 检查 LLM_API_KEY 是否正确');
  console.log('- 确认服务端已启动且可访问');
  console.log('- 检查网络连接是否正常');
  console.log('- 查看服务器日志获取详细错误信息');
}

console.log('\n--- 脚本执行完成 ---');