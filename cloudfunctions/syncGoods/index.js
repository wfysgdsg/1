/**
 * 商品同步云函数
 * 功能：从 goods.json 同步商品到数据库
 */
const cloud = require('wx-server-sdk');
const fs = require('fs');
const path = require('path');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 商品数据（从 goods.json 读取）
const goodsData = [
  { name: "巨威1150xk", unit: "台", salePrice: 350, costPrice: 78 },
  { name: "巨威1150xm", unit: "台", salePrice: 350, costPrice: 78 },
  { name: "巨威1150xc", unit: "台", salePrice: 350, costPrice: 78 },
  { name: "巨威1150xy", unit: "台", salePrice: 350, costPrice: 78 },
  { name: "原装1150xk", unit: "台", salePrice: 600, costPrice: 478 },
  { name: "原装1150xm", unit: "台", salePrice: 529, costPrice: 423 },
  { name: "原装1150xc", unit: "台", salePrice: 529, costPrice: 423 },
  { name: "原装1150xy", unit: "台", salePrice: 529, costPrice: 423 },
  { name: "巨威CTL-350HK黑色硒鼓", unit: "支", salePrice: 718, costPrice: 146 },
  { name: "巨威CTL-350HM红色硒鼓", unit: "支", salePrice: 718, costPrice: 146 },
  { name: "巨威CTL-350HY黄色硒鼓", unit: "支", salePrice: 718, costPrice: 146 },
  { name: "巨威CTL-350HC蓝色硒鼓", unit: "支", salePrice: 718, costPrice: 146 },
  { name: "巨威CTL-205HK黑色硒鼓", unit: "支", salePrice: 270, costPrice: 72 },
  { name: "巨威CTL-205HM红色硒鼓", unit: "支", salePrice: 270, costPrice: 72 },
  { name: "巨威CTL-205HY黄色硒鼓", unit: "支", salePrice: 270, costPrice: 72 },
  { name: "巨威CTL-205HC蓝色硒鼓", unit: "支", salePrice: 270, costPrice: 72 },
  { name: "TN328易加粉粉盒", unit: "支", salePrice: 160, costPrice: 45 }
];

exports.main = async (event, context) => {
  const { action } = event;

  try {
    // 获取当前数据库中的商品数量
    const countRes = await db.collection('goods').count();
    const currentCount = countRes.total;

    // 清空并重新导入（可选）
    if (action === 'clear') {
      console.log('清空商品库...');
      while (currentCount > 0) {
        const batch = await db.collection('goods').limit(100).get();
        for (const item of batch.data) {
          await db.collection('goods').doc(item._id).remove();
        }
      }
      console.log('已清空商品库');
    }

    // 批量添加商品
    let added = 0;
    let skipped = 0;

    for (const goods of goodsData) {
      // 检查是否已存在
      const existRes = await db.collection('goods').where({
        name: goods.name
      }).get();

      if (existRes.data.length > 0) {
        // 更新现有商品
        await db.collection('goods').doc(existRes.data[0]._id).update({
          data: {
            unit: goods.unit,
            salePrice: goods.salePrice,
            costPrice: goods.costPrice,
            userStock: existRes.data[0].userStock || 0
          }
        });
        skipped++;
        console.log(`更新: ${goods.name}`);
      } else {
        // 添加新商品
        await db.collection('goods').add({
          data: {
            ...goods,
            userStock: 0,
            createTime: new Date()
          }
        });
        added++;
        console.log(`添加: ${goods.name}`);
      }
    }

    // 验证：同步后检查数据库里的所有商品名称
    const verifyRes = await db.collection('goods').field({ name: true }).get();
    console.log('【同步后验证】商品库所有名称:', verifyRes.data.map(g => g.name).join(', '));

    return {
      success: true,
      message: `同步完成！新增 ${added} 个，更新 ${skipped} 个`,
      added,
      skipped,
      total: goodsData.length,
      verifyGoods: verifyRes.data.map(g => g.name)
    };

  } catch (err) {
    console.error('同步失败:', err);
    return {
      success: false,
      message: '同步失败: ' + err.message,
      error: err.message
    };
  }
};
