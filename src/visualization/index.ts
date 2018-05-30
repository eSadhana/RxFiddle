import { IEvent } from "../collector/event"
import { Edge as EdgeLabel, Message, NodeLabel } from "../collector/logger"
import TimeComposer from "../collector/timeComposer"
import TypedGraph from "../collector/typedgraph"
import "../object/extensions"
import { IObservableTree, IObserverTree, ObserverTree } from "../oct/oct"
import "../utils"
import Grapher from "./grapher"
import layoutf from "./layout"
import { In as RenderInput, graph$ } from "./render"
import { time } from "./time"
import {
  MarbleClick, MarbleHoover,
  SelectionGraphEdge, SelectionGraphNode, SelectionGraphNone,
  UIEvent,
} from "./uievent"
import * as Rx from "rxjs"
import { Subject } from "rxjs/Subject"
import { VNode } from "snabbdom/vnode"

export interface DataSource {
  dataObs: Rx.Observable<Message>
}

export type ViewState = {
  tick?: number
  flowSelection?: SelectionGraphNode | SelectionGraphEdge | SelectionGraphNone | MarbleClick
  hooverSelection?: SelectionGraphNone | MarbleHoover
  hoover?: string
  scheduler?: string
  timeRange?: { scheduler: string, min: number, max: number }
}

export type GraphNode = {
  name: string
  labels: NodeLabel[]
}
export type GraphEdge = {
  labels: EdgeLabel[]
}

export type Graphs = {
  _sequence: number,
  events: IEvent[],
  main: TypedGraph<IObservableTree | IObserverTree, {}>,
  subscriptions: TypedGraph<IObserverTree, {}>,
  time: TimeComposer
  isStopped: boolean
}

export function isIObserver(a: any): a is IObserverTree {
  return a && "observable" in a
}

function distance(a: IObservableTree | IObserverTree, b: IObservableTree | IObserverTree): number | undefined {
  if (isIObserver(a) && isIObserver(b)) {
    return a.observable.id === b.observable.id ? 0.21 : 1
  }
  return undefined
}

function blueprintObserver(tree: IObservableTree, sink?: IObserverTree): IObserverTree[] {
  let subs: IObserverTree[] = []
  let sub = new ObserverTree(tree.id + "-blueprint")
  subs.push(sub)
  sub.setObservable([tree])
  if (sink) {
    sub.setSink([sink])
  }

  if (tree.sources && tree.sources.length) {
    tree.sources.forEach(source => {
      subs.push(...blueprintObserver(source, sub))
    })
  }

  return subs
}

function addBlueprints(
  subscriptions: TypedGraph<IObserverTree, {}>,
  full: TypedGraph<IObserverTree | IObservableTree, {}>
): TypedGraph<IObserverTree, {}> {
  try {
    let endpoints = full.sinks().map(n => full.node(n)).filter(n => !isIObserver(n)) as Array<IObservableTree>
    let observers = endpoints.flatMap(observable => blueprintObserver(observable))
    let copy = subscriptions.filterNodes(_ => true)
    observers.forEach(s => copy.setNode(s.id, s))
    observers.forEach(s => s.sink && copy.setEdge(s.id, s.sink.id))
    return copy
  } catch (e) {
    console.warn("Failed adding blueprints :(", e)
    return subscriptions
  }
}

function getObservableId(input: IObservableTree | IObserverTree, node: string): string {
  if (isIObserver(input) && input.observable) {
    return input.observable.id
  } else if (input && input.id) {
    return input.id
  } else {
    console.warn("getObservableId for undefined node", node, input, new Error())
    return ""
  }
}

function getLayoutObservableId(graph: TypedGraph<IObservableTree | IObserverTree, any>, node: string): string {
  // TODO: this workaround is needed since layout hierarchies are computed 
  // for intermediate layout nodes too, but the layout engine should do this conversion itself
  if (node.indexOf("dummy-") === 0) {
    return getObservableId(graph.node(node.split("-")[1]), node)
  } else {
    return getObservableId(graph.node(node), node)
  }
}

type EqualityInput = {
  _sequence: number,
  graphs: Graphs,
  viewState: ViewState,
  focusNodes: string[],
}

function listEqual<T>(a: T[], b: T[], comparator: (a: T, b: T) => boolean = (c, d) => c === d): boolean {
  return a === b || a.length === b.length && a.every((ia, index) => comparator(ia, b[index]))
}

function graphEqual<N1, E1, N2, E2>(a: TypedGraph<N1, E1>, b: TypedGraph<N2, E2>): boolean {
  return a.edgeCount() === b.edgeCount() && a.nodeCount() === b.nodeCount() &&
    listEqual(a.nodes(), b.nodes()) &&
    listEqual(a.edges(), b.edges(), (c, d) => c.v === d.v && c.w === d.w)
}

function flowSelectionEqual(
  a: SelectionGraphEdge | SelectionGraphNode | SelectionGraphNone | MarbleHoover | MarbleClick,
  b: SelectionGraphEdge | SelectionGraphNode | SelectionGraphNone | MarbleHoover | MarbleClick
) {
  if (typeof a === "undefined" && typeof b === "undefined") { return true }
  if (typeof a === "undefined" || typeof b === "undefined") { return false }
  return a.type === b.type && Object.keys(a).every(k => (a as any)[k] === (b as any)[k])
}

function viewStateEqual(a: ViewState, b: ViewState): boolean {
  return a.tick === b.tick && flowSelectionEqual(a.flowSelection, b.flowSelection)
}

function equalData(a: EqualityInput, b: EqualityInput): boolean {
  let r = viewStateEqual(a.viewState, b.viewState) &&
    graphEqual(a.graphs.main, b.graphs.main) && graphEqual(a.graphs.subscriptions, b.graphs.subscriptions)
  return r
}

/** Folding UIEvent's over ViewState's */
function reduce(pstate: ViewState, event: UIEvent): ViewState {
  switch (event.type) {
    case "tickSelection":
      let state = Object.assign({}, pstate)
      state.tick = event.tick
      return state

    case "marbleHooverEnd":
    case "marbleHoover":
      return Object.assign({}, pstate, { hooverSelection: event })

    case "selectionGraphEdge":
    case "selectionGraphNode":
    case "selectionGraphNone":
    case "marbleClick":
      return Object.assign({}, pstate, { flowSelection: event })

    case "diagramOperatorHoover":
      return Object.assign({}, pstate, { hoover: event.observable })

    case "scheduler":
      return Object.assign({}, pstate, {
        scheduler: event.id,
        timeRange: pstate.scheduler === event.id ? pstate.timeRange : undefined,
      })

    case "timeRange":
      return Object.assign({}, pstate, {
        timeRange: {
          max: event.max, min: event.min,
          scheduler: event.scheduler,
        },
      })

    default:
      return pstate
  }
}

export default class Visualizer {

  // TODO workaround for Rx.Subject's
  public openGroups = new Subject<string[]>()
  public tick = new Subject<number>()

  public timeSlider: Rx.Observable<VNode>
  public DOM: Rx.Observable<VNode>

  public get viewState(): Rx.Observable<ViewState> {
    return this.uiEventsInput
      // kick-off
      .startWith({})
      .scan<ViewState>(reduce, {
        flowSelection: undefined,
        tick: undefined,
      })
  }

  private clicks: Rx.Observable<string[]>
  private groupClicks: Rx.Observable<string>
  private tickSelection: Rx.Observable<number>
  private uiEventsInput: Rx.Subject<UIEvent>
  private uiEventsOutput: Rx.Observable<UIEvent>
  private grapher: Grapher

  constructor(grapher: Grapher) {
    this.grapher = grapher
    this.uiEventsInput = new Rx.Subject<UIEvent>()

    let viewState = this.viewState

    let inp: RenderInput = grapher.graph
      .combineLatest(viewState, (graphs, state) => {
        let filtered = this.filter(graphs, state)
        let focusNodes = this.focusNodes(graphs, state.flowSelection, true)
        let hooverNodes = this.focusNodes(graphs, state.hooverSelection)
        return ({
          _sequence: graphs._sequence,
          graphs: filtered,
          time: graphs.time,
          viewState: state,
          focusNodes,
          hooverNodes,
        })
      })
      // Do not re-layout for equal graphs
      .publish(obs => obs
        .distinctUntilChanged(equalData)
        .map(data => Object.assign(data, {
          layout: layoutf(
            data.graphs.subscriptions.filterNodes(() => true),
            data.focusNodes,
            (a, b) => distance(data.graphs.main.node(a), data.graphs.main.node(b)),
            node => getLayoutObservableId(data.graphs.main, node)
          ),
        }))
        .combineLatest(obs, (layoutData, fullData) => Object.assign(fullData, { layout: layoutData.layout }))
      )
      .share()

    let timeComponent = time(inp)
    let { svg, clicks, groupClicks, tickSelection, uievents } = graph$(inp)

    this.timeSlider = timeComponent.vnode
    this.DOM = svg
    this.clicks = clicks
    this.groupClicks = groupClicks
    this.tickSelection = tickSelection
    this.uiEventsOutput = uievents.merge(timeComponent.uievent)
  }

  public stream(uiEvents?: Rx.Observer<UIEvent>): Rx.Observable<{ dom: VNode, timeSlider: VNode }> {
    return new Rx.Observable<{ dom: VNode, timeSlider: VNode }>(subscriber => {
      let subscription = new Rx.Subscription()
      subscription.add(this.DOM
        .combineLatest(this.timeSlider, (d, t) => ({ dom: d, timeSlider: t }))
        .subscribe(subscriber))
      subscription.add(this.uiEventsOutput.subscribe(this.uiEventsInput))
      if (typeof uiEvents !== "undefined") {
        subscription.add(this.uiEventsInput.subscribe(uiEvents))
      }
      return subscription
    })
  }

  // tslint:disable-next-line:max-line-length
  private focusNodes(graphs: Graphs, selection: SelectionGraphEdge | SelectionGraphNode | SelectionGraphNone | MarbleClick | MarbleHoover, initialSelection: boolean = false): string[] {
    if (!selection) {
      if (graphs.subscriptions.nodeCount() > 0 && initialSelection) {
        // Initial selection is first subscribe happening
        return getFlow(graphs.subscriptions, undefined, graphs.subscriptions.nodes()[0])
          .map(_ => _.id)
      }
      return []
    }
    switch (selection.type) {
      case "selectionGraphEdge": return getFlow(graphs.subscriptions, undefined, selection.v, selection.w)
        .map(_ => _.id)
      case "selectionGraphNode":
        let esIn = graphs.subscriptions.inEdges(selection.node) || []
        let esOut = graphs.subscriptions.outEdges(selection.node) || []
        if (esIn.length === 1) {
          return getFlow(graphs.subscriptions, undefined, esIn[0].v, selection.node).map(_ => _.id)
        } else {
          return getFlow(graphs.subscriptions, undefined, selection.node, esOut[0] && esOut[0].w).map(_ => _.id)
        }
      case "marbleHoover":
      case "marbleClick":
        return getFlow(
          graphs.subscriptions,
          (o, named) => o.events.some(e => e.timing.clocks.tick === selection.marble.timing.clocks.tick),
          selection.subscription
        ).map(_ => _.id)
      default: return []
    }
  }

  private filter(graphs: Graphs, viewState: ViewState): Graphs {
    let scope = window as any || {}
    scope.filterGraphs = graphs
    // let subs = addBlueprints(graphs.subscriptions, graphs.main)
    if (typeof viewState.tick === "number") {
      console.log("filtering with tick", viewState.tick)
      return {
        _sequence: graphs._sequence,
        events: graphs.events,
        isStopped: graphs.isStopped,
        main: graphs.main.filterNodes((n, o) => isIObserver(o) ? true : o.scheduler.clock <= viewState.tick),
        subscriptions: graphs.subscriptions.filterNodes((n, o) => o.observable.scheduler.clock <= viewState.tick),
        time: graphs.time,
        // subs
      }
    } else {
      return {
        _sequence: graphs._sequence,
        events: graphs.events,
        isStopped: graphs.isStopped,
        main: graphs.main,
        subscriptions: graphs.subscriptions, // subs
        time: graphs.time,
      }
    }
  }
}

function checkChildrenDefined(node: VNode | string, parents: string = "", ...info: any[]): void {
  if (typeof node === "string") {
    return
  }
  if (typeof node === "undefined") {
    console.warn("Undefined VNode child found at ", parents, ...info)
  } else if (typeof node === "object" && "children" in node && Array.isArray(node.children)) {
    node.children.forEach((c, i) => checkChildrenDefined(c, parents + "/" + node.sel + "[" + i + "]",
      node.elm && (node.elm as HTMLElement).childNodes[i], node))
  } else {
    // console.warn("Uknown vnode", node, parents)
  }
}

function collectUp(
  graph: TypedGraph<IObserverTree, {}>, node: IObserverTree,
  hasPref?: (o: IObserverTree, n?: any) => boolean,
  remaining: number = 50
): IObserverTree[] {
  let inEdges = node && graph.inEdges(node.id)
  if (inEdges && inEdges.length >= 1 && remaining > 0) {
    let ups = inEdges.map(e => graph.node(e.v))
    let oneUpHasPref = (n: string) => (graph.inEdges(n) || [])
      .map(e => graph.node(e.v))
      .some(oneup => hasPref(oneup, "oneup"))
    let continuation = (hasPref && ups.find(hasPref)) ||
      (hasPref && ups.find(n => oneUpHasPref(n.id))) ||
      ups[0]
    return [node].concat(collectUp(graph, continuation, hasPref, remaining - 1))
  }
  return [node]
}
function collectDown(
  graph: TypedGraph<IObserverTree, {}>, node: IObserverTree,
  hasPref?: (o: IObserverTree) => boolean,
  remaining: number = 50
): IObserverTree[] {
  let outEdges = node && graph.outEdges(node.id)
  if (outEdges && outEdges.length === 1 && remaining > 0) {
    let downs = outEdges.map(e => graph.node(e.w))
    let oneDownHasPref = (n: string) => (graph.outEdges(n) || [])
      .map(e => graph.node(e.w))
      .some(onedown => hasPref(onedown))
    let continuation = (hasPref && downs.find(hasPref)) ||
      (hasPref && downs.find(n => oneDownHasPref(n.id))) ||
      downs[0]
    return [node].concat(collectDown(graph, continuation, hasPref, remaining - 1))
  }
  return [node]
}

function getFlow(
  graph: TypedGraph<IObserverTree, {}>,
  hasPrefOpt: (o: IObserverTree, n?: any) => boolean | null,
  ...ids: string[]
) {
  ids = ids.filter(id => typeof id !== "undefined")
  let hasPref = typeof hasPrefOpt === "function" ? hasPrefOpt : undefined
  if (ids.length === 2) {
    let focussed1 = graph.node(ids[0])
    let focussed2 = graph.node(ids[1])
    return focussed1 && focussed2 ? [
      ...collectUp(graph, focussed1, hasPref).slice(1).reverse(),
      focussed1,
      focussed2,
      ...collectDown(graph, focussed2, hasPref).slice(1),
    ] : []
  } else {
    let focussed = graph.node(ids[0])
    return focussed ? [
      ...collectUp(graph, focussed, hasPref).slice(1).reverse(),
      focussed,
      ...collectDown(graph, focussed, hasPref).slice(1),
    ] : []
  }

}
