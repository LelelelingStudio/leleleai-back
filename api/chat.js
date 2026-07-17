// api/chat.js —— 最终版（Edge Runtime + 深度思考）
export const runtime = 'edge';

export default async function handler(req) {
  // ===== 1. CORS（OPTIONS 预检） =====
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
  if (!DEEPSEEK_API_KEY) {
    return new Response(JSON.stringify({ error: 'API Key 未配置' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // ===== 2. 解析请求体（含深度思考开关） =====
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: '无效的 JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const {
    messages,
    model = 'deepseek-v4-flash',
    stream = true,
    deep_think = false,   // 👈 深度思考开关，默认关闭
  } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages 不能为空' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // ===== 3. 构造请求体 =====
  let chatMessages = [...messages];

  // 如果开启深度思考，在系统提示词中加入“先推理再回答”的指令
  if (deep_think) {
    // 找到系统提示词（如果有）
    const systemIndex = chatMessages.findIndex(m => m.role === 'system');
    if (systemIndex !== -1) {
      // 已有系统提示词，追加深度思考指令
      chatMessages[systemIndex].content += '\n\n【深度思考模式】请在回答之前，先进行详细推理，将推理过程放在 <思考> 标签中，然后再给出最终答案。';
    } else {
      // 没有系统提示词，插入一条
      chatMessages.unshift({
        role: 'system',
        content: '【深度思考模式】请在回答之前，先进行详细推理，将推理过程放在 <思考> 标签中，然后再给出最终答案。',
      });
    }
  }

  // ===== 4. 调用 DeepSeek API =====
  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: chatMessages,
        stream,
        max_tokens: deep_think ? 4096 : 2048,  // 深度思考时允许更长输出
        temperature: deep_think ? 0.5 : 0.7,    // 深度思考时更聚焦
      }),
    });

    if (stream) {
      return new Response(response.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } else {
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: '服务器内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
