import { render as ASCII } from "./ascii"
import { ICollector } from "./logger"
import { centeredRect, centeredText } from "./shapes"
import { Visualizer } from "./visualizer"
import * as snabbdom from "snabbdom"

const h = require("snabbdom/h")

function marble() {

}

function partition<T>(array: T[], fn: (item: T, index?: number, list?: T[]) => boolean): [T[], T[]] {
  var a = [], b = []
  for (var i = 0; i < array.length; i++) {
    if (fn(array[i], i, array)) {
      a.push(array[i])
    } else {
      b.push(array[i])
    }
  }
  return [a, b]
}

export class RxFiddleNode {
  public instances: (Rx.Observable<any> | { id: number })[] = []
  public observers: [Rx.Observable<any> | { id: number }, Rx.Observer<any> | { id: number }, any[]][] = []
  private _subgraph: Visualizer | null

  constructor(
    public id: string,
    public name: string,
    public location: StackFrame
  ) { }

  public subGraph(): Visualizer {
    return this._subgraph
  }

  public createSubGraph(collector: ICollector): Visualizer {
    if (typeof this._subgraph === "undefined" || this._subgraph === null) {
      this._subgraph = new Visualizer(collector)
    }
    return this._subgraph
  }

  public addObservable(instance: Rx.Observable<any> | { id: number }) {
    this.instances.push(instance)
    return this
  }

  public addObserver(
    observable: Rx.Observable<any> | { id: number },
    observer: Rx.Observer<any> | { id: number }
  ): [Rx.Observable<any> | { id: number }, Rx.Observer<any> | { id: number }, any[]] {
    this.observers.push([observable, observer, []])
    this.size()
    return this.observers[this.observers.length - 1]
  }

  public migrate(observable: Rx.Observable<any>, oldNode: RxFiddleNode) {
    // migrate observable
    var [observableMigrate, observableOld] = partition(oldNode.instances, (item) => item === observable)
    oldNode.instances = observableOld
    this.instances.push.apply(this.instances, observableMigrate)
    // migrate observer
    var [observerMigrate, observerOld] = partition(oldNode.observers, (item) => item[0] === observable)
    oldNode.observers = observerOld
    this.observers.push.apply(this.observers, observerMigrate)
  }

  public width = 120
  public height = 20
  public x: number
  public y: number

  public size(): { w: number, h: number } {
    var extra = this._subgraph && this._subgraph.size() || { w: 0, h: 0 }
    let size = {
      w: Math.max(120, extra.w),
      h: this.observers.length * 20 + 20 + extra.h
    }
    this.width = size.w
    this.height = size.h
    return size
  }

  public hoover: boolean = false
  public rendered: VNode

  public nested: RxFiddleNode[] = []

  public static wrap(inner: RxFiddleNode, outer: RxFiddleNode): RxFiddleNode {
    outer.nested.push(inner)
    return outer
  }

  public setHoover(enabled: boolean) {
    this.hoover = enabled
    return this
  }

  private line(i: number) {
    return -this.height / 2 + i * 20 + 10
  }

  public layout() {
    this._subgraph && this._subgraph.layout()
    this.size()
  }

  public render(patch: snabbdom.PatchFunction) {
    var streams = ASCII(this.observers.map(_ => _[2])).map((stream, i) => centeredText(stream || "?", { y: this.line(i + 1), "font-family": "monospace" }))
    var result = h("g", {
      attrs: {
        transform: `translate(${this.x},${this.y})`,
        width: this.width, height: this.height
      },
      on: {
        click: () => console.log(this),
        mouseover: () => patch(result, this.setHoover(true).render(patch)),
        mouseout: () => patch(result, this.setHoover(false).render(patch))
      },
    }, [
      centeredRect(this.width, this.height, { rx: 10, ry: 10 }),
      centeredText(this.name, { y: this.line(0) }),
      // subgraph
      h("g", {
        attrs: { transform: `translate(${this.width / -2}, ${this.line(this.observers.length) + 10})` }
      }, [
        this._subgraph && this._subgraph.render()
      ].filter(id => id))
      // this.dialog()
      // this.hoover ? this.dialog() : undefined
    ].concat(streams).filter(id => id))
    this.rendered = result
    return result
  }

  private dialog() {
    let _w = 200, _h = 200
    let triangle = `M ${_w / -2 - 5} 0 l 5 -5 l 0 10 Z`
    return h("g", {
      attrs: { transform: `translate(${this.width / 2 + _w / 2 + 5},${0})`, width: _w, height: _h }
    }, [
        h("path", { attrs: { d: triangle, fill: "black" } }),
        centeredRect(_w, _h, { rx: 10, ry: 10, fill: "white", "z-index": 10 }),
      ])
  }
}