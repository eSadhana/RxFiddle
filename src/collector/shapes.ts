import * as snabbdom from "snabbdom"
import { h } from "snabbdom/h"
import { VNode } from "snabbdom/vnode"

export function centeredRect(width: number, height: number, opts: any = {}): VNode {
  return h("rect", {
    attrs: Object.assign({
      fill: "transparent",
      stroke: "black",
      "stroke-width": 2,
      width,
      height,
      x: -width / 2,
      y: -height / 2,
    }, opts),
  });
}

export function centeredText(text: string, attrs: any = {}, opts: any = {}): VNode {
  return h("text", Object.assign({
    attrs: Object.assign({
      x: 0,
      y: 0,
      "text-anchor": "middle",
      "alignment-baseline": "middle",
    }, attrs),
  }, opts), text)
}
