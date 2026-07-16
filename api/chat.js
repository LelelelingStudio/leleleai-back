// api/chat.js
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

module.exports = async (req, res) => {
  // ===== 1. CORS 头设置（必须放在最前面） =====
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // ===== 2. 处理预检请求（OPTIONS） =====
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ===== 3. 只允许 POST 方法 =====
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ===== 4. 检查 API Key 是否配置 =====
  if (!DEEPSEEK_API_KEY) {
    return res.status(500).json({ error: 'DeepSeek API Key 未配置，请在 Vercel 环境变量中设置 DEEPSEEK_API_KEY' });
  }

  // ===== 5. 解析请求体 =====
  const { messages, model = 'deepseek-v4-flash', stream = false } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 字段必须是一个非空数组' });
  }

  try {
    // ===== 6. 构造 DeepSeek API 请求 =====
    const requestBody = {
      model: model,
      messages: messages,
      stream: stream,
    };

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
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      // 直接将 DeepSeek 的流透传给前端
      response.body.pipe(res);
      return;
    }

    // ===== 8. 非流式：读取 JSON 并返回 =====
    const data = await response.json();

    // 如果 DeepSeek 返回错误（如余额不足、模型无效等），透传给前端
    if (data.error) {
      // 保留 HTTP 状态码，但 Vercel 会返回 200，我们手动设置状态码
      res.statusCode = response.status || 400;
      return res.json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('代理请求失败:', error);
    return res.status(500).json({ error: '内部服务器错误，请稍后再试' });
  }
};
