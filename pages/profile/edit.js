/**
 * 个人资料编辑页
 */
const db = wx.cloud.database();

Page({
  data: {
    avatarUrl: '',
    nickname: '',
    bio: '',
    initialName: '',
    saving: false,
  },

  // 云存储 fileID（永久），与 data.avatarUrl（临时显示 URL）分开
  _cloudAvatarFileId: '',

  onLoad: function () {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const name = userInfo.name || userInfo.username || '';

    this.setData({
      avatarUrl: '',
      nickname: userInfo.nickname || '',
      bio: userInfo.bio || '',
      initialName: name ? name[0].toUpperCase() : '?',
    });

    // 保存永久 cloud fileID
    this._cloudAvatarFileId = userInfo.avatarUrl || '';

    // 将 cloud:// fileID 转为临时 URL 用于显示
    if (this._cloudAvatarFileId && this._cloudAvatarFileId.indexOf('cloud://') === 0) {
      const that = this;
      wx.cloud.getTempFileURL({
        fileList: [this._cloudAvatarFileId],
        success: function (res) {
          if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
            that.setData({ avatarUrl: res.fileList[0].tempFileURL });
          }
        }
      });
    } else if (this._cloudAvatarFileId) {
      this.setData({ avatarUrl: this._cloudAvatarFileId });
    }
  },

  chooseAvatar: function () {
    const that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        const tempPath = res.tempFilePaths[0];
        wx.showLoading({ title: '上传中...' });

        const userInfo = wx.getStorageSync('userInfo') || {};
        const cloudPath = 'avatars/' + (userInfo._id || 'unknown') + '_' + Date.now() + '.jpg';

        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: tempPath,
          success: function (uploadRes) {
            wx.hideLoading();
            // 保存永久 cloud fileID，同时显示临时 URL
            that._cloudAvatarFileId = uploadRes.fileID;

            // 转临时 URL 用于显示
            wx.cloud.getTempFileURL({
              fileList: [uploadRes.fileID],
              success: function (urlRes) {
                if (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) {
                  that.setData({ avatarUrl: urlRes.fileList[0].tempFileURL });
                } else {
                  that.setData({ avatarUrl: uploadRes.fileID });
                }
              },
              fail: function () {
                that.setData({ avatarUrl: uploadRes.fileID });
              }
            });
          },
          fail: function (err) {
            wx.hideLoading();
            console.error('头像上传失败', err);
            wx.showToast({ title: '上传失败，请重试', icon: 'none' });
          }
        });
      }
    });
  },

  onNicknameInput: function (e) {
    this.setData({ nickname: e.detail.value });
  },

  onBioInput: function (e) {
    this.setData({ bio: e.detail.value });
  },

  saveProfile: async function () {
    if (this.data.saving) return;

    const userInfo = wx.getStorageSync('userInfo') || {};
    const userId = userInfo._id;
    const sessionToken = wx.getStorageSync('sessionToken') || userInfo.sessionToken || '';

    if (!userId || !sessionToken) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    this.setData({ saving: true });

    try {
      // 保存的是云存储 fileID（永久），不是临时 URL
      const res = await wx.cloud.callFunction({
        name: 'userManage',
        data: {
          action: 'updateProfile',
          userId: userId,
          sessionToken: sessionToken,
          nickname: this.data.nickname.trim(),
          bio: this.data.bio.trim(),
          avatarUrl: this._cloudAvatarFileId,
        }
      });

      if (res.result && res.result.success) {
        // 更新本地缓存 — 存云存储 fileID
        const updated = Object.assign({}, userInfo, {
          nickname: this.data.nickname.trim(),
          bio: this.data.bio.trim(),
          avatarUrl: this._cloudAvatarFileId,
        });
        wx.setStorageSync('userInfo', updated);

        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 800);
      } else {
        var msg = (res.result && res.result.message) || '保存失败';
        if (msg.indexOf('登录') > -1 || msg.indexOf('session') > -1) {
          wx.showModal({
            title: '登录已失效',
            content: '请重新登录后再试',
            showCancel: false,
            success: function () {
              wx.removeStorageSync('userInfo');
              wx.removeStorageSync('sessionToken');
              wx.removeStorageSync('userId');
              wx.redirectTo({ url: '/pages/login/login' });
            }
          });
        } else {
          wx.showToast({ title: msg, icon: 'none' });
        }
      }
    } catch (err) {
      console.error('保存资料失败', err);
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },
});
