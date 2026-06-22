/**
 * 安全数据查询云函数
 * 用途：替代前端直连数据库，在服务端做权限过滤
 * 修复：前端 if(role!=='root') 权限判断不可信，改为服务端强制注入归属条件
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const { checkAuth } = require('./auth');

// 允许查询的集合及其归属字段
const COLLECTION_CONFIG = {
  sale:          { ownerField: 'sellerId', allowRootAll: true },
  borrow:        { ownerField: 'borrowerId', allowRootAll: true },
  user_goods:    { ownerField: 'userId', allowRootAll: true },
  delivery_notes:{ ownerField: null, allowRootAll: true },
  goods:         { ownerField: null, allowRootAll: true },
  customer:      { ownerField: null, allowRootAll: true },
  contacts:      { ownerField: null, allowRootAll: true },
  users:         { ownerField: null, allowRootAll: false, rootOnly: true },
};

exports.main = async (event, context) => {
  var { userId, sessionToken, collection, where = {}, orderBy, skip = 0, limit = 20 } = event;

  try {
    var user = await checkAuth(userId, sessionToken);
    var cfg = COLLECTION_CONFIG[collection];

    if (!cfg) {
      return { success: false, message: '不允许查询该集合' };
    }

    // rootOnly 集合仅管理员可查
    if (cfg.rootOnly && user.role !== 'root') {
      return { success: false, message: '没有权限' };
    }

    // 构建查询条件：非 root 强制注入归属过滤（不可绕过）
    var cond = Object.assign({}, where);
    if (user.role !== 'root' && cfg.ownerField) {
      cond[cfg.ownerField] = userId;   // 服务端强制覆盖，前端传什么都无效
    }

    var safeLimit = Math.min(Number(limit) || 20, 100);
    var q = db.collection(collection).where(cond);

    if (orderBy && orderBy.field) {
      q = q.orderBy(orderBy.field, orderBy.order || 'desc');
    }

    var skipNum = Math.max(0, Number(skip) || 0);
    var [listRes, countRes] = await Promise.all([
      q.skip(skipNum).limit(safeLimit).get(),
      db.collection(collection).where(cond).count()
    ]);

    // 敏感字段脱敏（users 集合不返回密码/token 等）
    var data = listRes.data;
    if (collection === 'users') {
      data = data.map(function(u) {
        var clean = Object.assign({}, u);
        delete clean.password;
        delete clean.salt;
        delete clean.sessionToken;
        delete clean.sessionExpireAt;
        delete clean.rememberToken;
        delete clean.rememberTokenExpireAt;
        delete clean.loginFails;
        delete clean.lockUntil;
        return clean;
      });
    }

    return {
      success: true,
      data: data,
      total: countRes.total,
      skip: skipNum,
      limit: safeLimit
    };
  } catch (err) {
    console.error('queryData 错误:', err);
    return { success: false, message: err.message || '查询失败' };
  }
};
