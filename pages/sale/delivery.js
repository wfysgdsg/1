/**
 * 送货单页面
 * 功能：查看/编辑送货单、客户+送货人双签名、保存并分享
 */
var db = wx.cloud.database();
var _ = db.command;
var { amountToChinese, formatMoney } = require('../../utils/amountToChinese');

Page({
  data: {
    _anim: true,
    saleId: '',
    saleData: null,
    goodsList: [],
    totalInvoiceAmount: 0,
    totalInvoiceAmountStr: '',
    totalInvoiceChinese: '',
    saleDateStr: '',
    receiptNo: '',
    sellerName: '',
    contactName: '',
    remark: '',
    deliveryId: '',   // 已有送货单记录 ID

    // 客户签名
    customerSigning: false,
    hasCustomerSign: false,
    customerSignPath: '',
    // 送货人签名
    sellerSigning: false,
    hasSellerSign: false,
    sellerSignPath: '',

    // 按钮状态
    saving: false,
    exporting: false,
    saved: false,  // 是否已保存过
  },

  onLoad: function (options) {
    var that = this;
    var saleId = options.id || options.saleId || '';
    var deliveryId = options.deliveryId || '';

    if (!saleId && !deliveryId) {
      wx.showToast({ title: '缺少参数', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 1500);
      return;
    }

    if (deliveryId) {
      // 从历史记录打开，加载已有送货单
      that.loadDeliveryData(deliveryId);
    } else {
      that.setData({ saleId: saleId });
      that.loadSaleData(saleId);
    }
  },

  // ========== 数据加载 ==========

  loadSaleData: function (saleId) {
    var that = this;
    wx.showLoading({ title: '加载中...' });

    // 先查是否已有送货单记录
    db.collection('delivery_notes').where({ saleId: saleId }).limit(1).get().then(function (drRes) {
      if (drRes.data && drRes.data.length > 0) {
        // 已有记录，直接加载
        wx.hideLoading();
        that.loadDeliveryData(drRes.data[0]._id);
        return;
      }

      // 没有记录，从销售单生成
      db.collection('sale').doc(saleId).get().then(function (res) {
        wx.hideLoading();
        that.buildFromSale(res.data);
      }).catch(function (err) {
        wx.hideLoading();
        console.error('加载失败:', err);
        wx.showToast({ title: '加载失败', icon: 'none' });
      });
    }).catch(function (err) {
      wx.hideLoading();
      console.error('查询送货单失败:', err);
    });
  },

  loadDeliveryData: function (deliveryId) {
    var that = this;
    wx.showLoading({ title: '加载中...' });

    db.collection('delivery_notes').doc(deliveryId).get().then(function (res) {
      wx.hideLoading();
      var d = res.data;
      if (!d) {
        wx.showToast({ title: '送货单不存在', icon: 'none' });
        return;
      }

      that.setData({
        deliveryId: d._id,
        saleId: d.saleId || '',
        goodsList: d.goodsList || [],
        totalInvoiceAmount: d.totalInvoiceAmount || 0,
        totalInvoiceAmountStr: formatMoney(d.totalInvoiceAmount || 0),
        totalInvoiceChinese: amountToChinese(d.totalInvoiceAmount || 0),
        saleDateStr: d.saleDateStr || '',
        receiptNo: d.receiptNo || '',
        sellerName: d.sellerName || '',
        contactName: d.contactName || '',
        remark: d.remark || '',
        hasCustomerSign: !!d.customerSignature,
        customerSignPath: d.customerSignature || '',
        hasSellerSign: !!d.sellerSignature,
        sellerSignPath: d.sellerSignature || '',
        saved: true,
      });

      // 签名路径直接使用 cloud:// (WeChat 框架自动处理显示)
    }).catch(function (err) {
      wx.hideLoading();
      console.error('加载送货单失败:', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  buildFromSale: function (sale) {
    if (!sale) {
      wx.showToast({ title: '销售单不存在', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 1500);
      return;
    }

    var goodsList = (sale.goodsDetail || []).map(function (g, i) {
      return {
        seq: i + 1,
        goodsName: g.goodsName || '',
        unit: g.unit || '台',
        quantity: g.quantity || 0,
        salePrice: g.salePrice || 0,
        lineTotal: parseFloat(((g.quantity || 0) * (g.salePrice || 0)).toFixed(2)),
        remark: g.remark || '',
      };
    });

    var total = parseFloat((sale.totalInvoiceAmount || 0).toFixed(2));
    var saleDate = new Date(sale.saleDate || sale.saleTime || Date.now());
    var dateStr = [saleDate.getFullYear(), (saleDate.getMonth() + 1).toString().padStart(2, '0'), saleDate.getDate().toString().padStart(2, '0')].join('');
    var receiptNo = 'SD' + dateStr + (sale._id || '').slice(-4).toUpperCase();
    var y = saleDate.getFullYear();
    var m = saleDate.getMonth() + 1;
    var d = saleDate.getDate();

    this.setData({
      saleData: sale,
      goodsList: goodsList,
      totalInvoiceAmount: total,
      totalInvoiceAmountStr: formatMoney(total),
      totalInvoiceChinese: amountToChinese(total),
      saleDateStr: y + ' 年 ' + m + ' 月 ' + d + ' 日',
      receiptNo: receiptNo,
      sellerName: sale.sellerName || '',
      contactName: sale.contactName || '',
      remark: sale.remark || '',
      saved: false,
    });

  },

  // ========== 签名（跳转独立签名页） ==========

  // 当前正在签名的角色，用于接收签名结果
  _currentSignRole: '',

  openSignPage: function (e) {
    var role = e.currentTarget.dataset.role;
    this._currentSignRole = role;
    wx.navigateTo({ url: '/pages/sale/delivery-sign' });
  },

  // 签名页返回时调用
  onSignResult: function (tempPath) {
    var role = this._currentSignRole;
    if (!tempPath || !role) return;

    if (role === 'customer') {
      this.setData({ hasCustomerSign: true, customerSignPath: tempPath });
    } else {
      this.setData({ hasSellerSign: true, sellerSignPath: tempPath });
    }
    this._currentSignRole = '';
  },

  // 清空签名
  clearSignature: function (e) {
    var role = e.currentTarget.dataset.role;
    var that = this;
    wx.showModal({
      title: '清空签名',
      content: '确定清空吗？',
      success: function (r) {
        if (!r.confirm) return;
        if (role === 'customer') {
          that.setData({ hasCustomerSign: false, customerSignPath: '' });
        } else {
          that.setData({ hasSellerSign: false, sellerSignPath: '' });
        }
      }
    });
  },

  // ========== 上传签名到云存储 ==========

  uploadSignatures: function (callback) {
    var that = this;
    var tasks = [];
    var result = { customerSignature: '', sellerSignature: '' };

    var uploadOne = function (role, tempPath) {
      return new Promise(function (resolve) {
        if (!tempPath) { resolve(''); return; }
        var cloudPath = 'signatures/' + role + '_' + (that.data.saleId || Date.now()) + '_' + Date.now() + '.png';
        wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: tempPath,
          success: function (res) { resolve(res.fileID); },
          fail: function () { resolve(tempPath); } // 回退保留临时路径
        });
      });
    };

    Promise.all([
      uploadOne('customer', that.data.customerSignPath),
      uploadOne('seller', that.data.sellerSignPath),
    ]).then(function (results) {
      result.customerSignature = results[0];
      result.sellerSignature = results[1];
      // 更新页面数据，用云存储路径替换临时路径
      if (results[0]) that.setData({ customerSignPath: results[0] });
      if (results[1]) that.setData({ sellerSignPath: results[1] });
      callback(result);
    });
  },

  // ========== 保存 ==========

  saveDelivery: function () {
    var that = this;
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...' });

    this.uploadSignatures(function (sigUrls) {
      var data = {
        saleId: that.data.saleId,
        receiptNo: that.data.receiptNo,
        contactName: that.data.contactName,
        goodsList: that.data.goodsList,
        totalInvoiceAmount: that.data.totalInvoiceAmount,
        totalInvoiceChinese: that.data.totalInvoiceChinese,
        saleDateStr: that.data.saleDateStr,
        sellerName: that.data.sellerName,
        remark: that.data.remark,
        customerSignature: sigUrls.customerSignature || that.data.customerSignPath,
        sellerSignature: sigUrls.sellerSignature || that.data.sellerSignPath,
        updateTime: db.serverDate(),
      };

      var collection = db.collection('delivery_notes');

      if (that.data.deliveryId) {
        // 更新已有记录
        collection.doc(that.data.deliveryId).update({ data: data }).then(function () {
          wx.hideLoading();
          that.setData({ saving: false, saved: true });
          wx.showToast({ title: '已保存', icon: 'success' });
        }).catch(function (err) {
          wx.hideLoading();
          that.setData({ saving: false });
          console.error('保存失败:', err);
          wx.showToast({ title: '保存失败', icon: 'none' });
        });
      } else {
        // 新建记录
        data.createTime = db.serverDate();
        collection.add({ data: data }).then(function (res) {
          wx.hideLoading();
          that.setData({ saving: false, saved: true, deliveryId: res._id });
          wx.showToast({ title: '已保存', icon: 'success' });
        }).catch(function (err) {
          wx.hideLoading();
          that.setData({ saving: false });
          console.error('保存失败:', err);
          wx.showToast({ title: '保存失败', icon: 'none' });
        });
      }
    });
  },

  // ========== 分享（先确保签名已上传，再导出） ==========

  doShare: function () {
    var that = this;
    this.setData({ exporting: true });

    // 如果有签名还没上传，先上传
    var needUpload = (this.data.hasCustomerSign && this.data.customerSignPath && this.data.customerSignPath.indexOf('cloud://') !== 0)
                  || (this.data.hasSellerSign && this.data.sellerSignPath && this.data.sellerSignPath.indexOf('cloud://') !== 0);

    if (needUpload) {
      wx.showLoading({ title: '准备中...' });
      this.uploadSignatures(function () {
        wx.hideLoading();
        that.doExportAndShare();
      });
    } else {
      this.doExportAndShare();
    }
  },

  // 旧方法保留兼容
  saveAndShare: function () {
    this.doShare();
  },

  doExportAndShare: function () {
    var that = this;
    this.setData({ exporting: true });
    wx.showLoading({ title: '生成图片中...' });

    this.drawExportImage(function (tempFilePath) {
      wx.hideLoading();
      that.setData({ exporting: false });
      if (!tempFilePath) {
        wx.showToast({ title: '生成失败', icon: 'none' });
        return;
      }
      wx.showShareImageMenu({
        path: tempFilePath,
        fail: function () {
          wx.saveImageToPhotosAlbum({
            filePath: tempFilePath,
            success: function () { wx.showToast({ title: '已保存到相册', icon: 'success' }); },
            fail: function () { wx.previewImage({ urls: [tempFilePath], current: tempFilePath }); }
          });
        }
      });
    });
  },

  // ========== 导出图片（用隐藏 canvas 绘制完整送货单） ==========

  drawExportImage: function (callback) {
    var that = this;
    var query = wx.createSelectorQuery();
    query.select('#exportCanvas').fields({ node: true, size: true }).exec(function (res) {
      if (!res[0] || !res[0].node) {
        that.drawExportOld(callback);
        return;
      }
      var canvas = res[0].node;
      var ctx = canvas.getContext('2d');
      var W = 750, dpr = wx.getSystemInfoSync().pixelRatio;
      canvas.width = W * dpr; canvas.height = 1200 * dpr;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, 1200);
      ctx.fillStyle = '#000';

      var y = 40, L = 40, R = 40;
      ctx.font = 'bold 28px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('送（销）货 单', W / 2, y + 30); y += 60;
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke(); y += 10;

      var d = that.data;
      ctx.font = '16px sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('收货单位（人）：' + (d.contactName || '___________'), L, y + 20);
      ctx.textAlign = 'right'; ctx.fillText('No. ' + d.receiptNo, W - R, y + 20);
      y += 28;
      ctx.textAlign = 'left'; ctx.fillText('地址、电话：', L, y + 20);
      ctx.textAlign = 'right'; ctx.fillText(d.saleDateStr, W - R, y + 20);
      y += 40;

      // 表格
      y = that.drawExportTable(ctx, L, W - R, y, d) + 20;

      // 金额：大写 + 小写 左右并排
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('人民币  ' + d.totalInvoiceChinese, L, y + 16);
      ctx.textAlign = 'right';
      ctx.fillText('小写：¥' + d.totalInvoiceAmountStr, W - R, y + 16);
      ctx.textAlign = 'left';
      y += 36;

      // 签名区 — 四列并排
      ctx.font = '12px sans-serif';
      var colW = (W - L - R) / 4;
      var cols = [
        { label: '送货单位主管：', x: L },
        { label: '制票：', x: L + colW },
        { label: '送货人：', x: L + colW * 2 },
        { label: '收货单位（人）：', x: L + colW * 3 },
      ];
      cols.forEach(function (c) {
        ctx.fillText(c.label, c.x, y + 14);
      });

      // 加载签名
      var loadSig = function (src, cb) {
        if (!src) { cb(null); return; }
        if (typeof src === 'string' && src.indexOf('cloud://') === 0) {
          wx.cloud.getTempFileURL({
            fileList: [src],
            success: function (res) {
              if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) cb(res.fileList[0].tempFileURL);
              else cb(null);
            },
            fail: function () { cb(null); }
          });
        } else { cb(src); }
      };

      var sigs = 0, total = 0;
      var sellerSrc = null, customerSrc = null;
      var finish = function () {
        sigs++;
        if (sigs < total) return;
        var left = 0;
        var done = function () { left--; if (left <= 0) that.exportCanvasFile(canvas, callback); };

        if (sellerSrc) { left++; var si = canvas.createImage(); si.onload = function () { ctx.drawImage(si, cols[2].x + 52, y - 4, 90, 38); done(); }; si.onerror = done; si.src = sellerSrc; }
        if (customerSrc) { left++; var ci = canvas.createImage(); ci.onload = function () { ctx.drawImage(ci, cols[3].x + 90, y - 4, 90, 38); done(); }; ci.onerror = done; ci.src = customerSrc; }
        if (left === 0) that.exportCanvasFile(canvas, callback);
      };

      if (d.hasSellerSign && d.sellerSignPath) { total++; }
      if (d.hasCustomerSign && d.customerSignPath) { total++; }

      if (total === 0) {
        that.exportCanvasFile(canvas, callback);
      } else {
        if (d.hasSellerSign && d.sellerSignPath) loadSig(d.sellerSignPath, function (u) { sellerSrc = u; finish(); });
        if (d.hasCustomerSign && d.customerSignPath) loadSig(d.customerSignPath, function (u) { customerSrc = u; finish(); });
      }
    });
  },

  drawExportTable: function (ctx, L, R, y, d) {
    var W = R - L;
    var ratios = [0.06, 0.27, 0.07, 0.08, 0.13, 0.17, 0.22];
    var headers = ['序号', '名称及规格', '单位', '数量', '单价', '金额', '备注'];
    var colX = [L]; ratios.forEach(function (r) { colX.push(colX[colX.length - 1] + W * r); });
    var rowH = 30;

    // 表头
    ctx.fillStyle = '#f5f5f5'; ctx.fillRect(L, y, W, rowH);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.strokeRect(L, y, W, rowH);
    ctx.fillStyle = '#000'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    headers.forEach(function (h, i) {
      if (i > 0) { ctx.beginPath(); ctx.moveTo(colX[i], y); ctx.lineTo(colX[i], y + rowH); ctx.stroke(); }
      ctx.fillText(h, (colX[i] + colX[i + 1]) / 2, y + 20);
    });
    y += rowH;

    // 数据行
    ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
    var list = d.goodsList, maxR = Math.max(list.length, 5);
    for (var r = 0; r < maxR; r++) {
      var item = list[r] || {};
      ctx.strokeRect(L, y, W, rowH);
      var vals = [
        String(item.seq || (r + 1)),
        item.goodsName || '', item.unit || '', String(item.quantity || ''),
        formatMoney(item.salePrice || 0), formatMoney(item.lineTotal || 0), item.remark || ''
      ];
      vals.forEach(function (v, i) {
        ctx.fillText(v, colX[i] + 4, y + 20);
        if (i > 0) { ctx.beginPath(); ctx.moveTo(colX[i], y); ctx.lineTo(colX[i], y + rowH); ctx.stroke(); }
      });
      y += rowH;
    }

    // 合计
    ctx.fillStyle = '#f9f9f9'; ctx.fillRect(L, y, W, rowH);
    ctx.strokeRect(L, y, W, rowH);
    ctx.fillStyle = '#000'; ctx.font = 'bold 13px sans-serif';
    ctx.fillText('合计', L + 4, y + 20);
    ctx.fillText(formatMoney(d.totalInvoiceAmount), colX[5] + 4, y + 20);
    for (var i = 1; i < headers.length; i++) {
      ctx.beginPath(); ctx.moveTo(colX[i], y); ctx.lineTo(colX[i], y + rowH); ctx.stroke();
    }
    return y + rowH;
  },

  drawExportOld: function (callback) {
    var ctx = wx.createCanvasContext('exportCanvas');
    var d = this.data;
    ctx.setFillStyle('#ffffff'); ctx.fillRect(0, 0, 750, 1200);
    ctx.setFillStyle('#000'); ctx.setFontSize(26); ctx.setTextAlign('center');
    ctx.fillText('送（销）货 单', 375, 50);
    ctx.setFontSize(15); ctx.setTextAlign('left');
    ctx.fillText('收货单位（人）：' + (d.contactName || '___'), 40, 90);
    ctx.setTextAlign('right'); ctx.fillText('No. ' + d.receiptNo, 710, 90);
    ctx.setTextAlign('left'); ctx.fillText('地址、电话：', 40, 118);
    ctx.setTextAlign('right'); ctx.fillText(d.saleDateStr, 710, 118);

    var y = 150;
    ctx.setTextAlign('left'); ctx.setFontSize(13);
    var list = d.goodsList;
    for (var i = 0; i < Math.max(list.length, 5); i++) {
      var item = list[i] || {};
      ctx.fillText((i + 1) + '. ' + (item.goodsName || '') + '  ' + (item.quantity || '') + (item.unit || '') + '  ¥' + formatMoney(item.salePrice || 0) + '  ¥' + formatMoney(item.lineTotal || 0), 40, y);
      y += 28;
    }
    ctx.fillText('合计：¥' + d.totalInvoiceAmountStr, 40, y); y += 36;
    ctx.fillText('人民币  ' + d.totalInvoiceChinese, 40, y); y += 30;
    ctx.fillText('送货人：' + (d.sellerName || '___'), 40, y);
    ctx.fillText('收货单位（人）：', 300, y);

    ctx.draw(false, function () {
      wx.canvasToTempFilePath({ canvasId: 'exportCanvas', success: function (r) { callback(r.tempFilePath); }, fail: function () { callback(null); } });
    });
  },

  exportCanvasFile: function (canvas, callback) {
    wx.canvasToTempFilePath({ canvas: canvas, success: function (r) { callback(r.tempFilePath); }, fail: function () { callback(null); } });
  },

  onSellerNameInput: function (e) {
    this.setData({ sellerName: e.detail.value });
  },

  goBack: function () { wx.navigateBack(); },
});
