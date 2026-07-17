// api/chat.js
// 使用 Edge Runtime，不受 10 秒超时限制
export const runtime = 'edge';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

export default async function handler(req) {
  // ===== 1. 处理 CORS 预检（OPTIONS） =====
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

  // ===== 2. 只允许 POST =====
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // ===== 3. 检查 API Key =====
  if (!DEEPSEEK_API_KEY) {
    console.error('❌ DeepSeek API Key 未配置');
    return new Response(JSON.stringify({ error: 'DeepSeek API Key 未配置，请在 Vercel 环境变量中设置 DEEPSEEK_API_KEY' }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // ===== 4. 解析请求体 =====
  let messages, model, stream;
  try {
    const body = await req.json();
    messages = body.messages;
    model = body.model || 'deepseek-v4-flash';
    stream = body.stream !== undefined ? body.stream : true;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages 字段必须是一个非空数组' }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  console.log(`📨 收到请求，模型: ${model}，流式: ${stream}，消息数: ${messages.length}`);

  try {
    // ===== 5. 构造 DeepSeek API 请求体 =====
    const requestBody = {
      model,
      messages,
      stream,
      max_tokens: 2048,
      temperature: 0.7,
    };

    // ===== 6. 调用 DeepSeek API =====
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    // ===== 7. 处理流式响应 =====
    if (stream) {
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ DeepSeek 流式响应错误:', response.status, errorText);
        return new Response(JSON.stringify({ 
          error: `DeepSeek API 错误: ${response.status}`,
          details: errorText,
        }), {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // 将 DeepSeek 的流直接返回给客户端（SSE 格式）
      return new Response(response.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // ===== 8. 非流式（几乎不会走这里） =====
    const data = await response.json();
    if (data.error) {
      console.error('❌ DeepSeek 非流式错误:', data.error);
      return new Response(JSON.stringify(data), {
        status: response.status || 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('❌ 代理请求失败:', error.message);
    return new Response(JSON.stringify({ error: '内部服务器错误，请稍后再试' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
