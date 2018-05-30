import deepCover from "../../test/deepCover"
import TypedGraph from "../collector/typedgraph"
import { crossings } from "../layout/crossings"
import { transpose } from "../layout/transpose"
import layoutf from "./layout"
import { expect } from "chai"
import { Graph } from "graphlib"
import { suite, test } from "mocha-typescript"

function asGraph(es: { v: string, w: string }[]): Graph {
  let g = new Graph()
  es.forEach(({ v, w }) => g.setEdge(v, w))
  return g
}

@suite
export default class VisualizationLayoutTest {

  public rowEdges = [
    { v: "a", w: "1" },
    { v: "a", w: "2" },
    { v: "b", w: "1" },
    { v: "c", w: "1" },
    { v: "d", w: "1" },
  ]

  @test
  public "test sample E, crossings before"() {
    let c = crossings(["a", "b", "c", "d"], ["1", "2"], this.rowEdges)
    expect(c).to.eq(3)
  }

  @test
  public "test sample E, crossings fixed"() {
    let c = crossings(["a", "b", "c", "d"], ["2", "1"], this.rowEdges)
    expect(c).to.eq(0)
  }

  @test
  public "test sample E, transpose"() {
    let g = asGraph(this.rowEdges)
    ///   -a---b-c-d-
    ///    |   / / /
    ///    |\ ////
    ///    | //
    ///    |/  \ 
    ///   -1----2-----
    let i = [["a", "b", "c", "d"], ["1", "2"]]
    ///   -a---b-c-d-
    ///    |   | | |
    ///    |\  | | |
    ///    |  \| | |
    ///    |   \\|/
    ///   -2-----1-----
    let e = [["a", "b", "c", "d"], ["2", "1"]]

    i = transpose(i, g, "down")
    i = transpose(i, g, "up")

    expect(i.join(";")).to.deep.eq(e.join(";"))
    expect(crossings(i[0], i[1], this.rowEdges)).to.eq(0)
  }

  @test
  public "test sample E, fully"() {
    let g = new TypedGraph<string, any>()
    let es = "0/2,7/8,2/8,2/7,24/26,26/7,36/38,38/7,48/50,50/7"
    es.split(",").map(e => e.split("/")).forEach(([v, w]) => {
      g.setEdge(v, w)
      g.setNode(v, {} as any)
      g.setNode(w, {} as any)
    })

    let actual = layoutf(g)

    let expected = [
      { id: "24", x: 0, y: 0 },
      { id: "36", x: 1, y: 0 },
      { id: "48", x: 2, y: 0 },
      { id: "0", x: 3, y: 0 },
      { id: "26", x: 0, y: 1 },
      { id: "38", x: 1, y: 1 },
      { id: "50", x: 2, y: 1 },
      { id: "2", x: 3, y: 1 },
      { id: "7", x: 1.25, y: 2 },
      { id: "8", x: 2.25, y: 3 },
    ]

    deepCover(actual[0].nodes, expected)
  }
}
