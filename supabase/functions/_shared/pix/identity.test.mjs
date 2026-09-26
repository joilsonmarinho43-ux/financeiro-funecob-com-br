import { strict as assert } from "node:assert";
import { test } from "node:test";
import { autoIdentityVerified, uniquePhoneMatch } from "./identity.ts";

test("partial number cannot identify another customer", () => {
  const clients = [{ id: "wrong", phone: "11911112222" }];
  assert.equal(uniquePhoneMatch("21911112222", clients, true).client, null);
});

test("LID cache number alone cannot authorize a settlement", () => {
  const clients = [{ id: "cached", phone: "11987654321" }];
  assert.equal(uniquePhoneMatch("11987654321", clients, false).client, null);
});

test("ambiguous full numbers require review", () => {
  const clients = [{ id: "a", phone: "11987654321" }, { id: "b", phone: "1187654321" }];
  assert.equal(uniquePhoneMatch("11987654321", clients, true).client, null);
});

test("different payer or missing name cannot trigger automatic settlement", () => {
  assert.equal(autoIdentityVerified("Antônio Souza", "Carlos Moreira", true), false);
  assert.equal(autoIdentityVerified("", "Carlos Moreira", true), false);
  assert.equal(autoIdentityVerified("Antônio Souza", "Antônio Souza", false), false);
});

test("unique verified number and full name can pass identity gate", () => {
  const clients = [{ id: "a", phone: "+55 11 98765-4321" }];
  assert.equal(uniquePhoneMatch("11987654321", clients, true).client?.id, "a");
  assert.equal(autoIdentityVerified("ANTONIO SOUZA", "Antônio Souza", true), true);
});
