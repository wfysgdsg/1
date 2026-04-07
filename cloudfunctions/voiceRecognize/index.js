/**
 * 语音识别云函数 (腾讯云 ASR 版本)
 * 功能：调用腾讯云一句话识别，将录音转为文字
 * 整理日期：2024-03-26
 */
const cloud = require('wx-server-sdk');
const tencentcloud = require('tencentcloud-sdk-nodejs');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const AsrClient = tencentcloud.asr.v20190614.Client;

exports.main = async (event, context) => {
  const { fileId } = event;
  
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;

  if (!secretId || !secretKey) {
    return { success: false, message: '密钥未配置' };
  }

  const client = new AsrClient({
    credential: { secretId, secretKey },
    region: 'ap-guangzhou',
    profile: {
      httpProfile: {
        endpoint: 'asr.tencentcloudapi.com',
      },
    },
  });

  try {
    // 1. 获取临时链接 (ASR 需要公网可访问的 URL 或 Base64)
    const res = await cloud.getTempFileURL({ fileList: [fileId] });
    const fileUrl = res.fileList[0].tempFileURL;

    // 2. 调用腾讯云一句话识别 (SentenceRecognition)
    // 微信录音默认是 mp3 格式
    const params = {
      ProjectId: 0,
      SubServiceType: 2, // 一句话识别
      EngSerViceType: "16k_zh", // 中文
      SourceType: 0, // URL 方式
      VoiceFormat: "mp3",
      Url: fileUrl,
      DataLen: 0 // URL 方式下填 0
    };

    const result = await client.SentenceRecognition(params);

    if (result.Result) {
      return {
        success: true,
        data: result.Result, // 识别出的文字内容
        message: '语音识别成功'
      };
    } else {
      return { success: false, message: '未能听清语音内容' };
    }

  } catch (err) {
    console.error('ASR识别异常:', err);
    return {
      success: false,
      message: '识别服务异常',
      error: err.code || err.message
    };
  }
};
