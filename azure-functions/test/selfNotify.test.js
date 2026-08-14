const test = require("node:test");
const assert = require("node:assert");
const { isSelfNotification, excludeActor, excludeActorMembers } = require("../src/lib/selfNotify");

test("isSelfNotification matches the actor case- and whitespace-insensitively", () => {
  assert.equal(isSelfNotification("GM@skypark.com", " gm@skypark.com "), true);
  assert.equal(isSelfNotification("tech@skypark.com", "gm@skypark.com"), false);
});

test("no actor means no suppression", () => {
  assert.equal(isSelfNotification("gm@skypark.com", ""), false);
  assert.equal(isSelfNotification("gm@skypark.com", undefined), false);
  assert.deepEqual(excludeActor(["a@x.com", "b@x.com"], undefined), ["a@x.com", "b@x.com"]);
});

test("a group address is never treated as the actor", () => {
  // The actor is a member of inventory@, but the group address is a different
  // recipient — mail to the shared queue still goes out.
  assert.equal(isSelfNotification("inventory@skypark.com", "gm@skypark.com"), false);
});

test("excludeActor drops only the actor, preserving order", () => {
  const out = excludeActor(["a@x.com", "GM@x.com", "b@x.com"], "gm@x.com");
  assert.deepEqual(out, ["a@x.com", "b@x.com"]);
});

test("excludeActorMembers filters group-member records by email", () => {
  const members = [
    { email: "gm@x.com", displayName: "GM One" },
    { email: "gm2@x.com", displayName: "GM Two" },
  ];
  assert.deepEqual(excludeActorMembers(members, "GM@x.com"), [{ email: "gm2@x.com", displayName: "GM Two" }]);
  assert.equal(excludeActorMembers(members, "gm@x.com").length, 1);
  // Sole GM filing their own request -> nobody left to email.
  assert.equal(excludeActorMembers([members[0]], "gm@x.com").length, 0);
});

test("malformed inputs don't throw", () => {
  assert.deepEqual(excludeActor(null, "gm@x.com"), []);
  assert.deepEqual(excludeActorMembers([null, { email: null }], "gm@x.com"), [null, { email: null }]);
});
