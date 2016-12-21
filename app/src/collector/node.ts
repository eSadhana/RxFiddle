import { StackFrame } from "../utils"
import { render as ASCII } from "./ascii"
import { AddObservable, AddSubscription } from "./logger"
import { centeredRect, centeredText } from "./shapes"
import { Visualizer } from "./visualizer"
import { Grapher } from "./grapher"
import * as snabbdom from "snabbdom"
import { PatchFunction, VNode } from "snabbdom"

/* tslint:disable:no-var-requires */
const h = require("snabbdom/h")

export function partition<T>(array: T[], fn: (item: T, index?: number, list?: T[]) => boolean): [T[], T[]] {
  let a:T[] = []
  let b:T[] = []
  for (let i = 0; i < array.length; i++) {
    if (fn(array[i], i, array)) {
      a.push(array[i])
    } else {
      b.push(array[i])
    }
  }
  return [a, b]
}

export class RxFiddleNode {
  public static wrap(inner: RxFiddleNode, outer: RxFiddleNode): RxFiddleNode {
    outer.nested.push(inner)
    return outer
  }

  public instances: ({ id: number })[] = []
  public observers: [{ id: number }, { id: number }, any[]][] = []

  public width = 120
  public height = 20
  public x: number
  public y: number


  public hoover: boolean = false
  public highlightIndex?: number
  public highlightId?: number
  public rendered: VNode

  public nested: RxFiddleNode[] = []

  private count: number = 0

  constructor(
    public id: string,
    public name: string,
    public location: StackFrame,
    // private visualizer: Visualizer
  ) { }

  public addObservable(instance: AddObservable) {
    this.instances.push(instance)
    return this
  }

  public get locationText(): string {
    return typeof this.location !== "undefined" ? this.location.source.replace(window.location.origin, "") : undefined
  }

  public addObserver(
    observable: AddObservable,
    observer: AddSubscription
  ): [{ id: number }, { id: number }, any[]] {
    this.observers.push([observable, observer, []])
    this.size()
    return this.observers[this.observers.length - 1]
  }

  public size(): { w: number, h: number } {
    let extra = { h: 0, w: 0 }
    let size = {
      h: this.observers.length * 20 + 20 + extra.h,
      w: Math.max(120, extra.w),
    }
    this.width = size.w
    this.height = size.h
    return size
  }

  public setHoover(enabled: boolean) {
    this.hoover = enabled
    return this
  }

  public layout() {
    this.size()
  }

  public setHighlight(index?: number) {
    this.highlightIndex = index
    this.highlightId = typeof index !== "undefined" ? (this.observers[index][1] as AddSubscription).id : undefined
    // this.visualizer.highlightSubscriptionSource(this.highlightId)
    return this
  }

  public setHighlightId(patch: snabbdom.PatchFunction, id?: number) {
    this.highlightIndex = this.observers.findIndex((o) => (o[1] as AddSubscription).id === id)
    this.highlightId = id
    try {
      if (this.rendered) {
        patch(this.rendered, this.render(patch))
      }
    } catch (e) {
      console.warn("error while rendering", this, this.count, e)
    }
    return this
  }

  public render(patch: snabbdom.PatchFunction, showIds: boolean = false) {
    let streams = ASCII(this.observers.map(_ => ({ events: _[2], id: showIds ? _[1].id + "" : undefined })))
      .map((stream, i) => centeredText(stream || "?", {
        fill: this.highlightIndex === i ? "red" : "black",
        y: this.line(i + 1), "font-family": "monospace",
      }, {
          on: {
            mouseout: () => patch(result, this.setHighlight().render(patch)),
            mouseover: () => patch(result, this.setHighlight(i).render(patch)),
          },
        }))
    if (typeof this.x === "undefined") { console.log("Undefined coords", this) }
    let result = h("g", {
      attrs: {
        height: this.height,
        id: `node-${this.id}`,
        transform: `translate(${this.x},${this.y})`,
        width: this.width,
      },
      on: {
        click: () => console.log(this),
        mouseout: () => patch(result, this.setHoover(false).render(patch)),
        mouseover: () => patch(result, this.setHoover(true).render(patch)),
      },
    }, [
      centeredRect(this.width, this.height, {
        rx: 10, ry: 10,
        "stroke-width": 2,
        stroke: this.hoover || typeof this.highlightId !== "undefined" ? "red" : "black",
      }),
      centeredText(showIds ? `${this.id} ${this.name}` : this.name, { y: this.line(0) }),
      // subgraph
      h("g", {
        attrs: { transform: `translate(${this.width / -2}, ${this.line(this.observers.length) + 10})` },
      }),
    ].concat(streams).filter(id => id))
    this.rendered = result
    this.count++
    return result
  }

  private line(i: number) {
    return -this.height / 2 + i * 20 + 10
  }
}