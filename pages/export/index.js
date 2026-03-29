/**
 * 数据导出页逻辑 (重构整理)
 * 整理日期：2025-01-26
 */
const db = wx.cloud.database();
const _ = db.command;
const { fetchAll } = require('../../utils/db');

Page({
  data: {
    uiText: {
      dataType: '数据类型',
      choose: '请选择',
      dateRange: '时间范围',
      start: '开始：',
      end: '结束：',
      exportExcel: '导出 Excel',
      preview: '预览（前 10 条）',
    },
    dataTypes: [
      { name: '借货客户明细', type: 'borrow_customer' },
      { name: '销售记录明细', type: 'sale_detail' },
      { name: '调货记录明细', type: 'transfer' },
      { name: '个人库存快照', type: 'stock' },
    ],
    selectedType: null,
    startDate: '',
    endDate: '',
    previewData: [],
  },

  onLoad: function () {
    const now = new Date();
    const sixMonthsAgo = new Date(Date.now() - 2592e6);
    this.setData({
      startDate: sixMonthsAgo.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
    });
  },

  onTypeChange: function (e) {
    const idx = e.detail.value;
    this.setData({ selectedType: this.data.dataTypes[idx] });
  },

  onStartDateChange: function (e) {
    this.setData({ startDate: e.detail.value });
  },

  onEndDateChange: function (e) {
    this.setData({ endDate: e.detail.value });
  },

  /**
   * 导出数据
   */
  async exportData() {
    const { selectedType, startDate, endDate } = this.data;
    const userInfo = wx.getStorageSync('userInfo');

    if (!selectedType) {
      wx.showToast({ title: '请选择导出类型', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '正在提取数据...', mask: true });

    try {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime() + 864e5; // 包含结束日期当天

      let csvContent = '\ufeff'; // UTF-8 BOM，防止 Excel 乱码
      const fileName = `${selectedType.name}_${startDate}_${endDate}.csv`;

      // 根据类型导出
      switch (selectedType.type) {
        case 'borrow_customer':
          csvContent += await this.exportBorrowCustomer(start, end, userInfo);
          break;
        case 'sale_detail':
          csvContent += await this.exportSaleDetail(start, end, userInfo);
          break;
        case 'transfer':
          csvContent += await this.exportTransfer(start, end);
          break;
        case 'stock':
          csvContent += await this.exportStock(userInfo);
          break;
        default:
          throw new Error('未知的导出类型: ' + selectedType.type);
      }

      // 写入本地文件
      const fs = wx.getFileSystemManager();
      const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
      fs.writeFileSync(filePath, csvContent, 'utf8');

      // 上传到云端
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: `exports/${Date.now()}_${fileName}`,
        filePath: filePath,
      });

      // 获取下载链接
      const urlRes = await wx.cloud.getTempFileURL({ fileList: [uploadRes.fileID] });
      const downloadUrl = urlRes.fileList[0].tempFileURL;

      wx.hideLoading();
      wx.showModal({
        title: '导出成功',
        content: '数据已生成，请复制链接后在浏览器打开下载。',
        confirmText: '复制链接',
        success: (res) => {
          if (res.confirm) {
            wx.setClipboardData({ data: downloadUrl });
          }
        },
      });

    } catch (err) {
      wx.hideLoading();
      console.error('导出失败', err);
      wx.showToast({ title: '导出失败: ' + (err.message || err), icon: 'none', duration: 3000 });
    }
  },

  /**
   * 导出借货客户明细
   */
  async exportBorrowCustomer(start, end, userInfo) {
    // 构建查询条件
    const whereCond = {};
    
    // 日期范围过滤
    if (start && end) {
      whereCond.borrowDate = _.gte(start).and(_.lt(end));
    }
    
    // 非root用户只能看自己的
    if (userInfo.role !== 'root') {
      whereCond.borrowerId = userInfo._id;
    }
    
    let query = db.collection('borrow').where(whereCond);

    const data = await fetchAll(query.orderBy('locationName', 'asc').orderBy('borrowDate', 'desc'));

    // 获取所有商品的分类，构建 goodsId -> category 映射
    const goodsIds = [...new Set(data.map(item => item.goodsId).filter(Boolean))];
    let categoryMap = {};
    if (goodsIds.length > 0) {
      const goodsRes = await db.collection('goods').where({ _id: _.in(goodsIds) }).get();
      (goodsRes.data || []).forEach(g => {
        categoryMap[g._id] = g.category || 'hardware';
      });
    }

    let csv = '借货单位,商品名称,数量,单位,成本价,售价,总价,毛利,借货日期,当前状态,备注\n';
    
    data.forEach(item => {
      const status = item.status === 'pending' ? '待处理' : 
                     item.status === 'returned' ? '已归还' : '调货中';
      // 格式化时间戳
      const borrowDate = item.borrowDate ? this.formatTimestamp(item.borrowDate) : '';
      // 根据商品分类确定税率：软件1.06，硬件1.13
      const category = categoryMap[item.goodsId] || 'hardware';
      const taxRate = category === 'software' ? 1.06 : 1.13;
      // 计算总价和毛利：总价 = 数量×售价（不含税），毛利 = 总价 - 成本额/税率
      const qty = Number(item.quantity || 0);
      const salePrice = Number(item.salePrice || 0);
      const costPrice = Number(item.costPrice || 0);
      const totalSale = qty * salePrice;
      const totalCost = (qty * costPrice) / taxRate;
      const profit = totalSale - totalCost;
      // 用引号包起来，防止Excel省略小数位
      csv += `"${item.locationName || ''}","${item.goodsName || ''}","${qty.toFixed(2)}","${item.unit || ''}","${costPrice.toFixed(2)}","${salePrice.toFixed(2)}","${totalSale.toFixed(2)}","${profit.toFixed(2)}","${borrowDate}","${status}","${item.remark || ''}"\n`;
    });

    return csv;
  },

  /**
   * 格式化时间戳为日期字符串
   */
  formatTimestamp(ts) {
    if (!ts) return '';
    const d = new Date(typeof ts === 'number' ? ts : ts.getTime ? ts.getTime() : ts);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  /**
   * 导出销售记录明细
   */
  async exportSaleDetail(start, end, userInfo) {
    let query = db.collection('sale')
      .where({ saleTime: _.gte(start).and(_.lt(end)) });
    
    if (userInfo.role !== 'root') {
      query = query.where({ sellerId: userInfo._id });
    }

    const data = await fetchAll(query.orderBy('contactName', 'asc').orderBy('saleDate', 'desc'));

    let csv = '销售日期,客户名称,商品名称,数量,单位,成交价,成本价,单笔利润,付款状态,备注\n';
    
    data.forEach(sale => {
      const payStatusStr = sale.payStatus === 'paid' ? '已结清' : '未付款';
      (sale.goodsDetail || []).forEach(g => {
        csv += `"${sale.saleDate || ''}","${sale.contactName || sale.locationName || ''}","${g.goodsName || ''}","${Number(g.quantity || 0).toFixed(2)}","${g.unit || ''}","${Number(g.salePrice || 0).toFixed(2)}","${Number(g.costPrice || 0).toFixed(2)}","${Number(g.profit || 0).toFixed(2)}","${payStatusStr}","${sale.remark || ''}"\n`;
      });
    });

    return csv;
  },

  /**
   * 导出调货记录
   */
  async exportTransfer(start, end) {
    const query = db.collection('transfer_requests')
      .where({ createTime: _.gte(start).and(_.lt(end)) });

    const data = await fetchAll(query.orderBy('createTime', 'desc'));

    let csv = '申请时间,发送人,接收人,原单位,商品明细,状态\n';
    
    data.forEach(item => {
      const status = item.status === 'accepted' ? '已接收' : 
                     item.status === 'rejected' ? '已拒绝' : '待处理';
      const goodsStr = (item.goodsList || [])
        .map(g => `${g.goodsName}x${g.quantity}`)
        .join(' | ');
      const createTime = item.createTime ? new Date(item.createTime).toLocaleString() : '';
      csv += `${createTime},${item.senderName || ''},${item.receiverName || ''},${item.fromCustomerName || ''},"${goodsStr}",${status}\n`;
    });

    return csv;
  },

  /**
   * 导出个人库存快照
   */
  async exportStock(userInfo) {
    let query = db.collection('user_goods');
    
    if (userInfo.role !== 'root') {
      query = query.where({ userId: userInfo._id });
    }

    const data = await fetchAll(query);

    let csv = '持有人,商品名称,当前库存,单位,最后变动日期\n';
    
    data.forEach(item => {
      csv += `"${item.userName || '本人'}","${item.goodsName || ''}","${Number(item.stock || 0).toFixed(2)}","${item.unit || ''}","${item.lastSaleDate || '无记录'}"\n`;
    });

    return csv;
  },
});
