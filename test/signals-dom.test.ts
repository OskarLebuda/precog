// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBoxes, readConnection, readLinks } from "../src/runtime/core/signals";

const box = (x: number, y: number) => () => ({ x, y, width: 100, height: 20 }) as DOMRect;

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "connection");
});

describe("readConnection", () => {
  it("reports nothing when the browser does not say", () => {
    expect(readConnection()).toEqual({ saveData: false, effectiveType: "" });
  });

  it("reads the hints when they are there", () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true, effectiveType: "2g" },
    });
    expect(readConnection()).toEqual({ saveData: true, effectiveType: "2g" });
  });
});

describe("readBoxes", () => {
  it("measures the elements that are still in the document", () => {
    document.body.innerHTML = '<a id="a" href="/a">A</a>';
    const attached = document.querySelector("#a")!;
    attached.getBoundingClientRect = box(10, 20);
    const detached = document.createElement("a");
    detached.getBoundingClientRect = box(0, 0);

    const boxes = readBoxes(
      new Map([
        ["l0", attached],
        ["l1", detached],
      ]),
    );
    expect(boxes).toEqual([{ id: "l0", x: 10, y: 20, width: 100, height: 20 }]);
  });

  it("returns nothing for an empty map", () => {
    expect(readBoxes(new Map())).toEqual([]);
  });
});

describe("readLinks", () => {
  it("reads only within the root it is given", () => {
    document.body.innerHTML = '<nav><a href="/in">In</a></nav><a href="/out">Out</a>';
    for (const anchor of document.querySelectorAll("a")) {
      anchor.getBoundingClientRect = box(1, 2);
    }
    const links = readLinks(document.querySelector("nav")!);
    expect(links.map((link) => link.text)).toEqual(["In"]);
  });
});
