/**
 * 全屏横屏签名页
 * 返回时通过 eventChannel 传递签名图片临时路径
 */
Page({
  data: {
    canvasReady: false,
    hasDrawn: false,
    penColor: '#000000',
    penSize: 4,
  },

  onLoad: function () {
    var that = this;
    // 延迟初始化，确保 canvas 已渲染
    setTimeout(function () {
      that.initCanvas();
    }, 300);
  },

  initCanvas: function () {
    var that = this;
    var query = wx.createSelectorQuery();
    query.select('#signCanvas').fields({ node: true, size: true }).exec(function (res) {
      if (!res[0] || !res[0].node) {
        that.useOldCanvas();
        return;
      }

      var canvas = res[0].node;
      var ctx = canvas.getContext('2d');
      var dpr = wx.getSystemInfoSync().pixelRatio;
      var w = res[0].width;
      var h = res[0].height;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);

      // 白色背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      // 提示文字
      ctx.fillStyle = '#e0e0e0';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('请在此处签名', w / 2, h / 2 - 20);
      ctx.textAlign = 'start';

      // 画横线参考
      ctx.strokeStyle = '#e8e8e8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(40, h - 60);
      ctx.lineTo(w - 40, h - 60);
      ctx.stroke();

      that.canvas = canvas;
      that.ctx = ctx;
      that.canvasW = w;
      that.canvasH = h;

      // 缓存 canvas 位置
      that.cacheRect();

      that.setData({ canvasReady: true });
    });
  },

  useOldCanvas: function () {
    var that = this;
    var ctx = wx.createCanvasContext('signCanvas');
    var sysInfo = wx.getSystemInfoSync();
    var w = sysInfo.windowWidth;
    var h = sysInfo.windowHeight - 60;

    ctx.setFillStyle('#ffffff');
    ctx.fillRect(0, 0, w, h);
    ctx.setFillStyle('#e0e0e0');
    ctx.setFontSize(20);
    ctx.setTextAlign('center');
    ctx.fillText('请在此处签名', w / 2, h / 2 - 20);
    ctx.setTextAlign('start');
    ctx.setStrokeStyle('#e8e8e8');
    ctx.setLineWidth(1);
    ctx.beginPath();
    ctx.moveTo(40, h - 60);
    ctx.lineTo(w - 40, h - 60);
    ctx.stroke();
    ctx.draw();

    that._oldCtx = ctx;
    that._oldId = 'signCanvas';
    that.canvasW = w;
    that.canvasH = h;
    that.setData({ canvasReady: true });
  },

  cacheRect: function () {
    var that = this;
    wx.createSelectorQuery().select('#signCanvas').boundingClientRect(function (rect) {
      if (rect) that._rect = rect;
    }).exec();
  },

  // ========== 触摸事件 ==========

  onTouchStart: function (e) {
    var rect = this._rect || { left: 0, top: 0 };
    var x = e.touches[0].x - rect.left;
    var y = e.touches[0].y - rect.top;

    if (this.ctx) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      this.ctx.lineWidth = this.data.penSize;
      this.ctx.strokeStyle = this.data.penColor;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
    } else if (this._oldCtx) {
      this._oldCtx.beginPath();
      this._oldCtx.moveTo(x, y);
      this._oldCtx.setLineWidth(this.data.penSize);
      this._oldCtx.setStrokeStyle(this.data.penColor);
      this._oldCtx.setLineCap('round');
      this._oldCtx.setLineJoin('round');
    }
    this.setData({ hasDrawn: true });
  },

  onTouchMove: function (e) {
    var rect = this._rect || { left: 0, top: 0 };
    var x = e.touches[0].x - rect.left;
    var y = e.touches[0].y - rect.top;

    if (this.ctx) {
      this.ctx.lineTo(x, y);
      this.ctx.stroke();
    } else if (this._oldCtx) {
      this._oldCtx.lineTo(x, y);
      this._oldCtx.stroke();
      this._oldCtx.draw(true);
    }
  },

  // ========== 操作按钮 ==========

  // 确认签名，返回图片
  confirmSign: function () {
    var that = this;
    wx.showLoading({ title: '保存签名...' });

    var doExport = function () {
      if (that.canvas && that.ctx) {
        wx.canvasToTempFilePath({
          canvas: that.canvas,
          success: function (res) {
            wx.hideLoading();
            that.goBackWithResult(res.tempFilePath);
          },
          fail: function () {
            wx.hideLoading();
            wx.showToast({ title: '保存失败', icon: 'none' });
          }
        });
      } else {
        wx.canvasToTempFilePath({
          canvasId: 'signCanvas',
          success: function (res) {
            wx.hideLoading();
            that.goBackWithResult(res.tempFilePath);
          },
          fail: function () {
            wx.hideLoading();
            wx.showToast({ title: '保存失败', icon: 'none' });
          }
        });
      }
    };

    if (this._oldCtx) {
      this._oldCtx.draw(false, doExport);
    } else {
      doExport();
    }
  },

  // 返回上一页并传结果
  goBackWithResult: function (tempPath) {
    var pages = getCurrentPages();
    var prevPage = pages[pages.length - 2];
    if (prevPage && prevPage.onSignResult) {
      prevPage.onSignResult(tempPath);
    }
    wx.navigateBack();
  },

  // 清空画布
  clearCanvas: function () {
    var that = this;
    if (this.canvas && this.ctx) {
      this.ctx.clearRect(0, 0, this.canvasW, this.canvasH);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(0, 0, this.canvasW, this.canvasH);
      this.ctx.fillStyle = '#e0e0e0';
      this.ctx.font = '20px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('请在此处签名', this.canvasW / 2, this.canvasH / 2 - 20);
      this.ctx.textAlign = 'start';
      this.ctx.strokeStyle = '#e8e8e8';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(40, this.canvasH - 60);
      this.ctx.lineTo(this.canvasW - 40, this.canvasH - 60);
      this.ctx.stroke();
    } else if (this._oldCtx) {
      this._oldCtx.clearRect(0, 0, this.canvasW, this.canvasH);
      this._oldCtx.setFillStyle('#ffffff');
      this._oldCtx.fillRect(0, 0, this.canvasW, this.canvasH);
      this._oldCtx.draw();
      // 重新画提示
      var ctx = wx.createCanvasContext('signCanvas');
      ctx.setFillStyle('#ffffff');
      ctx.fillRect(0, 0, this.canvasW, this.canvasH);
      ctx.setFillStyle('#e0e0e0');
      ctx.setFontSize(20);
      ctx.setTextAlign('center');
      ctx.fillText('请在此处签名', this.canvasW / 2, this.canvasH / 2 - 20);
      ctx.setTextAlign('start');
      ctx.draw();
      this._oldCtx = ctx;
    }
    this.setData({ hasDrawn: false });
  },

  // 取消
  cancelSign: function () {
    wx.navigateBack();
  },
});
