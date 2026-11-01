import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPublicHostname, parseProductionOrigin } from "./application-origin";

describe("production application origin validation", () => {
  it("accepts HTTPS public DNS origins and public IP literals", () => {
    assert.equal(parseProductionOrigin("https://apex.example.com"), "https://apex.example.com");
    assert.equal(parseProductionOrigin("https://apex.example.com/"), "https://apex.example.com");
    assert.equal(parseProductionOrigin("https://203.0.114.10"), "https://203.0.114.10");
    assert.equal(parseProductionOrigin("https://8.8.8.8"), "https://8.8.8.8");
    assert.equal(parseProductionOrigin("https://192.0.0.9"), "https://192.0.0.9");
    assert.equal(parseProductionOrigin("https://192.0.0.10"), "https://192.0.0.10");
    assert.equal(parseProductionOrigin("https://[2001:4860:4860::8888]"), "https://[2001:4860:4860::8888]");
    assert.equal(parseProductionOrigin("https://[2606:4700:4700::1111]"), "https://[2606:4700:4700::1111]");
  });

  it("requires HTTPS and rejects URL components beyond an origin", () => {
    for (const value of [
      "http://apex.example.com",
      "https://user:password@apex.example.com",
      "https://@apex.example.com",
      "https://apex.example.com/path",
      "https://apex.example.com/?next=other",
      "https://apex.example.com/#fragment",
      "not a url",
      " https://apex.example.com",
    ]) {
      assert.equal(parseProductionOrigin(value), null, value);
    }
  });

  it("rejects loopback, private, link-local, reserved, and internal hosts", () => {
    for (const hostname of [
      "localhost",
      "sub.localhost",
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.1",
      "169.254.10.1",
      "100.64.0.1",
      "0.0.0.0",
      "192.0.0.1",
      "224.0.0.1",
      "[::1]",
      "[::]",
      "[fc00::1]",
      "[fe80::1]",
      "[::ffff:192.168.1.1]",
      "[2001:db8::1]",
      "[2001:1::1]",
      "[2002::1]",
      "[3ff0::1]",
      "[3fff::1]",
      "[5f00::1]",
      "[64:ff9b:1::1]",
      "[fec0::1]",
      "app.internal",
      "service.corp",
      "host.local",
      "singlelabel",
    ]) {
      assert.equal(isPublicHostname(hostname), false, hostname);
      assert.equal(parseProductionOrigin(`https://${hostname}`), null, hostname);
    }
  });
});
