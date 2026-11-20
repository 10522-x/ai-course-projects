Page({
  data: { speed: 2, sound: true, catVision: false, backgroundName: '纯色', modeName: '好奇猫' },
  onShow() {
    const saved = wx.getStorageSync('catSettings') || {}
    this.setData({ speed: saved.speed || 2, sound: saved.sound !== false, catVision: !!saved.catVision, backgroundName: saved.backgroundName || '纯色', modeName: saved.modeName || '好奇猫' })
  },
  save(key, value) {
    const current = wx.getStorageSync('catSettings') || {}
    current[key] = value
    wx.setStorageSync('catSettings', current)
  },
  changeSpeed(e) {
    const speed = Number(e.detail.value) + 1
    this.setData({ speed })
    this.save('speed', speed)
  },
  toggleSound(e) {
    this.setData({ sound: e.detail.value })
    this.save('sound', e.detail.value)
  },
  toggleVision(e) {
    this.setData({ catVision: e.detail.value })
    this.save('catVision', e.detail.value)
  },
  chooseBackground() {
    wx.navigateTo({ url: '/pages/background/background' })
  },
  chooseMode() {
    wx.navigateTo({ url: '/pages/mode/mode' })
  },
  onBack() {
    wx.navigateBack()
  }
})
