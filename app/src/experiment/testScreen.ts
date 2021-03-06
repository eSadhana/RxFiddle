// tslint:disable:max-line-length
import AnalyticsObserver from "../analytics"
import RxRunner, { Runner } from "../collector/runner"
import ConsoleRunner from "../experiment/console-runner"
import ConsoleVisualizer from "../experiment/console-visualizer"
import overlay from "../experiment/overlay"
import samples, { Sample } from "../experiment/samples"
import { Screen, States, SurveyState, TestEvent, TestState, doneScreen, general, generalLangs, generalRpExperience, introScreen, previous } from "../experiment/screens"
import { formatSeconds } from "../experiment/utils"
import { personal, signin, uid } from "../firebase"
import { RxJS4 } from "../languages"
import patch from "../patch"
import CodeEditor from "../ui/codeEditor"
import { hboxo, vboxo } from "../ui/flex"
import Resizer from "../ui/resizer"
import { Query, errorHandler } from "../ui/shared"
import { UUID, utoa } from "../utils"
import RxFiddleVisualizer from "../visualization"
import Grapher from "../visualization/grapher"
import { database } from "firebase"
import * as Rx from "rxjs"
import { IScheduler } from "rxjs/Scheduler"
import h from "snabbdom/h"
import { VNode } from "snabbdom/vnode"

export let rightMenuLinks = [
  h("a.btn", { attrs: { href: "faq.html" } }, "FAQ"),
  h("a.btn", { attrs: { href: "cheatsheet.html" } }, "JavaScript cheatsheet"),
  h("a.btn", { attrs: { href: "http://reactivex.io", target: "_blank" } }, "RxJS docs"),
]

export function menu(runner?: Runner, editor?: CodeEditor): VNode {
  let clickHandler = () => {
    editor.withValue(v => {
      Query.set({ code: utoa(v), type: "editor" })
      runner.trigger()
    })
  }
  return h("div.left.flex", { attrs: { id: "menu" } }, [
    ...(runner ? [h("button.btn", { on: { click: clickHandler } }, runner.action)] : []),
  ])
}

export let testScreen = (sample: Sample, scheduler: IScheduler): Screen => ({
  get path() {
    return ["test", sample.id]
  },
  goto(state, dispatch) { dispatch({ path: ["test", sample.id], surveyId: state.id, type: "goto" }) },
  isActive(state) {
    return !state.active ||
      state.active[0] === "test" && (state.active.length === 1 || state.active[1] === sample.id)
  },
  progress() { return { max: 0, done: 0 } },
  hasMenu: true,
  render(state, dispatch, _, screens) {
    return {
      dom: Rx.Observable.defer(() => {
        let collector = DataSource(state, sample)

        let question = Rx.Observable.interval(1000, scheduler)
          .startWith(0)
          .take(sample.timeout)
          .let(time => formatQuestion(state, sample, time, dispatch, screens, this))

        let active = Rx.Observable
          .defer(() => {
            if (state.mode === "rxfiddle") {
              let vis = new RxFiddleVisualizer(new Grapher(collector.data))
              return vis.stream(AnalyticsObserver)
            } else {
              let vis = new ConsoleVisualizer(collector.data as ConsoleRunner)
              return vis.dom.map(dom => ({ dom, timeSlider: h("div") }))
            }
          })
          .catch(errorHandler)
          .retry()
          .combineLatest(
          question,
          collector.vnode,
          collector.runner.state,
          (visualizer, questiondom, input) => [
            questiondom,
            vboxo({ class: "rel" },
              h("div#menufold-static.menufold.belowquestion", [
                h("a.brand.left", {
                  attrs: { href: "#" },
                  on: { click: () => dispatch({ type: "pause" }) },
                }, [
                    h("img", { attrs: { alt: "ReactiveX", src: "images/RxIconXs.png" } }),
                    "RxFiddle" as any as VNode,
                  ]),
                menu(collector.runner, collector.editor),
                h("div", { style: { flex: "1" } }),
                h("div.right", [
                  ...rightMenuLinks,
                  h("button.btn.helpbutton", "Help"),
                  overlay(),
                ]),
              ]),
              hboxo({ class: "editor-visualizer" }, Resizer.h(
                "rxfiddle/editor+rxfiddle/inspector",
                input,
                vboxo({ class: "viewer-panel" }, visualizer.dom)
              )),
            ),
          ])

        let outOfTime: Rx.Observable<VNode[]> = Rx.Observable.of(sample.timeout)
          .let(time => formatQuestion(state, sample, time, dispatch, screens, this))
          .map((render) => [
            render,
            h("div.center", h("div", { style: { padding: "3em" } }, [
              h("h2", "time's up"),
              h("p.gray", { style: { width: "21em", "margin-left": "auto", "margin-right": "auto", color: "gray" } },
                `No problem, just continue with the next question.`),
              h("a.btn", { on: { click: () => dispatch({ type: "pass", question: sample.id }) } }, "Continue with next question"),
              h("p.gray", { style: { width: "21em", "margin-left": "auto", "margin-right": "auto", color: "gray" } },
                `Don't worry. After the survey, you may spend all the time you
               want in this tool. Your questions, your code and your answers
               will be available at the end of the survey, if you wish.`),
            ])),
          ])

        return Rx.Observable.of(active)
          .merge(Rx.Observable.timer(1000 * sample.timeout, scheduler).map(_ => outOfTime))
          .switch()
          .map(nodes => h("div.tool.flexy.flexy-v.rel", nodes))
      }),
    }
  },
})

function formatQuestion(state: TestState, sample: Sample, time: Rx.Observable<number>, dispatch: (event: TestEvent) => void, screens: Screen[], current: Screen): Rx.Observable<VNode> {
  return sample.renderQuestion(state, dispatch).flatMap(render =>
    time.map(t => h("div.question-bar", h("div.question-wrapper", {
      key: sample.id.toString(), style: {
        "margin-top": "-100%",
        delayed: { "margin-top": "0%" },
        remove: { "margin-top": "-100%" },
      },
    }, [
        h("div.countdown.right", [
          formatSeconds((sample.timeout || 600) - t),
        ]),
        h("h1", "Question"),
        h("form.q", {
          on: {
            submit: (e: any) => {
              if (sample.handleSubmit) {
                sample.handleSubmit(state, dispatch, e.target.elements)
              }
              e.preventDefault()
              return false
            },
          },
        }, [
            render,
            h("div.buttons", { style: { "margin-top": "10px", "margin-bottom": "0" } }, [
              h("a.btn.inverse", { attrs: { role: "button" }, on: { click: () => dispatch({ type: "back" }) }, style: { "margin-right": "5px" } }, "Back"),
              h("a.btn.inverse", { attrs: { role: "button" }, on: { click: () => dispatch({ type: "pause" }) }, style: { "margin-right": "5px" } }, "Pause"),
              h("a.btn.inverse", {
                attrs: { role: "button", title: "Skip to next question" },
                on: { click: () => confirm("Are you sure you to pass on this question?") && dispatch({ question: sample.id, type: "pass" }) },
                style: { "margin-right": "5px" },
              }, "Pass"),
              h("input.btn.inverse", { attrs: { type: "submit" } }, "Submit"),
            ]),
          ]),
      ]))
    ))
}

function DataSource(state: TestState, sample: Sample) {
  let editor = new CodeEditor(sample.code.trim(), sample.codeRanges && sample.codeRanges(), sample.lineClasses && sample.lineClasses())
  let editedCode = Rx.Observable.fromEventPattern<string>(h => editor.withValue(h as any), h => void (0))
  let runner: Runner
  if (state.mode === "rxfiddle") {
    runner = new RxRunner(RxJS4.runnerConfig, editedCode.map(c => sample.renderCode ? sample.renderCode(c) : c), AnalyticsObserver)
  } else {
    let config = { libraryFile: RxJS4.runnerConfig.libraryFile, workerFile: "dist/worker-console-experiment.bundle.js" }
    runner = new ConsoleRunner(config, editedCode.map(c => sample.renderCode ? sample.renderCode(c) : c), AnalyticsObserver)
  }
  return {
    data: runner,
    runner,
    editor,
    vnode: editor.dom,
  }
}
