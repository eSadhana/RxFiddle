import Instrumentation, { defaultSubjects } from "../src/collector/instrumentation"
import { lens as lenz } from "../src/collector/lens"
import Collector from "../src/collector/logger"
import { expect } from "chai"
import { suite, test } from "mocha-typescript"
import * as Rx from "rx"

let rxProto: any = (<any>Rx).Observable.prototype

function complexObs() {
  let A = Rx.Observable.of(1, 2, 3)
    .map(i => "hello " + i)
    .filter(_ => true)
    .map(_ => _)
    .skip(1)
    .share()

  A.flatMapLatest(s => Rx.Observable.of("postfix").startWith(s))
    .groupBy(s => s[s.length - 1])
    .map(o => o.startWith("group of " + o.key))
    .mergeAll()
    .subscribe()
}

@suite
export class OperatorTest {

  private instrumentation: Instrumentation
  private collector: Collector

  public before() {
    Collector.reset()
    this.collector = new Collector()
    this.instrumentation = new Instrumentation(defaultSubjects, this.collector)
    this.instrumentation.setup()
  }

  public after() {
    this.instrumentation.teardown()
  }

  // @test
  public "test coverage"() {
    let tested = [
      "map",
    ]
    let untested = Object.keys(rxProto).filter(method => tested.indexOf(method) < 0)
    if (untested.length !== 0) {
      throw new Error("Untested methods: " + untested.length)
      // throw new Error("Untested methods: " + untested.join(", "))
    }
  }

  @test
  public "map"() {
    Rx.Observable.of(0, 1, 2)
      .map(i => String.fromCharCode("a".charCodeAt(0) + i))
      .subscribe()

    let lens = lenz(this.collector).find("map")
    expect(lens.all()).to.have.lengthOf(1)

    let subs = lens.subscriptions().all()
    expect(subs).to.have.lengthOf(1)

    expect(lens.subscriptions().nexts().map(_ => _.value)).to.deep.eq(["a", "b", "c"])
    expect(lens.subscriptions().completes()).to.have.lengthOf(1)
  }

  @test
  public "filter"() {
    Rx.Observable.of(1, 2, 3)
      .filter(i => i < 2)
      .subscribe()

    let lens = lenz(this.collector).find("filter")
    expect(lens.all()).to.have.lengthOf(1)

    let subs = lens.subscriptions().all()
    expect(subs).to.have.lengthOf(1)

    expect(lens.subscriptions().nexts().map(_ => _.value)).to.deep.eq([1])
    expect(lens.subscriptions().completes()).to.have.lengthOf(1)
  }

  @test
  public "complex"() {
    console.time("complex instrumented")
    complexObs()
    console.timeEnd("complex instrumented")

    let lens = lenz(this.collector).find("mergeAll")
    expect(lens.all()).to.have.lengthOf(1)

    let subs = lens.subscriptions().all()
    expect(subs).to.have.lengthOf(1)

    expect(lens.subscriptions().nexts().map(_ => _.value)).to.deep.eq([
      "group of 2",
      "hello 2",
      "group of x",
      "postfix",
      "group of 3",
      "hello 3",
      "postfix",
    ])
    expect(lens.subscriptions().completes()).to.have.lengthOf(1)
  }

  @test
  public "complexTiming"() {
    this.instrumentation.teardown()
    console.time("complex")
    complexObs()
    console.timeEnd("complex")
  }

  @test
  public "nested-call operators"() {
    Rx.Observable.of(1, 2, 3)
      .share()
      .subscribe()

    expect(this.collector.lens().roots().all()).to.deep.eq([{
      arguments: [1, 2, 3],
      id: 0,
      method: "of",
      parents: [],
      stack: undefined,
    }])

    expect(this.collector.lens().roots().childs().all()).to.deep.eq([{
      arguments: [],
      id: 1,
      method: "share",
      parents: [0],
      stack: undefined,
    }])
  }

  @test
  public "higher order operators"() {
    Rx.Observable.of(1, 2, 3)
      .flatMap(i => Rx.Observable.empty())
      .subscribe()

    let childs = this.collector.lens().roots().childs()
    expect(childs.all()[0].method).to.equal("flatMap")
    expect(childs.subscriptions().links().all()).to.deep.equal([{
      arguments: [],
      id: 2,
      method: "empty",
      parents: [],
      stack: undefined,
    }])
  }
}
