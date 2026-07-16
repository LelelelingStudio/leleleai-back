const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

module.exports = async (req, res) => {
  // 只接受 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 检查 Key 是否配置
  if (!DEEPSEEK_API_KEY) {
    return res.status(500).json({ error: 'DeepSeek API Key 未配置，请在 Vercel 环境变量中设置 DEEPSEEK_API_KEY' });
  }

  const { messages, model = 'deepseek-chat', stream = false } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages 字段必须是一个数组' });
  }

  try {
    const requestBody = { model, messages, stream };

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    // 如果要求流式输出，直接透传流
    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      response.body.pipe(res);
      return;
    }

    // 非流式：返回 JSON
    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('代理请求失败:', error);
    return res.status(500).json({ error: '内部服务器错误' });
  }
};
