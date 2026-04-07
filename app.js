/**
 * 小程序入口文件 (反编译还原整理)
 * 整理日期：2024-03-26
 */
App({
  onLaunch: function () {
    // 微信云开发初始化
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        // 云环境 ID
        env: 'cloud1-2ge7cnabdf71d405',
        // 是否在控制台查看用户访问记录
        traceUser: true
      });
    }

    // 全局数据
    this.globalData = {
      userInfo: null,
      isLogged: false
    };
  },
});
