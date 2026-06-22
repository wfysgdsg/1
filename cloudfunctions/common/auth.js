/**
 * 云函数共享模块 — 用户认证
 * 使用方式：复制此文件到云函数目录，然后 const { checkAuth } = require('./auth');
 */

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 校验用户登录状态，通过后续期 session
 * @param {string} userId
 * @param {string} token sessionToken
 * @param {boolean} needRoot 是否要求管理员权限
 * @returns {Object} user 文档
 */
async function checkAuth(userId, token, needRoot) {
  if (!userId || !token) {
    throw new Error('登录状态已失效，请重新登录');
  }

  const userRes = await db.collection('users').doc(userId).get();
  const user = userRes.data;

  if (!user) throw new Error('用户不存在');
  if (user.sessionToken !== token) throw new Error('登录状态已失效，请重新登录');

  const expireAt = user.sessionExpireAt ? new Date(user.sessionExpireAt).getTime() : 0;
  if (expireAt > 0 && expireAt <= Date.now()) {
    throw new Error('登录已过期，请重新登录');
  }

  if (needRoot && user.role !== 'root') {
    throw new Error('没有权限执行该操作');
  }

  // 续期 30 天
  await db.collection('users').doc(userId).update({
    data: { sessionExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
  });

  return user;
}

module.exports = { checkAuth };
