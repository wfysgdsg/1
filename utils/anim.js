/**
 * ========================================
 * 全局动画工具 — Spring 物理动画引擎
 * ========================================
 * 
 * 在页面 JS 中引入：
 * const anim = require('../../utils/anim.js')
 * 
 * onPageReady: anim.startSpringIn(this)
 * onCardTap: anim.tilt3D(this, e)
 */

/**
 * Spring 入场动画触发器
 * 在页面 onLoad 或 onReady 中调用
 */
function startSpringIn(page) {
  setTimeout(function() {
    page.setData({ _anim: true })
  }, 80)
}

/**
 * 3D 倾斜效果 — 通过 wx.createAnimation
 */
function tilt3D(page, key, rotateX, rotateY) {
  var animation = wx.createAnimation({
    duration: 300,
    timingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    delay: 0
  })
  animation.transformOrigin('center center')
  animation.rotateX(rotateX).rotateY(rotateY).translateZ(20).step()
  var data = {}
  data[key] = animation.export()
  page.setData(data)
}

/**
 * 3D 翻转效果 — 卡片翻转
 */
function flip3D(page, key) {
  var animation = wx.createAnimation({
    duration: 600,
    timingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    delay: 0
  })
  animation.rotateY(180).step({ duration: 300 })
  animation.rotateY(360).step({ duration: 300 })
  var data = {}
  data[key] = animation.export()
  page.setData(data)
}

/**
 * Spring 弹性按压
 */
function springPress(page, key) {
  var animation = wx.createAnimation({
    duration: 200,
    timingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  })
  animation.scale(0.92).translateZ(30).step()
  animation.scale(1).translateZ(0).step()
  var data = {}
  data[key] = animation.export()
  page.setData(data)
}

/**
 * 深度滑入 — 从右侧带 3D 旋转滑入
 */
function slideInDepth(page, key) {
  var animation = wx.createAnimation({
    duration: 500,
    timingFunction: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  })
  animation.translateX(60).translateZ(-50).rotateY(-15).opacity(0).step({ duration: 0 })
  animation.translateX(0).translateZ(0).rotateY(0).opacity(1).step()
  var data = {}
  data[key] = animation.export()
  page.setData(data)
}

module.exports = {
  startSpringIn: startSpringIn,
  tilt3D: tilt3D,
  flip3D: flip3D,
  springPress: springPress,
  slideInDepth: slideInDepth
}
