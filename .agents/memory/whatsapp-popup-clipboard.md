---
name: WhatsApp invitation popup and clipboard
description: Avoid a browser-focus failure when building personalized WhatsApp invitations.
---

Do not write to the clipboard from an asynchronous invitation callback after opening a WhatsApp popup. Put the invitation URL in WhatsApp's prefilled message; make copying a separate, explicitly handled action.

**Why:** Opening a new tab removes focus from the source document, and a later clipboard write can reject with `Document is not focused`. An unhandled rejection triggers the development error overlay and interrupts the invitation workflow. WhatsApp phone links also need international-format numbers, not raw locally formatted digits.

**How to apply:** For personalized invitations, use the shared Saudi mobile formatter, encode the full message in the WhatsApp URL, and handle blocked popups with a user-clickable fallback. Treat opening WhatsApp as distinct from confirmed message delivery.