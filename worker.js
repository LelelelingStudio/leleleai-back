// Cloudflare Worker - DeepSeek API 代理（无超时限制）
export default {
  async fetch(request) {
    // 处理 CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (request.method !== 'POST') {
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

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: '无效的 JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const { messages, model = 'deepseek-v4-flash', stream = true, deep_think = false } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'messages 不能为空' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 深度思考模式
    let chatMessages = [...messages];
    if (deep_think) {
      const systemIndex = chatMessages.findIndex(m => m.role === 'system');
      if (systemIndex !== -1) {
        chatMessages[systemIndex].content += '\n\n【深度思考模式】请在回答之前，先进行详细推理，将推理过程放在 <思考> 标签中，然后再给出最终答案。';
      } else {
        chatMessages.unshift({
          role: 'system',
          content: '【深度思考模式】请在回答之前，先进行详细推理，将推理过程放在 <思考> 标签中，然后再给出最终答案。',
        });
      }
    }

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
          max_tokens: deep_think ? 4096 : 2048,
          temperature: deep_think ? 0.5 : 0.7,
        }),
      });

      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': stream ? 'text/event-stream' : 'application/json',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: '服务器内部错误' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }
};
