---
name: Supplier WhatsApp share link
description: Limits of generic WhatsApp registration-link sharing from the admin page.
---

Share generic supplier and business-owner registration messages through WhatsApp's recipient chooser with a link to the verified published site, not the development preview. The recipient must send the message in WhatsApp; the directory cannot identify the selected contact or confirm delivery, so do not log a recipient or claim the invitation was sent. Registration still creates a request that requires admin review.

**Why:** WhatsApp's share flow does not expose contact selection or delivery status to the website. Treating a share-link launch as a sent invitation would produce misleading admin records. A personalized invitation token belongs to the environment where it was generated: replacing a development invitation's host with the published host can make the token invalid against the separate production data.

**How to apply:** Keep generic published registration sharing independent of phone-bound, tokenized invitations. Prevent personalized invitation generation from a private development preview when recipients are outside Replit; create the token on the published origin after the supplier record exists there. Only report actions the site can verify, such as copying the registration URL or opening WhatsApp.