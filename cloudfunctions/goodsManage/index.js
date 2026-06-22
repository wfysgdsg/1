const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const { checkAuth } = require('./auth');

exports.main = async (event, context) => {
  const { action, userId, sessionToken, goodsId, data } = event;

  try {
    const userInfo = await checkAuth(userId, sessionToken);

    if (userInfo.role !== 'root') {
      return { success: false, message: '仅管理员可操作商品库' };
    }

    if (action === 'update') {
      if (!goodsId) return { success: false, message: '缺少商品ID' };

      const updateData = { ...data, updateTime: db.serverDate() };
      await db.collection('goods').doc(goodsId).update({ data: updateData });

      return { success: true, message: '保存成功' };
    }

    if (action === 'add') {
      if (!data || !data.name) return { success: false, message: '缺少商品信息' };

      const addData = { ...data, createTime: db.serverDate(), updateTime: db.serverDate() };
      const res = await db.collection('goods').add({ data: addData });

      return { success: true, message: '添加成功', goodsId: res._id };
    }

    if (action === 'delete') {
      if (!goodsId) return { success: false, message: '缺少商品ID' };

      // 检查是否有未归还的借货
      const borrowCount = await db.collection('borrow').where({
        goodsId: goodsId,
        status: 'pending'
      }).count();

      if (borrowCount.total > 0) {
        return { success: false, message: '该商品尚有待归还的借货记录，请处理完后再删除' };
      }

      await db.collection('goods').doc(goodsId).remove();
      return { success: true, message: '删除成功' };
    }

    return { success: false, message: '未知操作' };
  } catch (err) {
    console.error('goodsManage 执行失败:', err);
    return { success: false, message: err.message || '操作失败' };
  }
};
