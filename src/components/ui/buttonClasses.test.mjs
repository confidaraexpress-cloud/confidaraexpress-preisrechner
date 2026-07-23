import { test } from "node:test";
import assert from "node:assert/strict";
import { buttonClasses, spinnerClassFor } from "./buttonClasses.mjs";

test("default is a primary button", () => {
  assert.equal(buttonClasses(), "btn btn-primary");
  assert.equal(buttonClasses({}), "btn btn-primary");
});

test("variant maps onto existing .btn classes", () => {
  assert.equal(buttonClasses({ variant: "primary" }), "btn btn-primary");
  assert.equal(buttonClasses({ variant: "secondary" }), "btn btn-outline");
  assert.equal(buttonClasses({ variant: "outline" }), "btn btn-outline");
  assert.equal(buttonClasses({ variant: "ghost" }), "btn btn-ghost");
  assert.equal(buttonClasses({ variant: "danger" }), "btn btn-danger");
});

test("unknown variant falls back to primary", () => {
  assert.equal(buttonClasses({ variant: "nope" }), "btn btn-primary");
});

test("modifiers append in a stable order", () => {
  assert.equal(
    buttonClasses({ variant: "danger", size: "sm", iconOnly: true, full: true, grow: true, loading: true }),
    "btn btn-danger btn-sm btn-icon btn-full btn-grow btn-loading"
  );
});

test("size only adds btn-sm for 'sm'", () => {
  assert.equal(buttonClasses({ size: "sm" }), "btn btn-primary btn-sm");
  assert.equal(buttonClasses({ size: "lg" }), "btn btn-primary");
  assert.equal(buttonClasses({ size: undefined }), "btn btn-primary");
});

test("loading adds btn-loading", () => {
  assert.equal(buttonClasses({ loading: true }), "btn btn-primary btn-loading");
  assert.equal(buttonClasses({ loading: false }), "btn btn-primary");
});

test("iconOnly adds btn-icon", () => {
  assert.equal(buttonClasses({ iconOnly: true }), "btn btn-primary btn-icon");
});

test("extra className is appended and trimmed", () => {
  assert.equal(buttonClasses({ className: "  pp-cta " }), "btn btn-primary pp-cta");
  assert.equal(buttonClasses({ className: "" }), "btn btn-primary");
});

test("spinnerClassFor: filled variants use white spinner, others dark", () => {
  assert.equal(spinnerClassFor("primary"), "spinner");
  assert.equal(spinnerClassFor("danger"), "spinner");
  assert.equal(spinnerClassFor("secondary"), "spinner-dark");
  assert.equal(spinnerClassFor("outline"), "spinner-dark");
  assert.equal(spinnerClassFor("ghost"), "spinner-dark");
  assert.equal(spinnerClassFor(), "spinner");
});
