/**
 * 大模型智能识别云函数 (阿里云百炼版)
 * 功能：调用 Qwen-VL 识别图片/语音并精准解析业务数据
 * 整理日期：2024-03-26
 */
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const { fileId, text } = event;
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
      
      // 图片识别用 qwen-vl-plus
      var model = "qwen-vl-plus";
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
      
      // 文本用 qwen3.5-plus
      var model = "qwen3.5-plus";
    } else {
      return { success: false, message: '缺少识别参数' };
    }

    // 调用阿里云百炼接口
    const response = await axios.post(baseUrl, {
      model: model,
      messages: messages
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const aiResult = response.data.choices[0].message.content;

    return {
      success: true,
      data: aiResult,
      message: '解析成功'
    };

  } catch (err) {
    console.error('AI解析失败:', err);
    return {
      success: false,
      message: 'AI服务暂时不可用',
      error: err.response ? err.response.data : err.message
    };
  }
};
