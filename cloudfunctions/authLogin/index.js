/**
 * 用户身份验证云函数
 * 修复：rememberToken 过期 + 防爆破 + 错误脱敏
 * 升级：密码哈希统一走 pwdCrypto（按 pwdAlgo 精确校验 + 登录后透明升级 scrypt）
 *
 * 注意：请把 pwdCrypto.js 复制到本云函数目录下。
 */
const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const pwd = require('./pwdCrypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const REMEMBER_TTL = 30 * 24 * 60 * 60 * 1000;  // 记住登录 30 天
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;    // session 30 天
const MAX_LOGIN_FAILS = 5;
const LOCK_DURATION = 15 * 60 * 1000;             // 锁 15 分钟

function generateToken() { return crypto.randomBytes(32).toString('hex'); }

async function updateSession(userId, rememberToken) {
  var token = generateToken();
  var expireAt = new Date(Date.now() + SESSION_TTL);
  var updateData = { sessionToken: token, sessionExpireAt: expireAt };

  if (rememberToken) {
    updateData.rememberToken = rememberToken;
    updateData.rememberTokenExpireAt = new Date(Date.now() + REMEMBER_TTL);
  }

  await db.collection('users').doc(userId).update({ data: updateData });
  return { sessionToken: token, sessionExpireAt: expireAt };
}

// 登录成功后透明升级：非 scrypt 的存量哈希重新写为 scrypt。
// 与校验解耦：升级失败只记日志，不影响本次登录结果。
async function upgradeHashIfNeeded(userId, plainPwd, user) {
  if (!pwd.needsUpgrade(user)) return;
  try {
    await db.collection('users').doc(userId).update({
      data: pwd.buildScryptFields(plainPwd)
    });
  } catch (e) {
    console.error('密码哈希透明升级失败(不影响登录):', e && e.message);
  }
}

async function loginWithRememberToken(rememberToken) {
  if (!rememberToken) return null;
  var userRes = await db.collection('users')
    .where({ rememberToken: rememberToken })
    .field({ _id: true, username: true, name: true, role: true, rememberTokenExpireAt: true })
    .get();

  if (!userRes.data || userRes.data.length === 0) return null;

  var user = userRes.data[0];
  // 检查 rememberToken 是否过期
  if (user.rememberTokenExpireAt && new Date(user.rememberTokenExpireAt) < new Date()) {
    return null;
  }

  var session = await updateSession(user._id);
  return {
    _id: user._id, username: user.username, name: user.name, role: user.role,
    sessionToken: session.sessionToken, sessionExpireAt: session.sessionExpireAt
  };
}

// 记录一次登录失败（防爆破计数 / 锁定），返回统一失败响应
async function recordLoginFail(user, now) {
  var fails = (user.loginFails || 0) + 1;
  var failUpdate = { loginFails: fails };
  if (fails >= MAX_LOGIN_FAILS) {
    failUpdate.lockUntil = now + LOCK_DURATION;
    failUpdate.loginFails = 0;
  }
  await db.collection('users').doc(user._id).update({ data: failUpdate });
  return { success: false, message: '用户名或密码错误' };
}

exports.main = async (event, context) => {
  var { action, username, password, oldPassword, newPassword, userId, sessionToken } = event;

  try {
    // --- 登录 ---
    if (action === 'login') {
      if (!username || !password) return { success: false, message: '请输入用户名和密码' };

      var userRes = await db.collection('users')
        .where({ username })
        .field({ _id: true, username: true, name: true, role: true, password: true, salt: true, pwdAlgo: true, loginFails: true, lockUntil: true })
        .get();

      if (userRes.data.length === 0) return { success: false, message: '用户名或密码错误' };
      var user = userRes.data[0];

      // 防爆破：检查锁定
      var now = Date.now();
      if (user.lockUntil && user.lockUntil > now) {
        return { success: false, message: '尝试过于频繁，请15分钟后再试' };
      }

      // 统一校验：按 pwdAlgo 精确走，兼容 sha256 / 无盐明文 / scrypt
      if (!pwd.verifyPassword(password, user)) {
        return await recordLoginFail(user, now);
      }

      // 登录成功，重置计数
      await db.collection('users').doc(user._id).update({ data: { loginFails: 0, lockUntil: null } });
      // 透明升级（与校验解耦，失败不影响登录）
      await upgradeHashIfNeeded(user._id, password, user);
      var session = await updateSession(user._id);

      return {
        success: true,
        mustChangePwd: !!user.mustChangePwd,  // ★ H3: 前端据此强制跳转改密
        userInfo: {
          _id: user._id, username: user.username, name: user.name, role: user.role,
          sessionToken: session.sessionToken, sessionExpireAt: session.sessionExpireAt
        }
      };
    }

    // --- 记住登录 ---
    if (action === 'rememberLogin') {
      if (!username || !password) return { success: false, message: '请输入用户名和密码' };

      var userRes = await db.collection('users')
        .where({ username })
        .field({ _id: true, username: true, name: true, role: true, password: true, salt: true, pwdAlgo: true, loginFails: true, lockUntil: true })
        .get();

      if (!userRes.data || userRes.data.length === 0) return { success: false, message: '用户名或密码错误' };
      var user = userRes.data[0];

      var now = Date.now();
      if (user.lockUntil && user.lockUntil > now) {
        return { success: false, message: '尝试过于频繁，请15分钟后再试' };
      }

      // 与 login 用同一校验入口（修复：原先这里只有 SHA-256，没有 scrypt 兜底）
      if (!pwd.verifyPassword(password, user)) {
        return await recordLoginFail(user, now);
      }

      await db.collection('users').doc(user._id).update({ data: { loginFails: 0, lockUntil: null } });
      await upgradeHashIfNeeded(user._id, password, user);

      var rememberToken = generateToken();
      var session = await updateSession(user._id, rememberToken);

      return {
        success: true,
        mustChangePwd: !!user.mustChangePwd,  // ★ H3
        userInfo: {
          _id: user._id, username: user.username, name: user.name, role: user.role,
          sessionToken: session.sessionToken, sessionExpireAt: session.sessionExpireAt,
          rememberToken: rememberToken
        }
      };
    }

    // --- 自动登录 ---
    if (action === 'autoLogin') {
      var { rememberToken } = event;
      var userInfo = await loginWithRememberToken(rememberToken);
      if (!userInfo) return { success: false, message: '记住登录已失效，请重新登录' };
      return { success: true, userInfo: userInfo, isAutoLogin: true };
    }

    // --- 修改密码（同时清空 rememberToken 使所有设备下线）---
    if (action === 'updatePassword') {
      if (!userId || !oldPassword || !newPassword) return { success: false, message: '参数不完整' };
      // ★ L6: 密码强度校验
      if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
        return { success: false, message: '密码至少8位，且需包含字母和数字' };
      }

      var userRes = await db.collection('users').doc(userId).get();
      if (!userRes.data) return { success: false, message: '用户不存在' };
      var user = userRes.data;

      // 统一校验旧密码（兼容老算法）
      if (!pwd.verifyPassword(oldPassword, user)) {
        return { success: false, message: '原密码不正确' };
      }

      // 写入统一为 scrypt + pwdAlgo（修复：原先这里写的是 SHA-256，导致与 userManage 脑裂）
      var fields = pwd.buildScryptFields(newPassword);
      await db.collection('users').doc(userId).update({
        data: {
          password: fields.password,
          salt: fields.salt,
          pwdAlgo: fields.pwdAlgo,
          // 改密后清空所有旧 token
          rememberToken: null,
          rememberTokenExpireAt: null,
          sessionToken: generateToken(),
          loginFails: 0,           // ★ M6: 改密后清空
          lockUntil: null,         // ★ M6: 改密后清空
        }
      });

      return { success: true, message: '密码修改成功，所有设备已下线' };
    }

    // --- Session 校验 ---
    if (action === 'checkSession') {
      if (!userId || !sessionToken) return { success: false };
      var userRes = await db.collection('users').doc(userId).get();
      if (!userRes.data) return { success: false };
      var user = userRes.data;
      if (user.sessionToken === sessionToken && user.sessionExpireAt > new Date()) {
        return { success: true };
      }
      return { success: false, message: '登录已过期' };
    }

    return { success: false, message: '未知操作' };

  } catch (err) {
    console.error('authLogin 错误:', err);
    // 错误脱敏：不回传原始 error 对象
    return { success: false, message: err.message || '服务器错误' };
  }
};
