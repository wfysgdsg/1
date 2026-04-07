/**
 * 语音识别云函数 (腾讯云 ASR 版本)
 * 功能：调用腾讯云一句话识别，将录音转为文字
 * 修复：添加用户认证
 */
const cloud = require('wx-server-sdk');
const tencentcloud = require('tencentcloud-sdk-nodejs');

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
  const { userId, sessionToken, fileId } = event;

  // 1. 校验登录状态
  try {
    await checkAuth(userId, sessionToken);
  } catch (authErr) {
    return { success: false, message: authErr.message };
  }

  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;

  if (!secretId || !secretKey) {
    return { success: false, message: '语音服务未配置，请联系管理员' };
  }

  const AsrClient = tencentcloud.asr.v20190614.Client;
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
    // 获取临时链接
    const res = await cloud.getTempFileURL({ fileList: [fileId] });
    const fileUrl = res.fileList[0].tempFileURL;

    // 调用腾讯云一句话识别
    const params = {
      ProjectId: 0,
      SubServiceType: 2,
      EngSerViceType: "16k_zh",
      SourceType: 0,
      VoiceFormat: "mp3",
      Url: fileUrl,
      DataLen: 0
    };

    const result = await client.SentenceRecognition(params);

    if (result.Result) {
      return {
        success: true,
        data: result.Result,
        message: '语音识别成功'
      };
    } else {
      return { success: false, message: '未能听清语音内容' };
    }

  } catch (err) {
    console.error('ASR识别异常:', err);
    return {
      success: false,
      message: '语音服务异常',
      error: err.code || err.message
    };
  }
};
