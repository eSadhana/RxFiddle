import { Direction, edges, foreachTuple, mapTuple } from "./index"
import { Graph } from "graphlib"

export type Layout = { y: number, x: number, id: string }[]
export function priorityLayout(
  ranks: string[][],
  g: Graph,
  focusNodes: string[] = [],
  distance: (a: string, b: string) => number | undefined = () => undefined
): Layout {

  let nodes = ranks.map((row, y) => {
    // Initial spacing
    let deltas = mapTuple("down", row, (a, b) => distance(a, b) || 1)
    let xs: number[] = []
    let x = 0
    for (let i = 0; i < deltas.length; i++) {
      xs.push(x)
      x += deltas[i]
    }
    xs.push(x)
    return row.map((n, i) => ({
      barycenter: 0,
      id: n,
      isDummy: false,
      priority: 0,
      y,
      x: xs[i],
    }))
  })

  for (let i = 0; i < 20; i++) {
    let direction: Direction = i % 2 === 0 ? "down" : "up"
    foreachTuple(direction, nodes, (row, ref) => {
      row.forEach(item => {
        if (focusNodes.indexOf(item.id) >= 0) {
          item.priority = Number.MAX_SAFE_INTEGER
          item.barycenter = 0
        } else {
          item.priority = item.isDummy ? Number.MAX_SAFE_INTEGER / 2 : priority(
            g,
            direction,
            item.id
          )
          item.barycenter = barycenter(
            g,
            direction,
            item.id,
            linked => head(ref.filter(r => r.id === linked).map(r => r.x))
          )
        }
      })
      priorityLayoutAlign(row, distance)
      return row
    })
  }
  shiftOffset(nodes)

  return nodes.flatMap(id => id)
}

function shiftOffset<T extends { x: number }>(layers: T[][]) {
  let max = Number.MAX_SAFE_INTEGER
  let offset = layers.reduce((l, layer) => Math.min(l, layer.reduce((p, item) => Math.min(p, item.x), max)), max)
  layers.forEach(layer => layer.forEach(item => {
    item.x -= offset
  }))
}

export function head<T>(list: T[]): T {
  return list[0]
}

function linkedNodes(g: Graph, direction: Direction, node: string): string[] {
  if (!g.hasNode(node)) {
    console.warn("looking for non-graph node", node)
    return []
  }
  return direction === "down" ?
    g.inEdges(node).map(e => e.v) :
    g.outEdges(node).map(e => e.w)
}

function avg(list: number[]): number {
  if (list.length === 0) { return undefined }
  if (list.length === 1) { return list[0] }
  return list.reduce((sum, v) => sum + (v / list.length), 0)
}

function barycenter(g: Graph, direction: "up" | "down", node: string, ref: (node: string) => number): number {
  let nodes = linkedNodes(g, direction, node)
  // Find Barycenter
  let positions = nodes.map(ref).filter(v => typeof v === "number")
  return avg(positions)
}

function priority(g: Graph, direction: "up" | "down", node: string): number {
  let nodes = linkedNodes(g, direction, node)
  return nodes.length
}

function absMin(a: number, b: number): number {
  return Math.abs(a) < Math.abs(b) ? a : b
}
export type PriorityLayoutItem = {
  id: string,
  x: number,
  readonly priority: number,
  readonly barycenter: number,
  readonly spacing?: number,
}
export function priorityLayoutAlign<Label>(
  items: PriorityLayoutItem[],
  distance: (a: string, b: string) => number | undefined = () => undefined
): void {
  let move = (priority: number, index: number, requestedShift: number): number => {
    let subject = items[index]
    if (subject.priority > priority || requestedShift === 0) { return 0 }
    if (items.length === index + 1 && requestedShift > 0) {
      subject.x += requestedShift
      return requestedShift
    }
    if (index === 0 && requestedShift < 0) {
      let slack = Math.max(0, subject.x)
      let moved = Math.max(requestedShift, -slack)
      subject.x += moved
      return moved
    }
    let next = index + Math.sign(requestedShift)
    let dist = distance(subject.id, items[next].id)
    let spacing = dist || 1
    // Remove slack if distance is explicit
    let slack = // typeof dist === "undefined" ?
      absMin(requestedShift, items[next].x - subject.x - Math.sign(requestedShift) * spacing) // :
    // 0
    // Bubble move
    let nextMoved = move(priority, next, requestedShift - slack)
    subject.x += slack + nextMoved
    return slack + nextMoved
  }

  // let backup = items.map(i => i.x)
  // let beforeDistance = items.map(i => i.barycenter - i.x).reduce((sum, n) => sum + n, 0)

  items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.priority - a.item.priority)
    .forEach(({ item, index }) => {
      if (typeof item.barycenter !== "undefined") {
        move(item.priority, index, item.barycenter - item.x)
      }
    })

  // let afterDistance = items.map(i => i.barycenter - i.x).reduce((sum, n) => sum + n, 0)
  // if(afterDistance > beforeDistance) {
  //   backup.forEach((x, index) => items[index].x = x)
  // }
}