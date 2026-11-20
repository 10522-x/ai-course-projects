const options = [
  { id: 'plain', name: '纯色', className: 'bg-plain', preview: '○' },
  { id: 'sky', name: '浅蓝', className: 'bg-sky', preview: '☁' },
  { id: 'grass', name: '草地', className: 'bg-grass', preview: '✿' },
  { id: 'wood', name: '木地板', className: 'bg-wood', preview: '▥' }
]

Page({
  data: { options, selected: 'plain' },
  onLoad() {
    const saved = wx.getStorageSync('catSettings') || {}
    this.setData({ selected: saved.background || 'plain' })
  },
  choose(e) {
    const item = e.currentTarget.dataset.item
    const current = wx.getStorageSync('catSettings') || {}
    current.background = item.id
    current.backgroundName = item.name
    wx.setStorageSync('catSettings', current)
    this.setData({ selected: item.id })
    setTimeout(() => wx.navigateBack(), 220)
  },
  onBack() {
    wx.navigateBack()
  }
})
