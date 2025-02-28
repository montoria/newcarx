export class LinkedListNode<T> {
  value: T
  prev?: LinkedListNode<T>
  next?: LinkedListNode<T>

  constructor(value: T) {
    this.value = value
  }
}

export class LinkedList<T> {
  head?: LinkedListNode<T>
  tail?: LinkedListNode<T>

  add(value: T) {
    const node = new LinkedListNode(value)
    if (!this.head) {
      this.head = node
      this.tail = node
    }
    else {
      this.tail!.next = node
      node.prev = this.tail
      this.tail = node
    }

    return node
  }

  remove(node: LinkedListNode<T>) {
    if (node.prev) {
      node.prev.next = node.next
    }
    if (node.next) {
      node.next.prev = node.prev
    }

    if (node === this.head) {
      this.head = node.next
    }
    if (node === this.tail) {
      this.tail = node.prev
    }
  }

  clear() {
    this.head = undefined
    this.tail = undefined
  }

  *[Symbol.iterator]() {
    let current = this.head
    while (current) {
      yield current
      current = current.next
    }
  }
}
