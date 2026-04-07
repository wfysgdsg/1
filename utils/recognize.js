/**
 * OCR/语音识别公共工具
 * 功能：封装拍照/相册选择、OCR识别、语音识别的公共流程
 */
const { matchGoodsFromOcr } = require('./ocr');

/**
 * 获取当前登录信息
 */
function getAuthInfo() {
  const userInfo = wx.getStorageSync('userInfo');
  const userId = userInfo ? userInfo._id : '';
  const sessionToken = wx.getStorageSync('sessionToken');
  return { userId, sessionToken };
}

/**
 * 拍照/相册选择识别
 * @param {Object} ctx Page 上下文
 * @param {string} cloudFunctionName 云函数名称，如 'ocrRecognize'
 * @returns {Promise<string|null>} 返回识别的文字，失败返回 null
 */
async function takePhotoAndRecognize(ctx, cloudFunctionName = 'ocrRecognize') {
  return new Promise((resolve) => {
    wx.showActionSheet({
      itemList: ['拍照识别', '从相册选择'],
      success: (res) => {
        const source = res.tapIndex === 0 ? ['camera'] : ['album'];
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: source,
          success: async (mediaRes) => {
            const filePath = mediaRes.tempFiles[0].tempFilePath;
            const text = await uploadAndRecognize(ctx, cloudFunctionName, filePath);
            resolve(text);
          },
          fail: () => resolve(null),
        });
      },
      fail: () => resolve(null),
    });
  });
}

/**
 * 上传文件并调用 OCR 识别
 * @param {Object} ctx Page 上下文
 * @param {string} cloudFunctionName 云函数名称
 * @param {string} filePath 文件路径
 * @returns {Promise<string|null>}
 */
async function uploadAndRecognize(ctx, cloudFunctionName, filePath) {
  const { userId, sessionToken } = getAuthInfo();

  wx.showLoading({ title: '识别中...' });
  ctx.setData({ isRecognizing: true });

  try {
    // 压缩图片（提高速度）
    const compressedPath = await new Promise((resolve) => {
      wx.compressImage({
        src: filePath,
        quality: 50,  // 压缩质量 50%
        success: (res) => resolve(res.tempFilePath),
        fail: () => resolve(filePath)  // 失败则用原图
      });
    });

    const cloudPath = `recognize/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: compressedPath });
    const fileId = uploadRes.fileID;

    const ocrRes = await wx.cloud.callFunction({
      name: cloudFunctionName,
      data: { userId, sessionToken, fileId }
    });

    if (!ocrRes.result) {
      throw new Error('识别服务异常，请稍后重试');
    }

    if (!ocrRes.result.success) {
      throw new Error(ocrRes.result.message || '识别失败，请重试');
    }

    const ocrData = ocrRes.result.data;

    if (!ocrData || !ocrData.trim()) {
      wx.showToast({ title: '未能识别出文字，请重试', icon: 'none' });
      return null;
    }

    return ocrData;

  } catch (err) {
    wx.showToast({ title: err.message || '识别失败，请重试', icon: 'none' });
    return null;
  } finally {
    wx.hideLoading();
    ctx.setData({ isRecognizing: false });
  }
}

/**
 * 开始录音
 * @param {Object} ctx Page 上下文
 */
function startVoice(ctx) {
  const recorderManager = wx.getRecorderManager();
  ctx.setData({ isVoiceRecording: true });

  recorderManager.onStart(() => {
    console.log('开始录音');
  });

  recorderManager.start({
    duration: 60000,
    sampleRate: 16000,
    numberOfChannels: 1,
    encodeBitRate: 48000,
    format: 'mp3'
  });

  // 将 recorderManager 挂在 ctx 上，供 stopVoice 使用
  ctx.recorderManager = recorderManager;
  return recorderManager;
}

/**
 * 停止录音并识别
 * @param {Object} ctx Page 上下文
 * @returns {Promise<string|null>} 返回识别的文字，失败返回 null
 */
async function stopVoice(ctx) {
  const recorderManager = ctx.recorderManager;
  if (!recorderManager) return null;

  ctx.setData({ isVoiceRecording: false });

  return new Promise((resolve) => {
    recorderManager.onStop(async (res) => {
      const { tempFilePath } = res;
      const { userId, sessionToken } = getAuthInfo();

      wx.showLoading({ title: '正在识别...' });

      try {
        const cloudPath = `voice/${Date.now()}.mp3`;
        const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath });
        const fileId = uploadRes.fileID;

        const voiceRes = await wx.cloud.callFunction({
          name: 'voiceRecognize',
          data: { userId, sessionToken, fileId }
        });

        if (!voiceRes.result) {
          throw new Error('语音识别服务异常，请重试');
        }

        if (!voiceRes.result.success) {
          throw new Error(voiceRes.result.message || '语音识别失败');
        }

        const recognizedText = voiceRes.result.data;

        if (!recognizedText || !recognizedText.trim()) {
          wx.showToast({ title: '未能听清内容，请重试', icon: 'none' });
          resolve(null);
          return;
        }

        resolve(recognizedText);

      } catch (err) {
        wx.showToast({ title: err.message || '语音服务暂时不可用', icon: 'none' });
        resolve(null);
      } finally {
        wx.hideLoading();
      }
    });

    recorderManager.stop();
  });
}

/**
 * 处理识别结果（匹配商品并应用）
 * @param {Object} ctx Page 上下文
 * @param {string} recognizedText 识别出的文字
 * @param {Function} applyCallback 应用到列表的回调，接收 matched 数组
 */
async function handleRecognizedResult(ctx, recognizedText, applyCallback) {
  let matched = [];
  let debugInfo = '';

  try {
    matched = await matchGoodsFromOcr(recognizedText);
  } catch (err) {
    console.error('matchGoodsFromOcr 出错:', err);
    wx.showToast({ title: '匹配过程出错: ' + err.message, icon: 'none' });
    return;
  }

  // 获取调试信息
  try {
    debugInfo = wx.getStorageSync('ocrDebugInfo') || '';
  } catch (e) {
    debugInfo = '';
  }

  // 防御：debugInfo 过长会导致 showModal 失败，截断到 8000 字符
  const MAX_LEN = 8000;
  const displayInfo = debugInfo.length > MAX_LEN ? debugInfo.substring(0, MAX_LEN) + '\n...[截断]' : debugInfo;

  if (matched.length > 0) {
    ctx.setData({ recognizedGoods: matched });
    applyCallback(matched);
    wx.showToast({ title: `识别到 ${matched.length} 种商品`, icon: 'success' });

    // 也显示调试信息（用户可查看匹配过程）
    if (displayInfo) {
      setTimeout(() => {
        wx.showModal({
          title: `识别到 ${matched.length} 种商品（调试信息）`,
          content: displayInfo,
          showCancel: true,
          cancelText: '关闭',
          confirmText: '复制',
          success: (res) => {
            if (res.confirm) {
              const dataToCopy = (debugInfo || recognizedText || '').trim();
              if (!dataToCopy) {
                wx.showToast({ title: '无内容可复制', icon: 'none' });
                return;
              }
              wx.setClipboardData({
                data: dataToCopy,
                complete: () => {} // 先不打扰用户，让复制自然完成
              });
              wx.showToast({ title: '已复制到剪贴板', icon: 'success', duration: 1500 });
            }
          }
        });
      }, 1500);
    }
  } else {
    const failContent = displayInfo || ('识别到以下内容：\n' + (recognizedText || '').substring(0, 200) + '\n\n请手动录入');
    wx.showModal({
      title: '未能匹配商品',
      content: failContent,
      showCancel: true,
      cancelText: '关闭',
      confirmText: '复制',
      success: (res) => {
        if (res.confirm) {
          const dataToCopy = (debugInfo || recognizedText || '').trim();
          if (!dataToCopy) {
            wx.showToast({ title: '无内容可复制', icon: 'none' });
            return;
          }
          wx.setClipboardData({
            data: dataToCopy,
            complete: () => {}
          });
          wx.showToast({ title: '已复制到剪贴板', icon: 'success', duration: 1500 });
        }
      }
    });
  }
}

module.exports = {
  takePhotoAndRecognize,
  uploadAndRecognize,
  startVoice,
  stopVoice,
  handleRecognizedResult,
  getAuthInfo,
};
