// 测试同步商品云函数
// 复制到微信开发者工具的控制台执行

wx.cloud.callFunction({
  name: 'syncGoods',
  data: { action: 'sync' }
}).then(res => {
  console.log('同步结果:', res.result);
}).catch(err => {
  console.error('调用失败:', err);
});
