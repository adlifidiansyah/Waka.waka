import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { describeEmbed } from "../src/lib/embeds.ts";

describe("embed frame allowlist", () => {
  test("Figma prototypes become embeds", () => {
    const embed = describeEmbed("https://www.figma.com/proto/abc/Design");
    assert.equal(embed?.embeddable, true);
    assert.equal(embed?.provider, "Figma");
    assert.ok(embed?.url.startsWith("https://www.figma.com/embed?embed_host=clientdeck"));
  });

  test("an already-embeddable Figma URL is left alone", () => {
    const url = "https://www.figma.com/embed?embed_host=clientdeck&url=https%3A%2F%2Fx";
    assert.equal(describeEmbed(url)?.url, url);
  });

  test("Loom share links normalise to embeds", () => {
    assert.equal(
      describeEmbed("https://www.loom.com/share/deadbeef")?.url,
      "https://www.loom.com/embed/deadbeef",
    );
  });

  test("YouTube watch and short links normalise", () => {
    assert.equal(
      describeEmbed("https://www.youtube.com/watch?v=abc123")?.url,
      "https://www.youtube.com/embed/abc123",
    );
    assert.equal(describeEmbed("https://youtu.be/abc123")?.url, "https://www.youtube.com/embed/abc123");
  });

  test("preview deploys are embeddable", () => {
    assert.equal(describeEmbed("https://my-app-git-main.vercel.app")?.embeddable, true);
    assert.equal(describeEmbed("https://staging.netlify.app/page")?.embeddable, true);
  });

  test("an unknown host renders as a link, never an iframe", () => {
    const embed = describeEmbed("https://evil.example.com/login");
    assert.equal(embed?.embeddable, false);
    assert.equal(embed?.provider, "Link");
  });

  test("a lookalike domain does not slip past the suffix check", () => {
    assert.equal(describeEmbed("https://figma.com.evil.example/x")?.embeddable, false);
    assert.equal(describeEmbed("https://notfigma.com/x")?.embeddable, false);
    assert.equal(describeEmbed("https://evil.example/?x=figma.com")?.embeddable, false);
  });

  test("a genuine subdomain still matches", () => {
    assert.equal(describeEmbed("https://www.figma.com/proto/x")?.embeddable, true);
  });

  test("non-https is dropped entirely, not downgraded to a link", () => {
    assert.equal(describeEmbed("http://www.figma.com/proto/abc"), null);
  });

  test("dangerous or malformed input is refused", () => {
    // These must never become a clickable anchor in the client's portal.
    assert.equal(describeEmbed("javascript:alert(1)"), null);
    assert.equal(describeEmbed("data:text/html,<script>alert(1)</script>"), null);
    assert.equal(describeEmbed("vbscript:msgbox(1)"), null);
    assert.equal(describeEmbed("file:///etc/passwd"), null);
    assert.equal(describeEmbed("not a url"), null);
    assert.equal(describeEmbed(null), null);
    assert.equal(describeEmbed(undefined), null);
    assert.equal(describeEmbed(""), null);
  });
});
