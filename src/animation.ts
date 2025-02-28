import type { LinkedListNode } from './linkedlist'
import { LinkedList } from './linkedlist'

export type AnimationEasingFn = (t: number) => number
export type AnimationEffect = (x: number, t: number) => void
export type AnimationInitial = [duration: number, effect?: AnimationEffect, easing?: AnimationEasingFn]
export type AnimationFn = (t: AnimationTimeline, signal?: AbortSignal) => PromiseLike<void> | PromiseLike<void>[] | void

export class AnimationNode {
  readonly duration: number
  readonly effect?: AnimationEffect
  readonly easing?: AnimationEasingFn

  started = false
  startTime?: number = -1

  constructor(
    [duration, effect, easing]: AnimationInitial,
  ) {
    this.duration = duration
    this.effect = effect
    this.easing = easing
  }

  apply(progress: number) {
    if (this.effect) {
      const x = this.easing ? this.easing(progress) : progress
      this.effect(x, progress)
    }
  }

  progress(now: number) {
    if (!this.started) {
      this.started = true
      this.startTime = now
    }

    const elapsed = now - this.startTime!
    return Math.min(Math.max(elapsed / this.duration, 0), 1)
  }

  tick(now: number, reverse: boolean) {
    const progress = this.progress(now)
    this.apply(reverse ? 1 - progress : progress)
    return progress >= 1
  }
}

export class AnimationSequence implements PromiseLike<void> {
  currentIndex = 0

  private _paused = false
  private _terminated = false
  private _promise: Promise<void>
  private _resolve?: (value: void) => void
  private _reject?: (reason: unknown) => void

  constructor(
    readonly nodes: AnimationNode[],
    readonly reverse = false,
    signal?: AbortSignal,
  ) {
    let resolve, reject
    this._promise = new Promise((_resolve, _reject) => {
      resolve = _resolve
      reject = _reject
    })

    this._resolve = resolve
    this._reject = reject

    if (signal) {
      if (signal.aborted) {
        this.terminate()
        return
      }

      signal.addEventListener('abort', () => this.terminate())
    }

    if (this.nodes.length > 1 && this.reverse) {
      this.nodes.reverse()
    }

    if (this.nodes.length < 1) {
      this.terminate()
    }
  }

  tick(now: number) {
    if (this._terminated) {
      return true
    }

    if (this._paused) {
      return false
    }

    try {
      if (this.nodes[this.currentIndex].tick(now, this.reverse)) {
        this.currentIndex++
      }
    }
    catch (error) {
      this._terminated = true
      this._reject?.(error)
      return true
    }

    const completed = this._terminated || this.currentIndex >= this.nodes.length
    if (completed) {
      this._terminated = true
      this._resolve?.()
    }

    return completed
  }

  pause() {
    this._paused = true
  }

  resume() {
    this._paused = false
  }

  terminate() {
    if (!this._terminated) {
      this._terminated = true
      this._resolve?.()
    }
  }

  then<TResult1 = void, TResult2 = never>(onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null | undefined, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined): Promise<TResult1 | TResult2> {
    return this._promise.then(onfulfilled, onrejected)
  }

  get terminated(): boolean {
    return this._terminated
  }

  get paused(): boolean {
    return this._paused
  }
}

export class AnimationClock {
  isPaused: boolean = false

  private _pausedTime: number = 0
  private _offset: number = 0

  now(): number {
    if (this.isPaused) {
      return this._pausedTime
    }
    return performance.now() - this._offset
  }

  pause(): void {
    if (!this.isPaused) {
      this._pausedTime = this.now()
      this.isPaused = true
    }
  }

  resume(): void {
    if (this.isPaused) {
      this._offset += performance.now() - this._pausedTime
      this.isPaused = false
    }
  }

  reset(): void {
    this._pausedTime = 0
    this.isPaused = false
    this._offset = 0
  }
}

export class AnimationTimeline {
  private _sequences: LinkedList<AnimationSequence> = new LinkedList()
  private _polling = false
  private _timer?: number

  private _clock = new AnimationClock()
  private _visibilityPause = false

  private readonly _visibilityChange = () => {
    if (document.visibilityState === 'visible' && this._visibilityPause) {
      this._clock.resume()
      this._visibilityPause = false
    }
    else if (!this._clock.isPaused) {
      this._clock.pause()
      this._visibilityPause = true
    }
  }

  constructor(private readonly _alwaysRun = false) {}

  private _tick(now: number) {
    if (this._sequences.head) {
      let sequence: LinkedListNode<AnimationSequence> | undefined = this._sequences.head
      while (sequence) {
        if (sequence.value.tick(now)) {
          this._sequences.remove(sequence)
        }
        sequence = sequence.next
      }
    }
  }

  private _startPolling() {
    if (this._polling) {
      return
    }

    this._polling = true
    if (!this._alwaysRun) {
      document.addEventListener('visibilitychange', this._visibilityChange)
    }

    const loop = () => {
      this._tick(this._clock.now())
      if (this._sequences.head != null && this._polling) {
        this._timer = requestAnimationFrame(loop)
      }
      else {
        this._polling = false
        this._timer = undefined
        this.reset()
      }
    }

    this._timer = requestAnimationFrame(loop)
  }

  private _animate(initials: AnimationInitial[], reverse?: boolean, signal?: AbortSignal) {
    const sequence = this._createSequence(initials, reverse, signal)
    this._sequences.add(sequence)

    if (!this._polling) {
      this._startPolling()
    }

    return sequence
  }

  private _createSequence(initials: AnimationInitial[], reverse?: boolean, signal?: AbortSignal) {
    if (initials.length === 0) {
      throw new Error('No animations to run')
    }

    const nodes = []
    for (let i = 0; i < initials.length; i++) {
      nodes[i] = new AnimationNode(initials[i])
    }

    return new AnimationSequence(nodes, reverse, signal)
  }

  delay(ms: number, signal?: AbortSignal) {
    return this._animate([[ms]], false, signal)
  }

  animate(nodes: AnimationInitial[], signal?: AbortSignal, reverse?: boolean) {
    return this._animate(nodes, reverse, signal)
  }

  reverse(nodes: AnimationInitial[], signal?: AbortSignal) {
    return this._animate(nodes, true, signal)
  }

  async alternate(nodes: AnimationInitial[], signal?: AbortSignal, reverse = false) {
    await this._animate(nodes, reverse, signal)
    await this._animate(nodes, !reverse, signal)
  }

  alternateReverse(nodes: AnimationInitial[], signal?: AbortSignal) {
    return this.alternate(nodes, signal, true)
  }

  async infinite<T extends AnimationFn>(fn: T, signal?: AbortSignal) {
    while (true) {
      await this.once(fn, signal)
      if (signal?.aborted) {
        break
      }
    }
  }

  async repeat<T extends AnimationFn>(fn: T, count: number, signal?: AbortSignal) {
    for (let i = 0; i < count; i++) {
      await this.once(fn, signal)
      if (signal?.aborted) {
        break
      }
    }
  }

  async once<T extends AnimationFn>(fn: T, signal?: AbortSignal) {
    const result = await fn(this, signal)
    if (Array.isArray(result)) {
      await Promise.all(result)
    }
  }

  func<T extends AnimationFn>(fn: T) {
    return fn
  }

  reset() {
    this._stopPolling()
    this._sequences.clear()
    this._clock.reset()
    if (!this._alwaysRun) {
      document.removeEventListener('visibilitychange', this._visibilityChange)
    }
  }

  pause() {
    if (!this._clock.isPaused) {
      this._clock.pause()
      this._stopPolling()
    }
  }

  resume() {
    if (this._clock.isPaused) {
      this._clock.resume()
      this._startPolling()
    }
  }

  get paused(): boolean {
    return this._clock.isPaused
  }

  _stopPolling() {
    this._polling = false
    if (this._timer) {
      cancelAnimationFrame(this._timer)
      this._timer = undefined
    }
  }
}
