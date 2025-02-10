import type { AnimateFn, Animator } from './animation'
import { signal } from 'alien-signals'
import { animation, createTimeline, linear, second } from './animation'
import { _, Engine } from './engine'
import { easeBounce, reverse } from './timing'

const engine = new Engine()
const t = createTimeline()

export type MaybeAccessor<T> = T | (() => T)
export function toValue<T>(value: MaybeAccessor<T>): T {
  if (typeof value == 'function') {
    return (value as any)()
  }

  return value
}

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

  const move: Animator = s => y(s * 500)

  t.loop(
    t => t.animate(
      [second(0.5), move, reverse(linear)],
      [second(0.5), move, easeBounce],
      second(0.5),
    ),
  )

  return Rect({
    x: 100,
    y: () => y() + 100,
    width: 100,
    height: 100,
  })
}
