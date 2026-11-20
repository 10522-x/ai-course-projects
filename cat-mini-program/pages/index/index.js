const toys = [
  { id: 'ball', name: '毛线球', color: 'blue', image: '/assets/art/optimized/yarn-ball-blue.webp' },
  { id: 'mouse', name: '小老鼠', color: 'blue', image: '/assets/art/optimized/mouse.webp' },
  { id: 'bird', name: '小鸟', color: 'yellow', image: '/assets/art/optimized/bird.webp' }
]

const backgrounds = {
  plain: { name: '纯色', className: 'bg-plain' },
  sky: { name: '浅蓝', className: 'bg-sky' },
  grass: { name: '草地', className: 'bg-grass' },
  wood: { name: '木地板', className: 'bg-wood' }
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const randomBetween = (min, max) => min + Math.random() * (max - min)
const normalizeAngle = (angle) => {
  let value = angle % 360
  if (value > 180) value -= 360
  if (value <= -180) value += 360
  return value
}
const approachAngle = (current, target, amount) => current + normalizeAngle(target - current) * amount

Page({
  data: {
    toys,
    currentToy: toys[0],
    currentIndex: 0,
    background: backgrounds.plain,
    catVision: true,
    position: { left: 50, top: 45 },
    rotation: 0,
    escaping: false,
    speed: 2
  },

  onLoad() {
    this.syncSettings()
    this.startMotion()
  },

  onReady() {
    wx.createSelectorQuery().select('.scene').boundingClientRect((rect) => {
      this.sceneRect = rect
    }).exec()
  },

  onShow() {
    this.syncSettings()
    if (!this.motionTimer) this.startMotion()
  },

  onHide() {
    this.stopMotion()
  },

  onUnload() {
    this.stopMotion()
  },

  syncSettings() {
    const saved = wx.getStorageSync('catSettings') || {}
    this.setData({
      background: backgrounds[saved.background] || backgrounds.plain,
      catVision: true,
      speed: saved.speed || 2
    })
  },

  startMotion() {
    this.stopMotion()
    this.motion = {
      x: 50,
      y: 45,
      vx: 0,
      vy: 0,
      targetX: 50,
      targetY: 45,
      state: 'pause',
      stateUntil: Date.now() + randomBetween(500, 1000),
      lastTime: Date.now(),
      rotation: this.data.currentToy.id === 'ball' ? 140 : 0
    }
    this.setData({ rotation: this.motion.rotation })
    this.motionTimer = setInterval(() => this.stepMotion(), 34)
  },

  stopMotion() {
    if (this.motionTimer) clearInterval(this.motionTimer)
    this.motionTimer = null
    this.motion = null
  },

  chooseNextTarget(kind) {
    const m = this.motion
    const angle = Math.atan2(m.vy, m.vx) + randomBetween(-1.25, 1.25)
    const distance = kind === 'burst' ? randomBetween(20, 33) : randomBetween(13, 27)
    m.targetX = clamp(m.x + Math.cos(angle) * distance, 13, 87)
    m.targetY = clamp(m.y + Math.sin(angle) * distance * 0.8, 16, 77)
    m.state = kind
    m.stateUntil = Date.now() + (kind === 'burst' ? randomBetween(420, 760) : randomBetween(850, 1550))
  },

  beginPause(min = 420, max = 1150) {
    const m = this.motion
    m.state = 'pause'
    m.vx *= 0.35
    m.vy *= 0.35
    m.stateUntil = Date.now() + randomBetween(min, max)
  },

  stepMotion() {
    const m = this.motion
    if (!m) return

    const now = Date.now()
    const dt = Math.min((now - m.lastTime) / 1000, 0.08)
    m.lastTime = now

    if (m.state === 'pause') {
      m.vx *= Math.pow(0.08, dt)
      m.vy *= Math.pow(0.08, dt)
      if (now >= m.stateUntil) {
        this.chooseNextTarget(Math.random() < 0.16 ? 'burst' : 'move')
      }
    } else {
      const dx = m.targetX - m.x
      const dy = m.targetY - m.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const speedScale = this.data.speed === 3 ? 1.22 : this.data.speed === 1 ? 0.78 : 1
      const maxSpeed = (m.state === 'escape' ? 88 : m.state === 'burst' ? 43 : 25) * speedScale
      const acceleration = (m.state === 'escape' ? 230 : m.state === 'burst' ? 105 : 62) * speedScale

      if (distance < 2.2 || now >= m.stateUntil) {
        if (m.state === 'escape') {
          this.setData({ escaping: false })
          this.beginPause(380, 820)
        } else if (Math.random() < 0.24) {
          this.beginPause(500, 1250)
        } else {
          this.chooseNextTarget(Math.random() < 0.18 ? 'burst' : 'move')
        }
      } else {
        const desiredVx = dx / distance * maxSpeed
        const desiredVy = dy / distance * maxSpeed
        const steering = Math.min(1, acceleration * dt / maxSpeed)
        m.vx += (desiredVx - m.vx) * steering
        m.vy += (desiredVy - m.vy) * steering
        m.x += m.vx * dt
        m.y += m.vy * dt
      }
    }

    if (m.x < 11 || m.x > 89) {
      m.x = clamp(m.x, 11, 89)
      m.vx *= -0.5
      m.targetX = clamp(m.targetX, 13, 87)
    }
    if (m.y < 14 || m.y > 80) {
      m.y = clamp(m.y, 14, 80)
      m.vy *= -0.5
      m.targetY = clamp(m.targetY, 16, 77)
    }

    const velocity = Math.sqrt(m.vx * m.vx + m.vy * m.vy)
    if (velocity > 1.5) {
      const direction = Math.atan2(m.vy, m.vx) * 180 / Math.PI
      const targetRotation = this.data.currentToy.id === 'ball'
        ? direction + 180 - 42
        : clamp(direction, -18, 18)
      m.rotation = approachAngle(m.rotation, normalizeAngle(targetRotation), Math.min(1, dt * (m.state === 'escape' ? 10 : 7)))
    }
    this.setData({
      position: { left: m.x, top: m.y },
      rotation: m.rotation
    })
  },

  selectToy(e) {
    const index = Number(e.currentTarget.dataset.index)
    this.setData({
      currentIndex: index,
      currentToy: toys[index],
      position: { left: 50, top: 45 },
      rotation: toys[index].id === 'ball' ? 140 : 0,
      escaping: false
    })
    this.startMotion()
  },

  interact(e) {
    const m = this.motion
    if (!m) return

    const touch = e.touches && e.touches[0]
    const rect = this.sceneRect
    const width = rect && rect.width ? rect.width : wx.getWindowInfo().windowWidth
    const height = rect && rect.height ? rect.height : wx.getWindowInfo().windowHeight
    const rawX = touch && (touch.clientX ?? touch.pageX ?? touch.x)
    const rawY = touch && (touch.clientY ?? touch.pageY ?? touch.y)
    const detailX = e.detail && typeof e.detail.x === 'number' ? e.detail.x : null
    const detailY = e.detail && typeof e.detail.y === 'number' ? e.detail.y : null
    const pageX = detailX ?? rawX ?? width / 2
    const pageY = detailY ?? rawY ?? height / 2
    const localX = rect ? pageX - rect.left : pageX
    const localY = rect ? pageY - rect.top : pageY
    const touchX = clamp((localX / width) * 100, 0, 100)
    const touchY = clamp((localY / height) * 100, 0, 100)
    let dx = m.x - touchX
    let dy = m.y - touchY
    const length = Math.sqrt(dx * dx + dy * dy) || 1

    dx /= length
    dy /= length
    const escapeDistance = randomBetween(34, 52)
    m.targetX = clamp(m.x + dx * escapeDistance, 9, 91)
    m.targetY = clamp(m.y + dy * escapeDistance, 10, 84)
    m.vx += dx * 22
    m.vy += dy * 22
    m.state = 'escape'
    m.stateUntil = Date.now() + randomBetween(480, 760)

    this.setData({ escaping: true })
    wx.vibrateShort({ type: 'light' })
  },

  openSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' })
  }
})
