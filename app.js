/**
 * 小程序入口文件 (反编译还原整理)
 * 整理日期：2024-03-26
 */
App({
  onLaunch: function () {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-2ge7cnabdf71d405',
        traceUser: true
      });
    }

    // 全局云函数调用拦截：登录过期自动踢回登录页
    var origCall = wx.cloud.callFunction;
    wx.cloud.callFunction = function (options) {
      return origCall.call(wx.cloud, options).then(function (res) {
        // 检查成功返回中是否包含登录过期
        if (res && res.result && res.result.message) {
          var msg = res.result.message;
          if (msg.indexOf('登录状态已失效') >= 0 || msg.indexOf('登录已过期') >= 0) {
            kickToLogin();
          }
        }
        return res;
      }).catch(function (err) {
        var msg = String(err.errMsg || err.message || '');
        if (msg.indexOf('登录状态已失效') >= 0 || msg.indexOf('登录已过期') >= 0) {
          kickToLogin();
          // 吞掉错误，不让页面的 toast 弹出来抢镜
          return {};
        }
        throw err;
      });
    };

    function kickToLogin() {
      wx.removeStorageSync('userInfo');
      wx.removeStorageSync('sessionToken');
      wx.removeStorageSync('rememberToken');
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },
});
