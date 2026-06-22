/**
 * 密码哈希 / 校验统一工具
 *
 * 用法：把本文件分别复制到两个云函数目录下：
 *   cloudfunctions/authLogin/pwdCrypto.js
 *   cloudfunctions/userManage/pwdCrypto.js
 * 然后在 index.js 里：  const pwd = require('./pwdCrypto');
 *
 * 设计目标：
 *   1. 校验按 user.pwdAlgo 精确走，不再靠 try/catch 猜算法
 *   2. 老用户（sha256 / 无盐明文）永远能验证通过
 *   3. 校验与“升级写入”解耦，升级失败也不影响本次登录
 */
const crypto = require('crypto');

const SCRYPT_KEYLEN = 64;
// 显式参数，避免不同 Node 默认值差异；maxmem 留足（默认 N=16384,r=8 约需 16MB）
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function sha256(pwd, salt) {
  return crypto.createHash('sha256').update(pwd + salt).digest('hex');
}

function scrypt(pwd, salt) {
  return crypto.scryptSync(pwd, salt, SCRYPT_KEYLEN, SCRYPT_OPTS).toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

// 定长安全比较，防时序攻击；长度不一致直接 false
function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// 推断存量数据的算法：有 pwdAlgo 用 pwdAlgo；否则有 salt 当 sha256，无 salt 当明文老用户
function algoOf(user) {
  if (user && user.pwdAlgo) return user.pwdAlgo;
  return user && user.salt ? 'sha256' : 'plain';
}

// 唯一校验入口。user 需含 password / salt / (可选) pwdAlgo
function verifyPassword(pwd, user) {
  if (!user || typeof pwd !== 'string') return false;
  switch (algoOf(user)) {
    case 'scrypt':
      return safeEq(scrypt(pwd, user.salt), user.password);
    case 'sha256':
      return safeEq(sha256(pwd, user.salt), user.password);
    case 'plain':
      return safeEq(pwd, user.password); // 无盐明文老用户
    default:
      return false;
  }
}

// 生成一份“写入用”的 scrypt 密码字段（含算法标识）
function buildScryptFields(pwd) {
  const salt = generateSalt();
  return { password: scrypt(pwd, salt), salt: salt, pwdAlgo: 'scrypt' };
}

// 是否需要升级（非 scrypt 即需升级）
function needsUpgrade(user) {
  return algoOf(user) !== 'scrypt';
}

module.exports = {
  SCRYPT_KEYLEN,
  sha256,
  scrypt,
  generateSalt,
  safeEq,
  algoOf,
  verifyPassword,
  buildScryptFields,
  needsUpgrade,
};
