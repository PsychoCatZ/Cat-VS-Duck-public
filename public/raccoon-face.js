export const raccoonMoods = {
  neutral: 'Деловой прищур',
  smug: 'Ехидная ухмылка',
  surprise: 'Удивление',
  annoyance: 'Раздражение',
}

export const raccoonSprite = new Image()
raccoonSprite.src = '/raccoon.png'

const mouths = {
  smug: 'M570 755 Q660 776 722 715 Q714 737 700 746',
  surprise: 'M617 752 a24 28 0 1 0 48 0 a24 28 0 1 0 -48 0',
  annoyance: 'M569 762 Q610 715 653 731 Q693 748 720 738',
}

export function drawRaccoon(canvas, mood) {
  if (!raccoonSprite.naturalWidth) return
  const brush = canvas.getContext('2d')
  brush.clearRect(0, 0, 256, 256)
  brush.drawImage(raccoonSprite, 0, 0, 256, 256)
  canvas.setAttribute('aria-label', `Енот — ${raccoonMoods[mood] || raccoonMoods.neutral}`)
  if (!Object.hasOwn(mouths, mood)) return
  brush.save()
  brush.scale(.2, .2)
  brush.fillStyle = '#ffe8bf'
  brush.fill(new Path2D('M544 744 Q624 693 736 709 L738 769 Q664 808 542 785 Z'))
  brush.strokeStyle = '#1c1613'
  brush.lineWidth = 12
  brush.lineCap = 'round'
  brush.stroke(new Path2D(mouths[mood]))
  if (mood === 'surprise') {
    brush.fillStyle = brush.strokeStyle
    brush.fill(new Path2D(mouths[mood]))
  }
  if (mood === 'annoyance') {
    brush.stroke(new Path2D('M411 438 L586 476 M678 471 L856 435'))
  }
  brush.restore()
}
