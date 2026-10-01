# Manual registration approval

The authorized administrator can approve a pending account from the Users panel
even when no professional document has been uploaded. An explicit approval runs
the existing server-only transactional `review_medindex_registration` RPC.

An eligible uploaded document is approved and the profile becomes `verified`.
Otherwise the profile becomes `admin_approved`, which grants account access while
keeping the absence of a document visible. The reviewer, previous status and new
verification status are recorded in the existing audit log. The same path permits
reactivation of a suspended or disabled account without a document.

Ordinary accounts cannot call the review RPC or update profile status or
verification status. Unapproved profiles still cannot become active. Existing
administrator identity, role, self-demotion and last-administrator checks remain
in force. This release does not approve any existing account automatically.

Verification: the production transaction was exercised for manual approval,
reactivation, document approval, unauthorized review and direct activation. All
test changes were rolled back. The browser fixture verifies approval and complete
user-card geometry at 320, 390, 430, 760, 900 and 1440 pixels in Chromium and WebKit.
