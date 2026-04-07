const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

/**
 * 校验用户登录状态
 */
async function checkAuth(userId, sessionToken) {
  if (!userId || !sessionToken) throw new Error('登录状态已失效，请重新登录');
  
  const userRes = await db.collection('users').doc(userId).get();
  const user = userRes.data;
  
  if (!user) throw new Error('用户不存在');
  if (user.sessionToken !== sessionToken) throw new Error('登录状态已失效，请重新登录');
  
  const expireAt = user.sessionExpireAt ? new Date(user.sessionExpireAt).getTime() : 0;
  if (expireAt && expireAt > 0 && expireAt <= Date.now()) {
    throw new Error('登录已过期，请重新登录');
  }
  
  // 续期
  await db.collection('users').doc(userId).update({
    data: { sessionExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
  });
  
  return user;
}

exports.main = async (event, context) => {
  const { action, userId, sessionToken, saleId } = event;
  
  try {
    const userInfo = await checkAuth(userId, sessionToken);
    
    // 确认收款逻辑
    if (action === 'confirmPayment') {
      if (!saleId) return { success: false, message: '缺少订单信息' };
      
      const saleRes = await db.collection('sale').doc(saleId).get();
      const sale = saleRes.data;
      
      if (!sale) return { success: false, message: '订单不存在' };
      
      // 权限检查：root用户或该销售单的所属人
      if (userInfo.role !== 'root' && sale.sellerId !== userId) {
        return { success: false, message: '没有权限操作这笔订单' };
      }
      
      await db.collection('sale').doc(saleId).update({
        data: { 
          payStatus: 'paid', 
          payTime: db.serverDate() 
        }
      });
      
      return { success: true, message: '确认收款成功' };
    }
    
    return { success: false, message: '未知操作' };
  } catch (err) {
    console.error('云函数执行失败:', err);
    return { success: false, message: err.message || '操作失败' };
  }
};
