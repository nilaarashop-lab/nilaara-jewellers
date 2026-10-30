import assert from "node:assert/strict";
import { test } from "node:test";
import { chainChoice, choiceMessageLines } from "../src/data/options.js";
import { productEnquiryMessage } from "../src/config.js";

const replica = {
  id: "nl-014",
  name: "Diamond Replica Ring Mala",
  price: 799,
  chainOption: true,
  chainCharge: 200,
};

test("an undecided shopper gets no add-on and no extra message lines", () => {
  assert.equal(chainChoice(replica, ""), null);
  assert.deepEqual(choiceMessageLines(replica, ""), []);
});

test("with chain adds its charge to the total and says so in the message", () => {
  assert.deepEqual(chainChoice(replica, "with"), { label: "With chain (+₹200)", total: 999 });
  assert.deepEqual(productEnquiryMessage(replica, choiceMessageLines(replica, "with")), [
    "Hi Nilaara Jewellers! I'd like to buy this product.",
    "Product: Diamond Replica Ring Mala",
    "Product ID: nl-014",
    "Chain: With chain (+₹200)",
    "Total: ₹999",
  ].join("\n"));
});

test("without chain keeps the listed price and records the pick", () => {
  assert.deepEqual(chainChoice(replica, "without"), { label: "Without chain", total: 799 });
  assert.deepEqual(choiceMessageLines(replica, "without"), ["Chain: Without chain", "Total: ₹799"]);
});

test("a piece without the chain switch never offers or mentions it", () => {
  const plain = { ...replica, chainOption: false };
  assert.equal(chainChoice(plain, "with"), null);
  assert.equal(productEnquiryMessage(plain, choiceMessageLines(plain, "with")).includes("Chain"), false);
});

test("a chain priced at nothing is offered as plain With chain", () => {
  assert.deepEqual(chainChoice({ ...replica, chainCharge: 0 }, "with"), { label: "With chain", total: 799 });
});
