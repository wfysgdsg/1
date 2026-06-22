/**
 * 客户/联系人管理云函数
 * 替代前端直写，服务端统一鉴权
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const { checkAuth } = require('./auth');

exports.main = async (event, context) => {
  const { userId, sessionToken, action, collection, id, data } = event;

  try {
    await checkAuth(userId, sessionToken);

    if (!collection || !['customer','contacts'].includes(collection)) {
      return { success: false, message: '参数错误' };
    }

    const coll = db.collection(collection);

    if (action === 'add') {
      // ★ L8: 字段白名单，防止前端传入任意字段污染文档
      const doc = {
        name: String(data.name || '').slice(0, 100),
        type: ['customer', 'supplier', 'other'].includes(data.type) ? data.type : 'customer',
        note: String(data.note || '').slice(0, 500),
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
      };
      const res = await coll.add({ data: doc });
      return { success: true, _id: res._id };
    }

    if (action === 'update') {
      if (!id) return { success: false, message: '缺少ID' };
      const doc = {
        name: String(data.name || '').slice(0, 100),
        type: ['customer', 'supplier', 'other'].includes(data.type) ? data.type : 'customer',
        note: String(data.note || '').slice(0, 500),
        updateTime: db.serverDate(),
      };
      await coll.doc(id).update({ data: doc });
      return { success: true };
    }

    if (action === 'delete') {
      if (!id) return { success: false, message: '缺少ID' };
      await coll.doc(id).remove();
      return { success: true };
    }

    return { success: false, message: '未知操作' };
  } catch (err) {
    console.error('contactManage 错误:', err);
    return { success: false, message: err.message || '操作失败' };
  }
};
