/**
 * 大模型智能识别云函数 (阿里云百炼版)
 * 功能：调用 Qwen3.5-Plus 或 Qwen2.5-VL 识别图片/语音并精准解析业务数据
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
    let model = "qwen3.5-plus"; // 默认使用最新的 Qwen3.5-Plus (支持图文)

    // --- 场景 A: 拍照识别 (包含图片) ---
    if (fileId) {
      const res = await cloud.getTempFileURL({ fileList: [fileId] });
      const imageUrl = res.fileList[0].tempFileURL;
      
      messages = [
        {
          role: "user",
          content: [
            { type: "text", text: "请识别图片中的商品清单。按格式：'名称: 数量' 输出所有条目。如果有规格型号请包含在名称中。只输出清单，不要解释。" },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ];
    } 
    // --- 场景 B: 语音识别/纯文本解析 ---
    else if (text) {
      messages = [
        {
          role: "system",
          content: "你是一个库存管理助手。请从用户的语音描述中提取商品名称和数量。按格式：'名称: 数量' 输出。支持'各XX个'的逻辑。只输出清单，不要废话。"
        },
        {
          role: "user",
          content: text
        }
      ];
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
