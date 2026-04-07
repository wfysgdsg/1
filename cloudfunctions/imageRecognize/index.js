var e = require('../../@babel/runtime/helpers/regeneratorRuntime'),
  r = require('../../@babel/runtime/helpers/asyncToGenerator'),
  t = require('wx-server-sdk');
t.init({ env: t.DYNAMIC_CURRENT_ENV }),
  (exports.main = (function () {
    var n = r(
      e().mark(function r(n) {
        var s, a, i;
        return e().wrap(
          function (e) {
            for (;;)
              switch ((e.prev = e.next)) {
                case 0:
                  if (
                    ((s = n.imageUrl),
                    console.log('收到识别请求，imageUrl:', s),
                    s)
                  ) {
                    e.next = 4;
                    break;
                  }
                  return e.abrupt('return', {
                    success: !1,
                    error: '缺少图片URL',
                  });
                case 4:
                  if (((e.prev = 4), (a = s), !s.startsWith('cloud://'))) {
                    e.next = 11;
                    break;
                  }
                  return (e.next = 9), t.getTempFileURL({ fileList: [s] });
                case 9:
                  (i = e.sent), (a = i.fileList[0].tempFileURL);
                case 11:
                  return e.abrupt('return', {
                    success: !0,
                    needClientVision: !0,
                    imageUrl: a,
                    message: '请在小程序端或其他识别服务中继续处理图片',
                  });
                case 14:
                  return (
                    (e.prev = 14),
                    (e.t0 = e.catch(4)),
                    console.error('处理失败:', e.t0),
                    e.abrupt('return', {
                      success: !1,
                      error: e.t0.message || '处理失败',
                    })
                  );
                case 18:
                case 'end':
                  return e.stop();
              }
          },
          r,
          null,
          [[4, 14]],
        );
      }),
    );
    return function (e) {
      return n.apply(this, arguments);
    };
  })());
