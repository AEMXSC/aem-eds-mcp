# Omni-Channel Content Activation — Content Fragments + GraphQL

**This is a BUILD scenario — sets up a working headless demo with live queries.**

```
The customer is a healthcare system: patient portal, mobile app, clinical staff intranet,
and public marketing site — all need the same core clinical content, structured differently
per channel. Build a demo showing one Content Fragment authored in AEM delivered to
3 channel renditions via GraphQL. Include DMwOA for adaptive asset delivery.
Set up the CF model, sample content, and the GraphQL queries I can run live in the demo.
```

**What the skill actually builds:**

1. **Content Fragment model** — defines the schema (headline, body, CTA, channel overrides, compliance fields). Configuration files written and committed
2. **Sample content** — 3 representative healthcare Content Fragments created with real content (patient-facing, clinical staff, marketing tone variants)
3. **GraphQL persisted queries** — one query per channel, each returning only the fields that channel needs. Ready to execute live in AEM’s GraphQL Explorer during the demo
4. **Channel preview pages** — simple renditions showing the same CF displayed as patient portal card, mobile app tile, and clinical staff alert — same source, three outputs, visible simultaneously
5. **DMwOA delivery** — single asset URL configured to serve web crop, mobile crop, and thumbnail automatically with no rendition management

The demo moment: update one field in the Content Fragment, save, all three channel previews refresh. One author, zero ops tickets.

Closes with the governance angle: one approval workflow controls what goes live everywhere — patient-safe content cannot ship without compliance sign-off regardless of channel.

**Time comparison:**
- Last year without AI: AEM architect + developer + 3–5 days to define CF schema, write GraphQL queries, build channel renditions, populate sample content
- With SuperSkills: Full working demo with live queries in 1–2 hours