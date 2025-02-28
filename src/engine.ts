import { effect } from 'alien-signals'

export type WidgetFactory<T> = (props: T) => RenderFn
export type RenderFn = (engine: any) => void

// eslint-disable-next-line ts/no-empty-object-type
export function _<T = {}>(fn: WidgetFactory<T>) {
  return fn
}

export class Engine {
  public element: HTMLCanvasElement = document.createElement('canvas')
  public ctx: CanvasRenderingContext2D = this.element.getContext('2d')!
  constructor() {}

  mount() {
    this.element.width = window.innerWidth * window.devicePixelRatio
    this.element.height = window.innerHeight * window.devicePixelRatio
    this.element.style.width = '100%'
    this.element.style.height = '100%'
    this.element.style.display = 'block'
    this.element.style.margin = '0'
    this.ctx.fillStyle = 'white'
    this.ctx.fillRect(0, 0, this.element.width, this.element.height)
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    document.body.style.margin = '0'
    document.body.appendChild(this.element)
  }

  run(render: RenderFn) {
    effect(() => {
      this.ctx.clearRect(0, 0, this.element.width, this.element.height)
      render(this)
    })
  }
}
