/**
 * 用户身份验证云函数
 * 功能：登录、修改密码、Session 管理
 * 整理日期：2024-03-26
 */
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * SHA256 哈希加密
 */
function hashPassword(password, salt) {
  return crypto
    .createHash('sha256')
    .update(password + salt)
    .digest('hex');
}

/**
 * 生成随机盐值
 */
function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 生成随机 Session Token
 */
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 更新用户的 Session 信息
 */
async function updateSession(userId) {
  const token = generateToken();
  const expireAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30天后过期
  
  await db.collection('users').doc(userId).update({
    data: {
      sessionToken: token,
      sessionExpireAt: expireAt
    }
  });
  
  return {
    sessionToken: token,
    sessionExpireAt: expireAt
  };
}

exports.main = async (event, context) => {
  const { action, username, password, oldPassword, newPassword, userId, sessionToken } = event;

  try {
    // --- 登录逻辑 ---
    if (action === 'login') {
      if (!username || !password) {
        return { success: false, message: '请输入用户名和密码' };
      }

      const userRes = await db.collection('users')
        .where({ username })
        .field({
          _id: true,
          username: true,
          name: true,
          role: true,
          password: true,
          salt: true
        })
        .get();

      if (userRes.data.length === 0) {
        return { success: false, message: '用户不存在' };
      }

      const user = userRes.data[0];
      
      // 识别是否为预处理后的密码哈希值（32位MD5）
      const isMd5Received = /^[a-f0-9]{32}$/i.test(password);
      
      let hashedPassword = hashPassword(password, user.salt);

      // 验证逻辑
      if (hashedPassword !== user.password) {
        // 兼容逻辑：处理迁移过程中可能存在的明文/旧哈希对比
        // 如果存储的是明文（历史残留），则直接对比
        if (!user.salt && password === user.password) {
          // OK
        } else {
          return { success: false, message: '密码错误' };
        }
      }

      // 登录成功，更新 session
      const session = await updateSession(user._id);

      return {
        success: true,
        userInfo: {
          _id: user._id,
          username: user.username,
          name: user.name,
          role: user.role,
          sessionToken: session.sessionToken,
          sessionExpireAt: session.sessionExpireAt
        }
      };
    }

    // --- 修改密码逻辑 ---
    if (action === 'updatePassword') {
      if (!userId || !oldPassword || !newPassword) {
        return { success: false, message: '参数不完整' };
      }

      const userRes = await db.collection('users').doc(userId).get();
      if (!userRes.data) return { success: false, message: '用户不存在' };

      const user = userRes.data;
      if (hashPassword(oldPassword, user.salt) !== user.password) {
        return { success: false, message: '原密码不正确' };
      }

      const newSalt = generateSalt();
      const newHashedPassword = hashPassword(newPassword, newSalt);

      await db.collection('users').doc(userId).update({
        data: {
          password: newHashedPassword,
          salt: newSalt
        }
      });

      return { success: true, message: '密码修改成功' };
    }

    // --- Session 校验 ---
    if (action === 'checkSession') {
      if (!userId || !sessionToken) return { success: false };

      const userRes = await db.collection('users').doc(userId).get();
      if (!userRes.data) return { success: false };

      const user = userRes.data;
      const now = new Date();

      if (user.sessionToken === sessionToken && user.sessionExpireAt > now) {
        return { success: true };
      }

      return { success: false, message: '登录已过期' };
    }

    return { success: false, message: '未知操作' };

  } catch (err) {
    console.error(err);
    return { success: false, message: '服务器错误', error: err };
  }
};
