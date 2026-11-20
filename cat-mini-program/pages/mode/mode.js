const modes = [
  { id: 'curious', name: '好奇猫', desc: '喜欢探索，偶尔突然加速', image: '/assets/art/optimized/cat-curious.webp' },
  { id: 'hunter', name: '猎手猫', desc: '反应敏捷，追逐最强', image: '/assets/art/optimized/cat-hunter.webp' },
  { id: 'shy', name: '胆小猫', desc: '动作谨慎，遇见突然惊吓', image: '/assets/art/optimized/cat-shy.webp' },
  { id: 'lazy', name: '懒猫', desc: '移动缓慢，偶尔冲刺', image: '/assets/art/optimized/cat-lazy.webp' }
]

Page({
  data: { modes, selected: 'curious' },
  onLoad() {
    const saved = wx.getStorageSync('catSettings') || {}
    this.setData({ selected: saved.mode || 'curious' })
  },
  choose(e) {
    const mode = e.currentTarget.dataset.item
    const saved = wx.getStorageSync('catSettings') || {}
    saved.mode = mode.id
    saved.modeName = mode.name
    wx.setStorageSync('catSettings', saved)
    this.setData({ selected: mode.id })
  },
  onBack() {
    wx.navigateBack()
  }
})
