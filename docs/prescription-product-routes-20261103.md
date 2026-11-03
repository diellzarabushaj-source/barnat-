# Direct prescription flow — runtime v42

The composer starts with one inline product search. Choosing a product inserts
its medicine card immediately. Administration categories and the global route
preflight no longer occupy the screen or block adding a medicine. Patient age
and weight appear only for children. Each medicine keeps its own route, dose,
frequency, duration and dispensing quantity; other medicine cards collapse.

A unique route from the product metadata or pharmaceutical form is filled in
and shown in the medicine identity. A product with multiple permitted routes
has a compact selector inside its own card. Selecting IV for one medicine does
not select IV for another. Detailed registry route fields override a broad
search fallback. Unknown metadata never creates a preferred injectable route.

For the exact Bromhexine Sopharma 2 mg/ml injectable form, the reviewed fallback
contains IM and IV, without a preferred route. It does not apply to oral forms,
other strengths or other brands. The EMA Article 31 Annex I product list names
both routes for this product:
https://www.ema.europa.eu/en/documents/referral/ambroxol-and-bromhexine-article-31-referral-annex-i_en.pdf
Explicit registry routes remain authoritative. This change adds no dose advice
and changes no source prescription or clinical publication status.

Verified regimens are an optional action inside the medicine card. Adding a
medicine does not open a dosage modal. A regimen still requires the clinician's
explicit confirmation, and final review gates remain in force. Targeted queries
include that medicine's route and the current patient's age/weight. A changed
route or patient measurements invalidates an applied regimen and its previous
calculated instructions. Late responses cannot revive a prior route's offer.
Product identity is retained when a regimen is applied so subsequent context
queries still target the same registry product.

Registry hydration is bounded and preserves typed fields, caret and opened
instruction editors. A new prescription/account invalidates pending requests.
Search cancellation, retry, duplicate protection, manual text recovery, saved
prescription ownership, conflict handling and A4 rendering remain exercised by
the existing suites.

## Verification scope

Browser tests use synthetic product and dosage responses. Added cases cover:
unique routes for oral/local forms; the exact Bromhexine injectable; independent
multi-route products; authoritative registry metadata; delayed metadata while
typing; optional regimen confirmation; mixed-route queries; changed pediatric
weight; late regimen responses and applied-regimen invalidation. Responsive and
print suites exercise the shipped bundle. Live authenticated prescribing and
live AI provider credentials are not claimed as locally verified.
