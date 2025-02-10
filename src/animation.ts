/* eslint-disable ts/no-this-alias */
export type AnimationProgress = number

export type TimingFunction = (t: AnimationProgress) => AnimationProgress

export type Animator = (x: AnimationProgress, t: AnimationProgress) => void

export interface AnimationTimelineNode {
  sub: ((index: 0) => this) & ((index: number) => AnimationTimelineNode | undefined)

  revoke: () => void

  readonly started: boolean
  readonly startTime?: number
  readonly completed: boolean

  readonly timeline: AnimationTimeline
  readonly duration: number
  readonly animator?: Animator
  readonly timing?: TimingFunction

  readonly error: boolean
}

export class AnimationClock {
  private _pausedTime: number = 0
  private _isPaused: boolean = false
  private _offset: number = 0

  now(): number {
    if (this._isPaused) {
      return this._pausedTime
    }
    return performance.now() - this._offset
  }

  pause(): void {
    if (!this._isPaused) {
      this._pausedTime = this.now()
      this._isPaused = true
    }
  }

  resume(): void {
    if (this._isPaused) {
      this._offset += performance.now() - this._pausedTime
      this._isPaused = false
    }
  }

  get isPaused(): boolean {
    return this._isPaused
  }

  reset(): void {
    this._pausedTime = 0
    this._isPaused = false
    this._offset = 0
  }
}

class AnimationTimelineNodeImpl implements AnimationTimelineNode {
  private _started = false
  private _startTime!: number
  private _completed = false
  public _error = false
  public subNode?: AnimationTimelineNodeImpl
  public _onCompleted?: () => void

  constructor(
    public readonly timeline: AnimationTimelineImpl,
    public readonly duration: number,
    public readonly animator?: Animator,
    public readonly timing?: TimingFunction,
    private readonly _onError?: (err: any) => void,
    public prevNode?: AnimationTimelineNodeImpl,
    public nextNode?: AnimationTimelineNodeImpl,
  ) {}

  runStep(ts: number): boolean {
    try {
      if (!this._started) {
        this._started = true
        this._startTime = performance.now()
      }

      if (this._completed)
        return false

      if (ts > this._startTime + this.duration) {
        this.animator?.(this.timing ? this.timing(1) : 1, 1)
        return true
      }
      else if (ts < this._startTime) {
        this.animator?.(this.timing ? this.timing(0) : 0, 0)
        return false
      }
      else {
        const x = (ts - this._startTime) / this.duration
        this.animator?.(this.timing ? this.timing(x) : x, x)
        if (x >= 1) {
          return true
        }

        return false
      }
    }
    catch (e: any) {
      this._error = true
      this._onError?.(e)
      return true
    }
  }

  _complete(): void {
    if (this._completed) {
      return
    }

    this._completed = true

    if (this.subNode && !this._error) {
      this._replace(this.subNode)
    }
    else {
      this._remove()
    }
  }

  _replace(node: AnimationTimelineNodeImpl): void {
    node.prevNode = this.prevNode
    node.nextNode = this.nextNode

    if ((this.timeline as any).tailNode == this) {
      (this.timeline as any).tailNode = node
    }

    if ((this.timeline as any).nextNode == this) {
      (this.timeline as any).nextNode = node
    }

    if (this.prevNode) {
      this.prevNode.nextNode = node
    }

    if (this.nextNode) {
      this.nextNode.prevNode = node
    }

    this._onCompleted?.()
  }

  _remove(): void {
    if (this.prevNode) {
      this.prevNode.nextNode = this.nextNode
    }
    else {
      (this.timeline as any).nextNode = this.nextNode
    }

    if (this.nextNode) {
      this.nextNode.prevNode = this.prevNode
    }

    if ((this.timeline as any).tailNode == this) {
      (this.timeline as any).tailNode = this.prevNode
    }

    if ((this.timeline as any).nextNode == this) {
      (this.timeline as any).nextNode = this.nextNode
    }

    this._onCompleted?.()
  }

  revoke(): void {
    if (!this._completed) {
      this._completed = true
      this._remove()
    }

    if (this.subNode) {
      let anim: AnimationTimelineNodeImpl | undefined = this.subNode
      while (anim != null) {
        if (!anim._completed) {
          anim._completed = true
          anim._remove()
        }
        anim = anim.subNode
      }
    }
  }

  sub(index: number): AnimationTimelineNode | undefined
  sub(index: 0): this
  sub(index: number): AnimationTimelineNode | this | undefined {
    let node: AnimationTimelineNodeImpl | undefined = this
    let i = 0
    while (node != null) {
      if (i == index)
        return node as any
      i += 1
      node = node.subNode
    }
  }

  get startTime(): number | undefined {
    return this._startTime
  }

  get started() {
    return this._started
  }

  get completed() {
    return this._completed
  }

  get error() {
    return this._error
  }
}

export type AnimationInit =
  | { duration: number, animator?: Animator, timing?: TimingFunction }
  | [duration: number, animator?: Animator, timing?: TimingFunction]
  | number // delay (ms)

export type AnimationPromise = Promise<AnimationTimeline> & { revoke: () => void, readonly node: AnimationTimelineNode, readonly promise: Promise<AnimationTimeline>, readonly and: AnimationTimeline['animate'] }
export type Deferred<T> = [promise: Promise<T>, resolve: (value: T) => void, reject: (err: any) => void]

export const linear: TimingFunction = x => x
export const noop: Animator = (_) => {}

export function deferred<T>(): Deferred<T> {
  let resolve, reject
  const promise = new Promise<T>((r, j) => {
    resolve = r
    reject = j
  })

  return [promise, resolve!, reject!]
}

class AnimationTimelineImpl implements AnimationTimeline {
  private nextNode?: AnimationTimelineNodeImpl
  private tailNode?: AnimationTimelineNodeImpl
  public readonly clock: AnimationClock = new AnimationClock()
  private timer?: number

  public readonly animate = this.enqueue.bind(this)

  enqueue(first: AnimationInit, ...inits: AnimationInit[]): AnimationPromise
  enqueue(...i: AnimationInit[]): AnimationPromise | undefined
  enqueue(...i: AnimationInit[]): AnimationPromise | undefined {
    if (i.length < 1) {
      throw new Error('No animation inits provided')
    }

    const inits = i.map((init) => {
      if (typeof init === 'number') {
        return { duration: init }
      }
      else if (Array.isArray(init)) {
        return { duration: init[0], animator: init[1], timing: init[2] }
      }
      else {
        return init
      }
    })

    const [p, resolve, reject] = deferred<this>()

    const rootNode = new AnimationTimelineNodeImpl(this, inits[0].duration, inits[0].animator, inits[0].timing, reject, this.tailNode)

    if (this.nextNode == null) {
      this.nextNode = rootNode
    }

    if (this.tailNode) {
      this.tailNode.nextNode = rootNode
    }
    this.tailNode = rootNode

    let node: AnimationTimelineNodeImpl = rootNode

    const childReject = (e: any) => {
      reject(e)
      rootNode._error = true
    }

    for (let i = 1; i < inits.length; i += 1) {
      const subNode = new AnimationTimelineNodeImpl(this, inits[i].duration, inits[i].animator, inits[i].timing, childReject)
      node.subNode = subNode
      node = subNode
    }

    node._onCompleted = () => resolve(this)

    this.start()

    const p0 = Object.assign(p, {
      revoke: rootNode.revoke.bind(rootNode),
      node: rootNode,
    }) as any as AnimationPromise

    Object.defineProperty(p0, 'promise', {
      get() {
        return p
      },
    })

    Object.defineProperty(p0, 'and', {
      value: this.animate,
    })
    return p0
  }

  private poll(): boolean {
    if (this.clock.isPaused) {
      return true
    }

    const ts = this.clock.now()

    if (this.nextNode != null) {
      const shouldComplete = new Set<AnimationTimelineNodeImpl>()
      let node: AnimationTimelineNodeImpl | undefined = this.nextNode
      while (node != null) {
        if (node.runStep(ts))
          shouldComplete.add(node)

        node = node.nextNode
      }

      if (shouldComplete.size != 0)
        shouldComplete.forEach(node => node._complete())

      return this.nextNode != null
    }
    else {
      return false
    }
  }

  private _launch(): number {
    if (this.timer) {
      return this.timer
    }

    const loop = () => {
      if (this.poll()) {
        this.timer = requestAnimationFrame(loop)
      }
      else {
        this.timer = undefined
        this.reset()
      }
    }

    return this.timer = requestAnimationFrame(loop)
  }

  pause(): void {
    if (!this.paused && this.timer != null) {
      cancelAnimationFrame(this.timer)
      this.clock.pause()
      this.timer = undefined
    }
  }

  start(): void {
    if (this.timer == null && !this.paused) {
      this.clock.reset()
      this._launch()
    }
  }

  resume(): void {
    if (this.paused) {
      this.clock.resume()
      this._launch()
    }
  }

  get paused(): boolean {
    return this.clock.isPaused
  }

  reset(): void {
    if (this.timer) {
      cancelAnimationFrame(this.timer)
      this.timer = undefined
    }
    this.clock.reset()
    this.nextNode = undefined
    this.tailNode = undefined
  }

  revoke(node: AnimationTimelineNode, deep = false): boolean {
    if (node.timeline != this)
      return false

    let n: AnimationTimelineNodeImpl | undefined = this.nextNode

    while (n != null) {
      if (n == node) {
        n.revoke()
        return true
      }

      if (deep && n.subNode) {
        let s: AnimationTimelineNodeImpl | undefined = n.subNode
        while (s != null) {
          if (s == node) {
            s.revoke()
            return true
          }

          s = s.subNode
        }
      }

      n = n.nextNode
    }

    return false
  }

  all(...p: Promise<unknown>[]): Promise<this> {
    return Promise.all(p).then(() => this)
  }

  loop(fn: (timeline: this) => (Promise<unknown> | (Promise<unknown> | Promise<unknown>[])[])): () => void {
    let stop = false

    const loop = () => {
      const r = fn(this)
      ;(Array.isArray(r) ? Promise.all(r.flat(1)) : r).then(() => {
        if (!stop) {
          loop()
        }
      })
    }

    loop()

    return () => {
      stop = true
    }
  }

  delay(duration: number): AnimationPromise {
    return this.enqueue(animation(duration))
  }

  repeat(n: number, ...inits: AnimationInit[]): AnimationPromise {
    if (inits.length < 1) {
      throw new Error('No animation inits provided')
    }

    return this.enqueue(...Array.from({ length: n }, () => inits).flat())!
  }

  define<T extends AnimateFn>(fn: T): (timeline?: AnimationTimeline) => ReturnType<T> {
    return (timeline?: AnimationTimeline) => fn(timeline ?? this) as any
  }

  once<T extends AnimateFn>(fn: T): ReturnType<T> {
    return fn(this) as any
  }
}

export function second(s: number): number {
  return s * 1000
}

export function millisecond(ms: number): number {
  return ms
}

export function createTimeline(): AnimationTimeline {
  return new AnimationTimelineImpl()
}

export function isTimeline(value: any): value is AnimationTimeline {
  return value instanceof AnimationTimelineImpl
}

export function animation(duration: number, animator?: Animator, timing?: TimingFunction): AnimationInit {
  return { duration, animator, timing }
}

animation.delay = (duration: number) => animation(duration)

export type AnimateFn = (timeline: AnimationTimeline) => (AnimationPromise | Promise<AnimationTimeline> | Promise<void>)

export interface AnimationTimeline {
  animate: (...inits: AnimationInit[]) => AnimationPromise
  revoke: (node: AnimationTimelineNode, deep?: boolean) => boolean
  start: () => void
  pause: () => void
  resume: () => void
  reset: () => void
  loop: (fn: (timeline: this) => (Promise<unknown> | Promise<unknown>[])) => () => void
  all: (...p: Promise<unknown>[]) => Promise<this>
  delay: (duration: number) => AnimationPromise
  repeat: (n: number, ...inits: AnimationInit[]) => AnimationPromise
  define: <T extends AnimateFn>(fn: T) => ((timeline?: AnimationTimeline) => ReturnType<T>)
  once: <T extends AnimateFn>(fn: T) => ReturnType<T>

  readonly clock: AnimationClock
}
