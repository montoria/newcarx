import type { AnimationEffect } from './animation'
import type { MaybeAccessor } from './utils'
import { signal } from 'alien-signals'
import { AnimationTimeline } from './animation'
import { easeBounce, linear, reverse } from './easing'
import { _, Engine } from './engine'
import { toValue } from './utils'

const engine = new Engine()
const t = new AnimationTimeline()

const Rect = _<{
  x: MaybeAccessor<number>
  y: MaybeAccessor<number>
  width: MaybeAccessor<number>
  height: MaybeAccessor<number>
}>(({ x, y, width, height }) => {
  return ({ ctx }) => {
    ctx.fillStyle = 'red'
    ctx.fillRect(
      toValue(x),
      toValue(y),
      toValue(width),
      toValue(height),
    )
  }
})

engine.mount()

engine.run(App())

function App() {
  const y = signal(0)

  const move: AnimationEffect = s => y(s * 500)

  t.infinite(
    t => t.animate(
      [
        [500, move, reverse(linear)],
        [500, move, easeBounce],
        [500],
      ],
    ),
  )

  return Rect({
    x: 100,
    y: () => y() + 100,
    width: 100,
    height: 100,
  })
}
