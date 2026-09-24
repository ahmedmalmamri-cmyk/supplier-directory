---
name: Supplier WhatsApp share link
description: Limits of generic WhatsApp registration-link sharing from the admin page.
---

Share supplier registration invitations through WhatsApp's recipient chooser with a prefilled public registration link. The recipient must send the message in WhatsApp; the directory cannot identify the selected contact or confirm delivery, so do not log a recipient or claim the invitation was sent. Registration still creates a request that requires admin review.

**Why:** WhatsApp's share flow does not expose contact selection or delivery status to the website. Treating a share-link launch as a sent invitation would produce misleading admin records.

**How to apply:** Keep this flow independent of phone-bound supplier invitations and only report actions the site can verify, such as copying the public registration URL.