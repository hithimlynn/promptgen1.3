// API 测试脚本

const apiKey = 'sk-sp-5ec93b5673844400855b03db10156bbb';
const baseUrl = 'https://coding.dashscope.aliyuncs.com/v1';

async function testAPI() {
  console.log('🚀 开始测试API接口...\n');
  console.log(`API Base URL: ${baseUrl}`);
  console.log(`API Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}\n`);

  const messages = [
    {
      role: 'user',
      content: '你好，请简要自我介绍'
    }
  ];

  const payload = {
    model: 'qwen3.5-plus',
    messages: messages,
    temperature: 0.7,
    max_tokens: 100
  };

  try {
    console.log('📤 发送请求...');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    console.log(`📊 状态码: ${response.status}\n`);

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ API 错误响应:');
      console.error(JSON.stringify(error, null, 2));
      return false;
    }

    const data = await response.json();
    console.log('✅ API 调用成功！\n');
    console.log('📬 响应数据:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      console.log('\n💬 AI 回复:');
      console.log(data.choices[0].message.content);
    }

    return true;
  } catch (error) {
    console.error('❌ 请求失败:');
    console.error(error.message);
    return false;
  }
}

testAPI().then(success => {
  process.exit(success ? 0 : 1);
});
