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
  private _subNode?: AnimationTimelineNodeImpl
  public _onCompleted?: () => void

  constructor(
    public readonly timeline: AnimationTimelineImpl,
    public readonly duration: number,
    public readonly animator?: Animator,
    public readonly timing?: TimingFunction,
    private readonly _onError?: (err: any) => void,
    private _prevNode?: AnimationTimelineNodeImpl,
    private _nextNode?: AnimationTimelineNodeImpl,
  ) { }

  _tick(ts: number): boolean {
    if (this._completed || this._error) {
      return true
    }

    try {
      if (!this._started) {
        this._initializeAnimation()
      }

      return this._processAnimationFrame(ts)
    }
    catch (e: any) {
      this._handleError(e)
      return true
    }
  }

  private _initializeAnimation(): void {
    this._started = true
    this._startTime = this.timeline.clock.now()
  }

  private _processAnimationFrame(ts: number): boolean {
    const progress = this._calculateProgress(ts)
    this._applyAnimation(progress)
    return progress >= 1
  }

  private _calculateProgress(now: number): number {
    const elapsed = now - this._startTime
    return Math.min(Math.max(elapsed / this.duration, 0), 1)
  }

  private _applyAnimation(progress: number): void {
    if (this.animator) {
      const timingProgress = this.timing ? this.timing(progress) : progress
      this.animator(timingProgress, progress)
    }
  }

  private _handleError(e: any): void {
    this._error = true
    this._onError?.(e)
  }

  _complete(): void {
    if (this._completed) {
      return
    }

    this._completed = true

    if (this._subNode && !this._error) {
      this._replace(this._subNode)
    }
    else {
      this._remove()
    }
  }

  private _replace(node: AnimationTimelineNodeImpl): void {
    node._prevNode = this._prevNode
    node._nextNode = this._nextNode

    this._updateTimelineReferences(node)
    this._updateNodeLinks(node)
    this._onCompleted?.()
  }

  private _updateTimelineReferences(node: AnimationTimelineNodeImpl): void {
    const timeline = this.timeline as any

    if (timeline._tailNode == this) {
      timeline._tailNode = node
    }

    if (timeline._nextNode == this) {
      timeline._nextNode = node
    }
  }

  private _updateNodeLinks(node: AnimationTimelineNodeImpl): void {
    if (this._prevNode) {
      this._prevNode._nextNode = node
    }

    if (this._nextNode) {
      this._nextNode._prevNode = node
    }
  }

  private _remove(): void {
    const timeline = this.timeline as any

    if (this._prevNode) {
      this._prevNode._nextNode = this._nextNode
    }
    else {
      timeline._nextNode = this._nextNode
    }

    if (this._nextNode) {
      this._nextNode._prevNode = this._prevNode
    }

    if (timeline._tailNode === this) {
      timeline._tailNode = this._prevNode
    }

    if (timeline._nextNode === this) {
      timeline._nextNode = this._nextNode
    }

    this._onCompleted?.()
  }

  revoke(): void {
    if (!this._completed) {
      this._completed = true
      this._remove()
    }

    this._revokeSubNodes()
  }

  private _revokeSubNodes(): void {
    if (!this._subNode) {
      return
    }

    let current: AnimationTimelineNodeImpl | undefined = this._subNode
    while (current) {
      if (!current._completed) {
        current._completed = true
        current._remove()
      }
      current = current._subNode
    }
  }

  sub(index: number): AnimationTimelineNode | undefined
  sub(index: 0): this
  sub(index: number): AnimationTimelineNode | this | undefined {
    let current: AnimationTimelineNodeImpl | undefined = this
    let i = 0

    while (current && i !== index) {
      current = current._subNode
      i++
    }

    return current as any
  }

  get startTime(): number | undefined {
    return this._startTime
  }

  get started(): boolean {
    return this._started
  }

  get completed(): boolean {
    return this._completed
  }

  get error(): boolean {
    return this._error
  }
}

export type AnimationInitial =
  | { duration: number, animator?: Animator, timing?: TimingFunction }
  | [duration: number, animator?: Animator, timing?: TimingFunction]
  | number // delay (ms)

export type AnimationPromise = Promise<AnimationTimeline> & { revoke: () => void, readonly node: AnimationTimelineNode, readonly promise: Promise<AnimationTimeline> }
export type Deferred<T> = [promise: Promise<T>, resolve: (value: T) => void, reject: (err: any) => void]

export const linear: TimingFunction = x => x
export const noop: Animator = (_) => { }

export function deferred<T>(): Deferred<T> {
  let resolve, reject
  const promise = new Promise<T>((r, j) => {
    resolve = r
    reject = j
  })

  return [promise, resolve!, reject!]
}

export interface AnimationTimeline {
  /**
   * Create and add a new animation sequence
   * @param inits Animation initialization parameters
   */
  animate: (...inits: AnimationInitial[]) => AnimationPromise

  /**
   * Revoke a specified animation node
   * @param node The animation node to revoke
   * @param deep Whether to perform deep search in child nodes
   */
  revoke: (node: AnimationTimelineNode, deep?: boolean) => boolean

  /**
   * Start the timeline
   */
  start: () => void

  /**
   * Pause the timeline
   */
  pause: () => void

  /**
   * Resume the timeline
   */
  resume: () => void

  /**
   * Reset the timeline
   */
  reset: () => void

  /**
   * Loop execution of animation function
   * @param fn The animation function to loop
   */
  loop: (fn: (timeline: this) => (Promise<unknown> | Promise<unknown>[])) => Promise<AnimationTimeline> & { stop: () => void }

  /**
   * Wait for all promises to complete
   * @param promises Array of promises to wait for
   */
  all: (...promises: Promise<unknown>[]) => Promise<this>

  /**
   * Create a delay animation
   * @param duration Delay duration in milliseconds
   */
  delay: (duration: number) => AnimationPromise

  /**
   * Repeat animation sequence
   * @param count Number of repetitions
   * @param inits Animation initialization parameters
   */
  repeat: (count: number, ...inits: AnimationInitial[]) => AnimationPromise

  /**
   * Define a reusable animation function
   * @param fn Animation function
   */
  define: <T extends AnimateFn>(fn: T) => ((timeline?: AnimationTimeline) => ReturnType<T>)

  /**
   * Execute animation function once
   * @param fn Animation function
   */
  once: <T extends AnimateFn>(fn: T) => ReturnType<T>

  /**
   * Animation clock
   */
  readonly clock: AnimationClock
}

class AnimationTimelineImpl implements AnimationTimeline {
  private _nextNode?: AnimationTimelineNodeImpl
  private _tailNode?: AnimationTimelineNodeImpl
  private _timer?: number
  private readonly _clock: AnimationClock = new AnimationClock()
  private _isPolling: boolean = false

  public readonly animate = this.enqueue.bind(this)

  enqueue(first: AnimationInitial, ...inits: AnimationInitial[]): AnimationPromise
  enqueue(...inits: AnimationInitial[]): AnimationPromise | undefined
  enqueue(...inits: AnimationInitial[]): AnimationPromise | undefined {
    this._validateAnimationInitials(inits)
    const normalizedInits = this._normalizeAnimationInitials(inits)
    const [promise, resolve, reject] = deferred<this>()
    const rootNode = this._createRootNode(normalizedInits[0], reject)

    this._linkRootNode(rootNode)
    this._createAndLinkChildNodes(rootNode, normalizedInits.slice(1), reject, resolve)
    if (!this._isPolling) {
      this.start()
    }

    return this._createAnimationPromise(promise, rootNode)
  }

  async all(...promises: Promise<unknown>[]): Promise<this> {
    await Promise.all(promises)
    return this
  }

  private _validateAnimationInitials(inits: AnimationInitial[]): void {
    if (inits.length < 1) {
      throw new Error('Animation initialization parameters cannot be empty')
    }
  }

  private _normalizeAnimationInitials(inits: AnimationInitial[]): Array<{ duration: number, animator?: Animator, timing?: TimingFunction }> {
    return inits.map((init) => {
      if (typeof init === 'number') {
        return { duration: init }
      }
      if (Array.isArray(init)) {
        const [duration, animator, timing] = init
        return { duration, animator, timing }
      }
      return init
    })
  }

  private _createRootNode(
    init: { duration: number, animator?: Animator, timing?: TimingFunction },
    reject: (err: any) => void,
  ): AnimationTimelineNodeImpl {
    return new AnimationTimelineNodeImpl(
      this,
      init.duration,
      init.animator,
      init.timing,
      reject,
      this._tailNode,
    )
  }

  private _linkRootNode(rootNode: AnimationTimelineNodeImpl): void {
    if (!this._nextNode) {
      this._nextNode = rootNode
    }

    if (this._tailNode) {
      (this._tailNode as any)._nextNode = rootNode
    }
    this._tailNode = rootNode
  }

  private _createAndLinkChildNodes(
    rootNode: AnimationTimelineNodeImpl,
    inits: Array<{ duration: number, animator?: Animator, timing?: TimingFunction }>,
    reject: (err: any) => void,
    resolve: (value: this) => void,
  ): void {
    let currentNode: AnimationTimelineNodeImpl = rootNode

    for (const init of inits) {
      const childNode = new AnimationTimelineNodeImpl(
        this,
        init.duration,
        init.animator,
        init.timing,
        reject,
      )
      ;(currentNode as any)._subNode = childNode
      currentNode = childNode
    }

    currentNode._onCompleted = () => resolve(this)
  }

  private _createAnimationPromise(promise: Promise<this>, rootNode: AnimationTimelineNodeImpl): AnimationPromise {
    const animationPromise = Object.assign(promise, {
      revoke: rootNode.revoke.bind(rootNode),
      node: rootNode,
    }) as unknown as AnimationPromise

    Object.defineProperty(animationPromise, 'promise', {
      get() {
        return promise
      },
    })

    return animationPromise
  }

  private _poll(): boolean {
    if (this._clock.isPaused || !this._nextNode) {
      return false
    }

    const now = this._clock.now()
    const nodesToComplete = this._processNodes(now)

    if (nodesToComplete.size > 0) {
      this._completeNodes(nodesToComplete)
    }

    const hasMoreNodes = this._nextNode != null
    if (!hasMoreNodes) {
      this._isPolling = false
    }

    return hasMoreNodes
  }

  private _processNodes(ts: number): Set<AnimationTimelineNodeImpl> {
    const nodesToComplete = new Set<AnimationTimelineNodeImpl>()
    let currentNode: any = this._nextNode

    while (currentNode) {
      if (currentNode._tick(ts)) {
        nodesToComplete.add(currentNode)
      }
      currentNode = currentNode._nextNode
    }

    return nodesToComplete
  }

  private _completeNodes(nodes: Set<AnimationTimelineNodeImpl>): void {
    nodes.forEach(node => node._complete())
  }

  private _launch(): void {
    if (this._timer) {
      return
    }

    this._isPolling = true
    const loop = () => {
      if (this._poll()) {
        this._timer = requestAnimationFrame(loop)
      }
      else {
        this._cleanup()
      }
    }

    this._timer = requestAnimationFrame(loop)
  }

  private _cleanup(): void {
    this._timer = undefined
    this.reset()
  }

  pause(): void {
    if (!this.paused && this._timer != null) {
      cancelAnimationFrame(this._timer)
      this._clock.pause()
      this._timer = undefined
    }
  }

  start(): void {
    if (this._timer == null && !this.paused) {
      this._clock.reset()
      this._launch()
    }
  }

  resume(): void {
    if (this.paused) {
      this._clock.resume()
      this._launch()
    }
  }

  get paused(): boolean {
    return this._clock.isPaused
  }

  reset(): void {
    this._stopAnimation()
    this._resetState()
  }

  private _stopAnimation(): void {
    if (this._timer) {
      cancelAnimationFrame(this._timer)
      this._timer = undefined
    }
  }

  private _resetState(): void {
    this._clock.reset()
    this._nextNode = undefined
    this._tailNode = undefined
    this._isPolling = false
  }

  revoke(node: AnimationTimelineNode, deep = false): boolean {
    if (!(node instanceof AnimationTimelineNodeImpl) || node.timeline !== this) {
      return false
    }

    return this._findAndRevokeNode(node, deep)
  }

  private _findAndRevokeNode(targetNode: AnimationTimelineNodeImpl, deep: boolean): boolean {
    let currentNode: any = this._nextNode

    while (currentNode) {
      if (currentNode === targetNode) {
        currentNode.revoke()
        return true
      }

      if (deep) {
        const found = this._searchInSubNodes(currentNode, targetNode)
        if (found) {
          return true
        }
      }

      currentNode = currentNode.nextNode
    }

    return false
  }

  private _searchInSubNodes(node: AnimationTimelineNodeImpl, targetNode: AnimationTimelineNodeImpl): boolean {
    let subNode = (node as any)._subNode
    while (subNode) {
      if (subNode === targetNode) {
        subNode.revoke()
        return true
      }
      subNode = subNode._subNode
    }
    return false
  }

  loop(fn: (timeline: this) => (Promise<unknown> | Promise<unknown>[])): Promise<AnimationTimeline> & { stop: () => void } {
    let isActive = true

    const runLoop = async () => {
      // eslint-disable-next-line no-unmodified-loop-condition
      while (isActive) {
        const result = fn(this)
        await (Array.isArray(result) ? Promise.all(result.flat(1)) : result)
      }

      return this
    }

    return Object.assign(runLoop(), {
      stop: () => {
        isActive = false
      },
    })
  }

  delay(duration: number): AnimationPromise {
    return this.enqueue(animation(duration))
  }

  repeat(count: number, ...inits: AnimationInitial[]): AnimationPromise {
    this._validateAnimationInitials(inits)
    const repeatedInits = this._createRepeatedInits(count, inits)
    return this.enqueue(...repeatedInits)!
  }

  private _createRepeatedInits(count: number, inits: AnimationInitial[]): AnimationInitial[] {
    return Array.from({ length: count }, () => inits).flat()
  }

  define<T extends AnimateFn>(fn: T): (timeline?: AnimationTimeline) => ReturnType<T> {
    return (timeline?: AnimationTimeline) => fn(timeline ?? this) as ReturnType<T>
  }

  once<T extends AnimateFn>(fn: T): ReturnType<T> {
    return fn(this) as ReturnType<T>
  }

  get clock(): AnimationClock {
    return this._clock
  }
}

export function second(s: number): number {
  return s * 1000
}

export function createTimeline(): AnimationTimeline {
  return new AnimationTimelineImpl()
}

export function isTimeline(value: any): value is AnimationTimeline {
  return value instanceof AnimationTimelineImpl
}

export function animation(duration: number, animator?: Animator, timing?: TimingFunction): AnimationInitial {
  return { duration, animator, timing }
}

animation.delay = (duration: number) => animation(duration)

export type AnimateFn = (timeline: AnimationTimeline) => (AnimationPromise | Promise<AnimationTimeline> | Promise<void>)
