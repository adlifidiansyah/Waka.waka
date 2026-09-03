import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  escapeHtml,
  renderPortalLinkEmail,
  safeHexColor,
  safeHttpsUrl,
} from "../src/lib/email/render.ts";

const BRAND = {
  studioName: "Northlight Studio",
  brandColor: "#4f46e5",
  logoUrl: null,
  showBadge: true,
};

const BASE = {
  brand: BRAND,
  clientName: "Maya Rahmawati",
  projectTitle: "Aurora Coffee — Website Rebuild",
  portalUrl: "https://portal.northlight.test/portal/abc123",
  expiresOn: null,
  message: null,
};

describe("HTML escaping", () => {
  test("escapes every character that can break out of markup", () => {
    assert.equal(escapeHtml(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
  });

  test("escapes ampersands before the entities it introduces", () => {
    assert.equal(escapeHtml("&lt;"), "&amp;lt;");
  });
});

describe("colour and URL guards", () => {
  test("only #rrggbb passes through", () => {
    assert.equal(safeHexColor("#a1b2c3"), "#a1b2c3");
    assert.equal(safeHexColor("#abc"), "#4f46e5");
    assert.equal(safeHexColor("red; background:url(x)"), "#4f46e5");
    assert.equal(safeHexColor(null), "#4f46e5");
  });

  test("only absolute https URLs pass through", () => {
    assert.equal(safeHttpsUrl("https://a.test/logo.png"), "https://a.test/logo.png");
    assert.equal(safeHttpsUrl("http://a.test/logo.png"), null);
    assert.equal(safeHttpsUrl("javascript:alert(1)"), null);
    assert.equal(safeHttpsUrl("data:image/svg+xml,<svg onload=alert(1)>"), null);
    assert.equal(safeHttpsUrl("/relative.png"), null);
    assert.equal(safeHttpsUrl(null), null);
  });
});

describe("portal link email", () => {
  test("carries the portal URL in both the button and the plain-text body", () => {
    const email = renderPortalLinkEmail(BASE);
    assert.ok(email.html.includes(`href="${BASE.portalUrl}"`));
    assert.ok(email.text.includes(BASE.portalUrl));
  });

  test("subject names the project and the studio", () => {
    const email = renderPortalLinkEmail(BASE);
    assert.ok(email.subject.includes("Aurora Coffee"));
    assert.ok(email.subject.includes("Northlight Studio"));
  });

  test("greets the client by first name in both HTML and plain text", () => {
    const email = renderPortalLinkEmail(BASE);
    assert.ok(email.html.includes("Hi Maya,"));
    assert.ok(email.text.includes("Hi Maya,"));
    assert.ok(!email.text.includes("Hi Maya Rahmawati,"));
  });

  test("a title containing an em dash does not collide with the subject's own", () => {
    const email = renderPortalLinkEmail(BASE);
    assert.equal(email.subject, "Northlight Studio: your portal for Aurora Coffee — Website Rebuild");
  });

  test("a studio name cannot inject markup", () => {
    const email = renderPortalLinkEmail({ ...BASE, brand: { ...BRAND, studioName: '</td></tr></table><script>alert(1)</script>' } });
    assert.ok(!email.html.includes("<script>"));
    assert.ok(email.html.includes("&lt;script&gt;"));
  });

  test("a project title cannot inject markup", () => {
    const email = renderPortalLinkEmail({
      ...BASE,
      projectTitle: '"><img src=x onerror=alert(1)>',
    });
    assert.ok(!email.html.includes("<img src=x"));
    assert.ok(email.html.includes("&lt;img"));
  });

  test("a freelancer's note cannot inject markup", () => {
    const email = renderPortalLinkEmail({
      ...BASE,
      message: '<a href="https://phish.test">click here</a>',
    });
    assert.ok(!email.html.includes('<a href="https://phish.test"'));
    assert.ok(email.html.includes("&lt;a href="));
  });

  test("a hostile brand colour cannot escape the style attribute", () => {
    const email = renderPortalLinkEmail({ ...BASE, brand: { ...BRAND, brandColor: '#fff;background-image:url("https://tracker.test/x.png")' } });
    assert.ok(!email.html.includes("tracker.test"));
    assert.ok(email.html.includes("#4f46e5"));
  });

  test("a javascript: logo URL is dropped, not rendered", () => {
    const email = renderPortalLinkEmail({ ...BASE, brand: { ...BRAND, logoUrl: "javascript:alert(1)" } });
    assert.ok(!email.html.includes("javascript:"));
    // Falls back to the lettermark.
    assert.ok(email.html.includes(">N</div>"));
  });

  test("an https logo is used when supplied", () => {
    const email = renderPortalLinkEmail({ ...BASE, brand: { ...BRAND, logoUrl: "https://cdn.test/logo.png" } });
    assert.ok(email.html.includes('src="https://cdn.test/logo.png"'));
  });

  test("expiry is stated when the link expires, and omitted when it doesn't", () => {
    const expiring = renderPortalLinkEmail({ ...BASE, expiresOn: "Sep 30, 2026" });
    assert.ok(expiring.html.includes("stops working on Sep 30, 2026"));
    assert.ok(expiring.text.includes("stops working on Sep 30, 2026"));
    assert.ok(!renderPortalLinkEmail(BASE).html.includes("stops working"));
  });

  test("the badge follows the organisation's plan entitlement", () => {
    assert.ok(renderPortalLinkEmail(BASE).html.includes("Powered by ClientDeck"));
    assert.ok(
      !renderPortalLinkEmail({ ...BASE, brand: { ...BRAND, showBadge: false } }).html.includes("Powered by ClientDeck"),
    );
  });

  test("warns the client not to forward the link", () => {
    const email = renderPortalLinkEmail(BASE);
    assert.ok(email.html.includes("don't forward it"));
    assert.ok(email.text.includes("don't forward it"));
  });

  test("refuses to email a non-https portal link from a real deployment", () => {
    assert.throws(
      () => renderPortalLinkEmail({ ...BASE, portalUrl: "http://portal.northlight.test/portal/a" }),
      /not https/,
    );
  });

  test("allows http on localhost so local development still works", () => {
    const email = renderPortalLinkEmail({
      ...BASE,
      portalUrl: "http://localhost:3000/portal/abc123",
    });
    assert.ok(email.text.includes("http://localhost:3000/portal/abc123"));
  });
});
