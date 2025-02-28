export type MaybeAccessor<T> = T | (() => T)
export function toValue<T>(value: MaybeAccessor<T>): T {
  if (typeof value == 'function') {
    return (value as any)()
  }

  return value
}
