# modules

One folder per feature, each with `model.py`, `schema.py`, `repository.py`, `service.py`, `router.py`
(same layout as the main DFX backend).

- **inventory** — categories (each with a code prefix), designs, individual pieces.
  Every piece gets an auto Item Code (`<prefix><4 digits>`, e.g. `CH0001`) from a locked counter.
- **combos** — link 2+ pieces into a combo with its own code (e.g. `CB0001`); unlink or swap.
  A piece is in at most one active combo. Every link / unlink / swap is kept as history.
- **tags** — printable labels (code + QR + barcode) for pieces and combos; a scan resolves to the item.
- **billing** — retail shops, and bills to them. A combo is billed as one line or one line per piece
  (then all its pieces must be on the bill). Saving marks every piece and combo SOLD; cancelling puts them back.
  Pricing (v1, to confirm with the wholesaler) is in `billing/pricing.py`:
  fine = net × touch %, metal = fine × gold rate, amount = metal + charges, GST on the subtotal, total rounded to the rupee.
