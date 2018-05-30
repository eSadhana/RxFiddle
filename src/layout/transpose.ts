import "../utils"
import { crossings } from "./crossings"
import { OrderingOptions } from "./ordering"
import { Direction, ExternalSort, edges, flip, foreachTuple } from "./index"
import { Graph } from "graphlib"

export let debug = {
  on: false,
}

/*
 * @see http://www.graphviz.org/Documentation/TSE93.pdf page 16
 */
export function transpose(ranks: string[][], g: Graph, direction: Direction, options: OrderingOptions = { hierarchies: [] }): string[][] {
  let improved = true
  while (improved) {
    improved = false
    // walk tuples of ranks
    foreachTuple(direction, ranks, (rank, ref) => {
      // walk single rank by node tuples left-to-right
      foreachTuple("down", rank, (w, v, j, i) => {
        let es: { v: string, w: string }[] = edges(g, direction, [v, w])
        if (direction === "down") {
          es = flip(es)
        }

        let xsort = typeof options.externalSort === "undefined" ? 0 : options.externalSort(v, w)
        if (xsort > 0 || xsort === 0 && crossings([v, w], ref, es) > crossings([w, v], ref, es)) {
          improved = true
          swap(rank, i, j)
        }
      })
    })
  }

  return ranks
}

function swap<T>(list: T[], i: number, j: number) {
  let tmp = list[i]
  list[i] = list[j]
  list[j] = tmp
}
