/**
 * 登录页面逻辑
 * 修复：不再存储明文密码，改用安全的记住令牌方案
 */
const REMEMBER_PWD_KEY = 'rememberPassword';
const AUTO_LOGIN_KEY = 'autoLogin';
const REMEMBERED_USER_KEY = 'rememberedUsername';
const REMEMBER_TOKEN_KEY = 'rememberToken';

Page({
  data: {
    username: '',
    password: '',
    showPassword: false,
    rememberPassword: false,
    autoLogin: false,
    autoLoginTried: false,
    focusedAccount: false,
    focusedPwd: false,
    uiText: {
      logo: '📦',
      title: '钒事如此货物记账',
      subtitle: 'Personal Asset Manager',
      account: '账号',
      accountPlaceholder: 'Username',
      password: '密码',
      passwordPlaceholder: 'Password',
      hide: '隐藏',
      show: '显示',
      rememberPassword: '记住密码',
      autoLogin: '自动登录',
      login: '登录',
      forgotPassword: '忘记密码',
      changePassword: '修改密码',
      firstLoginTip: '首次登录后请尽快修改密码',
    },
  },

  onLoad: function () {
    this.restoreLoginPreferences();
  },

  /**
   * 从本地缓存恢复登录偏好（记住密码、自动登录）
   * 修复：使用安全令牌替代明文密码存储
   */
  restoreLoginPreferences: function () {
    try {
      const isRemember = !!wx.getStorageSync(REMEMBER_PWD_KEY);
      const isAutoLogin = !!wx.getStorageSync(AUTO_LOGIN_KEY);
      const savedUser = wx.getStorageSync(REMEMBERED_USER_KEY) || '';
      const rememberToken = wx.getStorageSync(REMEMBER_TOKEN_KEY) || '';

      this.setData({
        rememberPassword: isRemember,
        autoLogin: isAutoLogin,
        username: savedUser,
        password: '', // 不再恢复密码，需要用户输入
      });

      // 如果开启了自动登录，且有记住令牌，且还没尝试过自动登录
      if (isAutoLogin && rememberToken && !this.data.autoLoginTried) {
        this.setData({ autoLoginTried: true });
        this.doAutoLogin(rememberToken);
      }
    } catch (e) {
      console.warn('读取本地缓存失败', e);
      this.clearRememberedCredentials();
    }
  },

  onUsernameInput: function (e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput: function (e) {
    this.setData({ password: e.detail.value });
  },

  onAccountFocus: function() {
    this.setData({ focusedAccount: true });
  },
  onAccountBlur: function() {
    this.setData({ focusedAccount: false });
  },
  onPwdFocus: function() {
    this.setData({ focusedPwd: true });
  },
  onPwdBlur: function() {
    this.setData({ focusedPwd: false });
  },

  togglePassword: function () {
    this.setData({ showPassword: !this.data.showPassword });
  },

  toggleRememberPassword: function () {
    const newVal = !this.data.rememberPassword;
    this.setData({
      rememberPassword: newVal,
      autoLogin: newVal && this.data.autoLogin,
    });
    if (!newVal) this.clearRememberedCredentials();
  },

  toggleAutoLogin: function () {
    const newVal = !this.data.autoLogin;
    this.setData({
      autoLogin: newVal,
      rememberPassword: newVal || this.data.rememberPassword,
    });
  },

  login: function () {
    this.doLogin(false);
  },

  /**
   * 通过记住令牌自动登录
   */
  async doAutoLogin(rememberToken) {
    wx.showLoading({ title: '自动登录中...' });

    try {
      const res = await wx.cloud.callFunction({
        name: 'authLogin',
        data: {
          action: 'autoLogin',
          rememberToken: rememberToken
        },
      });

      wx.hideLoading();

      const result = res.result;
      if (result && result.success) {
        const userInfo = result.userInfo;
        wx.setStorageSync('userInfo', userInfo);
        wx.setStorageSync('userId', userInfo._id);
        wx.setStorageSync('sessionToken', userInfo.sessionToken);

        wx.showToast({ title: '自动登录成功', icon: 'success' });

        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 800);
      } else {
        // 自动登录失败，清除记住令牌
        this.clearRememberedCredentials();
        wx.showToast({
          title: (result && result.message) || '自动登录失败，请重新登录',
          icon: 'none',
        });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('自动登录失败', err);
      wx.showToast({ title: '自动登录失败，请重新登录', icon: 'none' });
    }
  },

  /**
   * 执行登录逻辑
   * @param {boolean} isAuto 是否为自动登录（已废弃，保留兼容性）
   */
  async doLogin(isAuto = false) {
    const { username, password, rememberPassword } = this.data;

    if (!username || !password) {
      wx.showToast({ title: '请输入用户名和密码', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '登录中...' });

    try {
      // 调用云函数 - 根据是否记住密码选择不同的登录方式
      const res = await wx.cloud.callFunction({
        name: 'authLogin',
        data: {
          action: rememberPassword ? 'rememberLogin' : 'login',
          username: username,
          password: password
        },
      });

      wx.hideLoading();

      const result = res.result;
      if (result && result.success) {
        const userInfo = result.userInfo;

        wx.setStorageSync('userInfo', userInfo);
        wx.setStorageSync('userId', userInfo._id);
        wx.setStorageSync('sessionToken', userInfo.sessionToken);

        // 如果选择了记住密码，存储安全令牌而非密码
        if (rememberPassword && userInfo.rememberToken) {
          wx.setStorageSync(REMEMBER_PWD_KEY, true);
          wx.setStorageSync(AUTO_LOGIN_KEY, this.data.autoLogin);
          wx.setStorageSync(REMEMBERED_USER_KEY, username);
          wx.setStorageSync(REMEMBER_TOKEN_KEY, userInfo.rememberToken);
        } else {
          this.persistLoginPreferences();
        }

        wx.showToast({ title: '登录成功', icon: 'success' });

        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 800);
      } else {
        wx.showToast({
          title: (result && result.message) || '登录失败',
          icon: 'none',
        });
      }
    } catch (err) {
      wx.hideLoading();
      console.error('云函数调用失败', err);
      wx.showToast({ title: '登录服务异常，请稍后重试', icon: 'none' });
    }
  },

  /**
   * 持久化登录偏好（仅存储用户名，不存储密码）
   */
  persistLoginPreferences: function () {
    const { username, rememberPassword, autoLogin } = this.data;
    wx.setStorageSync(REMEMBER_PWD_KEY, rememberPassword);
    wx.setStorageSync(AUTO_LOGIN_KEY, autoLogin);
    wx.setStorageSync(REMEMBERED_USER_KEY, rememberPassword ? username : '');

    if (!rememberPassword) {
      wx.removeStorageSync(REMEMBER_TOKEN_KEY);
    }
  },

  clearRememberedCredentials: function () {
    wx.removeStorageSync(REMEMBERED_USER_KEY);
    wx.removeStorageSync(REMEMBER_TOKEN_KEY);
    wx.setStorageSync(REMEMBER_PWD_KEY, false);
    wx.setStorageSync(AUTO_LOGIN_KEY, false);
  },

  forgotPassword: function () {
    wx.showModal({
      title: '提示',
      content: '请联系管理员重置密码',
      showCancel: false
    });
  }
});
