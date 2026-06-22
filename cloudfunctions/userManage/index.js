/**
 * 用户管理云函数
 * 功能：添加员工、删除员工、重置密码、修改密码
 * 升级：密码哈希统一走 pwdCrypto（按 pwdAlgo 精确校验 + 写入统一 scrypt）
 *
 * 注意：请把 pwdCrypto.js 复制到本云函数目录下。
 */
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const pwd = require('./pwdCrypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ★ L6: 密码强度校验（至少8位，含字母和数字）
function validatePassword(pwd) {
  if (!pwd || pwd.length < 8) return false;
  if (!/[a-zA-Z]/.test(pwd)) return false;
  if (!/\d/.test(pwd)) return false;
  return true;
}

const { checkAuth } = require('./auth');

async function deleteUserData(targetUserId) {
  const collections = [
    { name: 'borrow', key: 'borrowerId' },
    { name: 'sale', key: 'sellerId' },
    { name: 'user_goods', key: 'userId' }
  ];

  const result = {};
  for (const col of collections) {
    const countRes = await db.collection(col.name).where({ [col.key]: targetUserId }).count();
    if (countRes.total > 0) {
      result[col.name] = await db.collection(col.name).where({ [col.key]: targetUserId }).remove();
    }
  }

  const transferRes = await db.collection('transfer_requests').where(
    _.or([{ senderId: targetUserId }, { receiverId: targetUserId }])
  ).count();
  if (transferRes.total > 0) {
    result.transfer_requests = await db.collection('transfer_requests').where(
      _.or([{ senderId: targetUserId }, { receiverId: targetUserId }])
    ).remove();
  }

  return result;
}

exports.main = async (event, context) => {
  const { action, userId, sessionToken, targetUserId, newPassword, oldPassword, username, name, password } = event;

  try {
    // --- 修改密码 ---
    if (action === 'changePassword') {
      if (!oldPassword || !newPassword) {
        return { success: false, message: '参数不完整' };
      }

      // 先做鉴权（身份/会话有效性）
      await checkAuth(userId, sessionToken, false);

      // 重新拉取完整文档做密码校验，避免依赖 checkAuth 是否返回 password/salt/pwdAlgo
      const userRes = await db.collection('users').doc(userId).get();
      if (!userRes.data) return { success: false, message: '用户不存在' };
      const user = userRes.data;

      // 统一校验旧密码（兼容 sha256 / 无盐明文 / scrypt，无需再分支处理无盐老用户）
      if (!pwd.verifyPassword(oldPassword, user)) {
        return { success: false, message: '当前密码错误' };
      }

      const newToken = generateToken();
      const fields = pwd.buildScryptFields(newPassword);
      await db.collection('users').doc(userId).update({
        data: {
          password: fields.password,
          salt: fields.salt,
          pwdAlgo: fields.pwdAlgo,
          sessionToken: newToken,
          sessionExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          loginFails: 0,           // ★ M6: 改密后清空
          lockUntil: null,         // ★ M6: 改密后清空
          mustChangePwd: false,    // ★ H3: 改密后清除强制标记
        }
      });

      return { success: true, message: '密码修改成功', sessionToken: newToken };
    }

    // --- 更新个人资料（本人操作，无需管理员） ---
    if (action === 'updateProfile') {
      const { nickname, bio, avatarUrl } = event;
      const updateData = {};
      if (nickname !== undefined) {
        updateData.nickname = nickname;
        updateData.name = nickname;
      }
      if (bio !== undefined) updateData.bio = bio;
      if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

      if (Object.keys(updateData).length === 0) {
        return { success: false, message: '没有要更新的数据' };
      }

      await checkAuth(userId, sessionToken, false);
      await db.collection('users').doc(userId).update({ data: updateData });

      return { success: true, message: '资料已更新' };
    }

    // --- 以下操作需要管理员权限 ---
    if (action !== 'changePassword') {
      await checkAuth(userId, sessionToken, true);
    }

    // --- 删除员工 ---
    if (action === 'delete') {
      if (!targetUserId) return { success: false, message: '缺少目标用户' };
      if (targetUserId === userId) return { success: false, message: '不能删除当前登录账号' };
      if (!password) return { success: false, message: '请输入管理员密码验证身份' };

      // 验证管理员密码（统一校验，兼容老算法）
      const adminRes = await db.collection('users').doc(userId).get();
      if (!adminRes.data) return { success: false, message: '管理员账号不存在' };
      if (!pwd.verifyPassword(password, adminRes.data)) {
        return { success: false, message: '管理员密码错误' };
      }

      const targetRes = await db.collection('users').doc(targetUserId).get();
      if (!targetRes.data) return { success: false, message: '目标用户不存在' };
      if (targetRes.data.role === 'root') return { success: false, message: '不能删除管理员账号' };

      const deleted = await deleteUserData(targetUserId);
      await db.collection('users').doc(targetUserId).remove();

      return { success: true, message: '删除成功', deleted };
    }

    // --- 重置密码 ---
    if (action === 'resetPassword') {
      if (!newPassword || !validatePassword(newPassword)) {
        return { success: false, message: '密码至少8位，且需包含字母和数字' };
      }

      const fields = pwd.buildScryptFields(newPassword);
      await db.collection('users').doc(targetUserId).update({
        data: { password: fields.password, salt: fields.salt, pwdAlgo: fields.pwdAlgo }
      });

      return { success: true, message: '密码已重置' };
    }

    // --- 添加员工 ---
    if (action === 'add') {
      if (!username) return { success: false, message: '用户名不能为空' };
      if (password && !validatePassword(password)) return { success: false, message: '密码至少8位，且需包含字母和数字' };

      const existRes = await db.collection('users').where({ username }).count();
      if (existRes.total > 0) return { success: false, message: '用户名已存在' };

      // ★ 未传密码则生成随机 8 位密码，并标记需强制改密
      const finalPassword = (password && password.trim()) ||
                            crypto.randomBytes(4).toString('hex');
      const fields = pwd.buildScryptFields(finalPassword);

      await db.collection('users').add({
        data: {
          username,
          name: name || username,
          password: fields.password,
          salt: fields.salt,
          pwdAlgo: fields.pwdAlgo,
          role: 'staff',
          mustChangePwd: !password,    // 没传密码则强制改密
          createTime: db.serverDate()
        }
      });

      return {
        success: true,
        message: '添加成功' + (!password ? '，初始密码：' + finalPassword + '（请告知员工尽快修改）' : ''),
        initialPassword: !password ? finalPassword : undefined
      };
    }

    return { success: false, message: '未知操作' };

  } catch (err) {
    console.error('userManage 错误:', err);
    return { success: false, message: err.message || '操作失败' };
  }
};
