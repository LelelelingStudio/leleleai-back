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
    console.error('❌ DeepSeek API Key 未配置');
    return res.status(500).json({ error: 'DeepSeek API Key 未配置，请在 Vercel 环境变量中设置 DEEPSEEK_API_KEY' });
  }

  // ===== 5. 解析请求体 =====
  // 【修改1】stream 默认值从 false 改为 true，避免非流式超时
  const { messages, model = 'deepseek-v4-flash', stream = true } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages 字段必须是一个非空数组' });
  }

  // 【新增】记录请求日志（便于 Vercel 调试）
  console.log(`📨 收到请求，模型: ${model}，流式: ${stream}，消息数: ${messages.length}`);

  try {
    // ===== 6. 构造 DeepSeek API 请求 =====
    const requestBody = {
      model: model,
      messages: messages,
      stream: stream,
      // 【新增】可选：控制生成参数，提升响应速度
      max_tokens: 2048,          // 限制最大输出长度，避免生成过长导致超时
      temperature: 0.7,          // 控制随机性
    };

    // 【新增】设置 fetch 超时（Vercel 本身有 10 秒硬限制，但加上可以让错误更明确）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000); // 9 秒，留 1 秒给 Vercel 冷启动

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal, // 【新增】支持 abort
    });

    clearTimeout(timeoutId); // 清除超时定时器

    // ===== 7. 处理流式响应 =====
    if (stream) {
      // 【修改2】检查 DeepSeek 响应状态，如果错误则返回错误 JSON（流式错误也要处理）
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ DeepSeek 流式响应错误:', response.status, errorText);
        return res.status(response.status).json({ 
          error: `DeepSeek API 错误: ${response.status}`,
          details: errorText 
        });
      }

      // 设置 SSE 响应头
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // 【新增】禁用 Nginx 缓冲，让流实时到达前端
      });

      // 【修改3】将 DeepSeek 的流透传给前端，并处理流结束/错误
      response.body.pipe(res);
      
      // 【新增】监听流错误，避免前端挂起
      response.body.on('error', (err) => {
        console.error('❌ 流传输错误:', err);
        res.end();
      });

      // 【新增】监听流结束，确保连接关闭
      response.body.on('end', () => {
        console.log('✅ 流式响应传输完成');
        res.end();
      });

      return;
    }

    // ===== 8. 非流式：读取 JSON 并返回（基本不会走这个分支了，因为 stream 默认 true） =====
    const data = await response.json();

    if (data.error) {
      console.error('❌ DeepSeek 非流式错误:', data.error);
      return res.status(response.status || 400).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    // 【修改4】区分超时错误和其他错误
    if (error.name === 'AbortError') {
      console.error('⏱️ 请求 DeepSeek 超时（9秒）');
      return res.status(504).json({ error: 'DeepSeek API 响应超时，请稍后再试' });
    }
    console.error('❌ 代理请求失败:', error.message);
    return res.status(500).json({ error: '内部服务器错误，请稍后再试' });
  }
};
