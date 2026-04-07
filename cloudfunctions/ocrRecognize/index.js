/**
 * 大模型智能识别云函数 (阿里云百炼版)
 * 功能：调用 Qwen-VL 识别图片/语音并精准解析业务数据
 * 修复：添加用户认证
 */
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 校验用户登录状态
 */
async function checkAuth(userId, sessionToken) {
  if (!userId || !sessionToken) {
    throw new Error('登录状态已失效，请重新登录');
  }

  const userRes = await db.collection('users').doc(userId).get();
  const user = userRes.data;

  if (!user) {
    throw new Error('用户不存在');
  }

  if (user.sessionToken !== sessionToken) {
    throw new Error('登录状态已失效，请重新登录');
  }

  const expireAt = user.sessionExpireAt ? new Date(user.sessionExpireAt).getTime() : 0;
  if (expireAt > 0 && expireAt <= Date.now()) {
    throw new Error('登录已过期，请重新登录');
  }

  // 续期
  await db.collection('users').doc(userId).update({
    data: { sessionExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
  });

  return user;
}

exports.main = async (event, context) => {
  const { userId, sessionToken, fileId, text } = event;

  // 1. 校验登录状态
  try {
    await checkAuth(userId, sessionToken);
  } catch (authErr) {
    return { success: false, message: authErr.message };
  }

  // TODO: 上线前请在云函数环境变量中配置 ALIYUN_API_KEY
  const apiKey = process.env.ALIYUN_API_KEY || 'sk-428412f590234aee805e7a757340fbde';
  const baseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

  try {
    let messages = [];

    // --- 场景 A: 拍照识别 (包含图片) ---
    if (fileId) {
      const res = await cloud.getTempFileURL({ fileList: [fileId] });
      const imageUrl = res.fileList[0].tempFileURL;

      messages = [
        {
          role: "system",
          content: `你是一个专业的商品型号识别助手。用户的商品型号规则如下：
- 系列号示例：CTL-205, CTL-350, CTL-355, 1150等（注：没有GL系列！只有CTL系列！）
- 颜色后缀：xk(黑色), xc(蓝色), xy(黄色), xm(红色), HK(黑色), HC(蓝色), HY(黄色), HM(红色)
- 示例商品：巨威CTL-205HK黑色硒鼓, 巨威CTL-350HM红色硒鼓, 巨威CTL-355HY黄色硒鼓, 巨威1150xk, 原装1150xc
- 重要：CTL-205、CTL-350、CTL-355 是完全不同的型号！请务必精确识别每个数字！
- 注意：没有GL-355！如果图片模糊看不清，不要猜测，只输出你能确定的内容。

【重要】请只识别【数量】列，忽略价格列！数量一般在5-20个左右，不会超过50个！
请严格按照图片中的实际文字识别，只输出清单，格式为：'商品名称 x 数量'，每行一个，不要任何解释。`
        },
        {
          role: "user",
          content: [
            { type: "text", text: "请识别图片中的所有商品名称和数量（只识别数量列，忽略价格列）。" },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ];

      var model = "qwen3.6-plus";
    }
    // --- 场景 B: 语音识别/纯文本解析 ---
    else if (text) {
      messages = [
        {
          role: "system",
          content: `你是一个库存管理助手。用户的商品型号规则如下：
- 系列号示例：CTL-205, CTL-350, CTL-355, 1150等（注：没有GL系列！只有CTL系列！）
- 颜色后缀：xk(黑色), xc(蓝色), xy(黄色), xm(红色), HK(黑色), HC(蓝色), HY(黄色), HM(红色)
- 示例商品：巨威CTL-205HK黑色硒鼓, 巨威CTL-350HM红色硒鼓, 巨威CTL-355HY黄色硒鼓, 巨威1150xk, 原装1150xc
- 重要：CTL-205、CTL-350、CTL-355 是完全不同的型号！请务必精确识别每个数字！
请从用户的语音描述中提取商品名称和数量。按格式：'商品名称: 数量' 输出。支持'各XX个'的逻辑。只输出清单，不要废话。`
        },
        {
          role: "user",
          content: text
        }
      ];

      var model = "qwen3.6-plus";
    } else {
      return { success: false, message: '缺少识别参数' };
    }

    // 调用阿里云百炼接口（超时时间 50 秒，注意不要超过云函数超时限制）
    const response = await axios.post(baseUrl, {
      model: model,
      messages: messages
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 50000
    });

    const aiResult = response.data.choices[0].message.content;

    // 预处理：对 AI 返回内容进行别名映射，统一型号格式
    const processedResult = aiResult
      .replace(/ctl-200(?!5)/gi, 'ctl-205')  // CTL-200 -> CTL-205（200不存在，只有205）
      .replace(/gl-/gi, 'ctl-')              // GL- -> CTL-
      .replace(/lm(?=[^a-z])/gi, 'hm')       // LM -> HM
      .replace(/黑色粉/gi, '黑色硒鼓')
      .replace(/红色粉/gi, '红色硒鼓')
      .replace(/蓝色粉/gi, '蓝色硒鼓')
      .replace(/黄色粉/gi, '黄色硒鼓');

    console.log('========== OCR 识别结果 ==========');
    console.log('【AI原始输出】:', aiResult);
    console.log('【预处理后】:', processedResult);
    console.log('================================');

    return {
      success: true,
      data: processedResult,
      rawData: aiResult,
      message: '解析成功'
    };

  } catch (err) {
    console.error('AI解析失败:', err);
    console.error('错误类型:', err.name);
    console.error('错误消息:', err.message);
    console.error('err.response:', err.response ? JSON.stringify(err.response.data) : '无response');
    const errMsg = err.response ? JSON.stringify(err.response.data) : err.message;
    return {
      success: false,
      message: 'AI服务暂时不可用，请稍后重试',
      error: errMsg,
      errType: err.name,
      errMsg: err.message
    };
  }
};
