/**
 * 登录页面逻辑 (反编译还原整理)
 * 整理日期：2024-03-26
 */

const REMEMBER_PWD_KEY = 'rememberPassword';
const AUTO_LOGIN_KEY = 'autoLogin';
const REMEMBERED_USER_KEY = 'rememberedUsername';
const REMEMBERED_PWD_KEY = 'rememberedPassword';

const CLIENT_SALT = 'personal_assets_salt_2024';
const { md5 } = require('../../utils/util');

Page({
  data: {
    username: '',
    password: '',
    showPassword: false,
    rememberPassword: false,
    autoLogin: false,
    autoLoginTried: false,
    uiText: {
      logo: '📦',
      title: '借货销售',
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
   */
  restoreLoginPreferences: function () {
    try {
      const isRemember = !!wx.getStorageSync(REMEMBER_PWD_KEY);
      const isAutoLogin = !!wx.getStorageSync(AUTO_LOGIN_KEY);
      const savedUser = (isRemember && wx.getStorageSync(REMEMBERED_USER_KEY)) || '';
      const savedPwd = (isRemember && wx.getStorageSync(REMEMBERED_PWD_KEY)) || '';

      this.setData({
        rememberPassword: isRemember,
        autoLogin: isAutoLogin,
        username: savedUser,
        password: savedPwd,
      });

      // 如果开启了自动登录，且有保存的账号密码，且还没尝试过自动登录
      if (isAutoLogin && savedUser && savedPwd && !this.data.autoLoginTried) {
        this.setData({ autoLoginTried: true });
        this.doLogin(true);
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

  togglePassword: function () {
    this.setData({ showPassword: !this.data.showPassword });
  },

  toggleRememberPassword: function () {
    const newVal = !this.data.rememberPassword;
    this.setData({
      rememberPassword: newVal,
      autoLogin: newVal && this.data.autoLogin, // 如果取消记住密码，自动登录也得取消
    });
    if (!newVal) this.clearRememberedCredentials();
  },

  toggleAutoLogin: function () {
    const newVal = !this.data.autoLogin;
    this.setData({
      autoLogin: newVal,
      rememberPassword: newVal || this.data.rememberPassword, // 开启自动登录必须开启记住密码
    });
  },

  login: function () {
    this.doLogin(false);
  },

  /**
   * 执行登录逻辑
   * @param {boolean} isAuto 是否为自动登录
   */
  async doLogin(isAuto = false) {
    const { username, password, rememberPassword } = this.data;

    if (!username || !password) {
      if (!isAuto) {
        wx.showToast({ title: '请输入用户名和密码', icon: 'none' });
      }
      return;
    }

    wx.showLoading({ title: isAuto ? '自动登录中...' : '登录中...' });

    try {
      // 如果不是自动登录（即手动输入），则需要处理 MD5 (加盐)
      // 注意：如果从缓存恢复的已经是 MD5 了，就不应该再次 MD5
      // 我们可以通过长度判断，MD5 始终是 32 位 hex
      let loginPassword = password;
      const isAlreadyMd5 = /^[a-f0-9]{32}$/i.test(password);
      
      if (!isAlreadyMd5) {
        loginPassword = md5(password + CLIENT_SALT);
      }

      // 调用云函数
      const res = await wx.cloud.callFunction({
        name: 'authLogin',
        data: {
          action: 'login',
          username: username,
          password: loginPassword
        },
      });

      wx.hideLoading();

      const result = res.result;
      if (result && result.success) {
        const userInfo = result.userInfo;
        
        wx.setStorageSync('userInfo', userInfo);
        wx.setStorageSync('userId', userInfo._id);
        wx.setStorageSync('sessionToken', userInfo.sessionToken);

        // 保存偏好时使用 MD5 后的密码
        this.persistLoginPreferences(loginPassword);

        wx.showToast({ title: isAuto ? '自动登录成功' : '登录成功', icon: 'success' });

        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 800);
      } else {
        // 登录失败处理
        if (isAuto) {
          this.clearRememberedCredentials();
        }
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
   * 持久化登录偏好
   */
  persistLoginPreferences: function (md5Password) {
    const { username, rememberPassword, autoLogin } = this.data;
    wx.setStorageSync(REMEMBER_PWD_KEY, rememberPassword);
    wx.setStorageSync(AUTO_LOGIN_KEY, autoLogin);

    if (rememberPassword) {
      wx.setStorageSync(REMEMBERED_USER_KEY, username);
      wx.setStorageSync(REMEMBERED_PWD_KEY, md5Password);
    } else {
      this.clearRememberedCredentials();
    }
  },

  clearRememberedCredentials: function () {
    wx.removeStorageSync(REMEMBERED_USER_KEY);
    wx.removeStorageSync(REMEMBERED_PWD_KEY);
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
