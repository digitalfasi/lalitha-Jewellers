"""Fill the dev database with demo data: categories, designs, pieces, combos, shops and bills.

Run from the backend folder:   python -m scripts.seed_demo
It goes through the app's own API (in-process), so every rule and code counter applies.
It uses DATABASE_URL from .env. Safe to run again: it only adds what is missing.

Demo sign-ins (local testing only - change or remove them before real use):
    owner / owner-demo-123      manager: meena / manager-demo-123      staff: ravi / staff-demo-123
"""
import asyncio
import hashlib
import os
import sys
from datetime import date, timedelta

from httpx import ASGITransport, AsyncClient

from app.main import app

INV, COMBOS, BILLING = "/api/v1/inventory", "/api/v1/combos", "/api/v1/billing"

CATEGORIES = [  # name, prefix, designs
    ("Chain", "CH", ["Rope", "Box", "Singapore", "Curb"]),
    ("Pendant", "PD", ["Lakshmi", "Om", "Heart", "Peacock"]),
    ("Ring", "RG", ["Solitaire mount", "Navaratna mount", "Plain band"]),
    ("Stone set", "ST", ["Ruby drop", "Emerald drop", "CZ cluster", "Pearl drop"]),
    ("Necklace", "NK", ["Temple", "Kundan", "Mango mala"]),
    ("Earring", "ER", ["Jhumka", "Stud"]),
    ("Bangle", "BG", ["Kada", "Plain"]),
]

# key, category, design, name, purity, gross g, stone g, touch %
PIECES = [
    ("rope1", "CH", "Rope", "Rope chain 20in", "22K", 12.450, 0, 92.0),
    ("rope2", "CH", "Rope", "Rope chain 18in", "22K", 10.880, 0, 92.0),
    ("box1", "CH", "Box", "Box chain 20in", "22K", 9.320, 0, 91.8),
    ("sing1", "CH", "Singapore", "Singapore chain 18in", "22K", 7.640, 0, 92.5),
    ("sing2", "CH", "Singapore", "Singapore chain 22in", "22K", 11.210, 0, 92.5),
    ("curb1", "CH", "Curb", "Curb chain 24in", "22K", 18.760, 0, 91.6),
    ("curb2", "CH", "Curb", "Curb chain 20in", "18K", 8.400, 0, 76.0),
    ("lak1", "PD", "Lakshmi", "Lakshmi pendant", "22K", 4.820, 0.360, 103.0),
    ("lak2", "PD", "Lakshmi", "Lakshmi pendant with stones", "22K", 6.150, 1.240, 104.0),
    ("om1", "PD", "Om", "Om pendant", "22K", 2.380, 0, 98.0),
    ("heart1", "PD", "Heart", "Heart pendant", "18K", 3.120, 0.420, 82.0),
    ("pea1", "PD", "Peacock", "Peacock pendant", "22K", 5.640, 0.980, 104.5),
    ("pea2", "PD", "Peacock", "Peacock pendant small", "22K", 3.960, 0.610, 104.5),
    ("sol1", "RG", "Solitaire mount", "Solitaire ring mount", "18K", 3.250, 0, 80.0),
    ("nav1", "RG", "Navaratna mount", "Navaratna ring", "22K", 6.480, 1.920, 96.0),
    ("band1", "RG", "Plain band", "Plain band ring", "22K", 4.100, 0, 92.0),
    ("ruby1", "ST", "Ruby drop", "Ruby drop", "22K", 2.460, 1.580, 110.0),
    ("ruby2", "ST", "Ruby drop", "Ruby drop", "22K", 2.510, 1.620, 110.0),
    ("emer1", "ST", "Emerald drop", "Emerald drop", "22K", 2.880, 1.840, 110.0),
    ("cz1", "ST", "CZ cluster", "CZ cluster top", "18K", 1.940, 0.860, 85.0),
    ("pearl1", "ST", "Pearl drop", "Pearl drop pair", "22K", 3.020, 1.950, 108.0),
    ("tem1", "NK", "Temple", "Temple necklace", "22K", 38.640, 4.280, 98.5),
    ("kun1", "NK", "Kundan", "Kundan necklace", "22K", 42.100, 9.870, 102.0),
    ("mango1", "NK", "Mango mala", "Mango mala", "22K", 56.320, 3.140, 97.0),
    ("jhum1", "ER", "Jhumka", "Jhumka pair", "22K", 9.860, 1.120, 100.0),
    ("jhum2", "ER", "Jhumka", "Jhumka pair small", "22K", 6.240, 0.680, 100.0),
    ("stud1", "ER", "Stud", "Stud pair", "22K", 2.140, 0.320, 96.0),
    ("kada1", "BG", "Kada", "Kada bangle", "22K", 24.380, 0, 92.0),
    ("plain1", "BG", "Plain", "Plain bangle (pair)", "22K", 31.640, 0, 91.8),
    ("plain2", "BG", "Plain", "Plain bangle (pair)", "22K", 28.920, 0, 91.8),
]

SHOPS = [
    {"name": "Sri Balaji Jewellers", "contact_person": "R. Venkatesh", "phone": "9840012345",
     "gstin": "33AABCS1234F1Z5", "address": "12, South Masi Street", "city": "Madurai"},
    {"name": "Ganesh Gold House", "contact_person": "K. Ganesan", "phone": "9443023456",
     "gstin": "33AAGFG5678K1Z2", "address": "45, Big Bazaar Street", "city": "Coimbatore"},
    {"name": "Annapoorna Jewels", "contact_person": "S. Meena", "phone": "9894034567",
     "address": "8, Cherry Road", "city": "Salem"},
    {"name": "Murugan Thangamaligai", "contact_person": "P. Murugan", "phone": "9976045678",
     "gstin": "33AAJPM9012L1Z8", "address": "3, NSB Road", "city": "Tiruchirappalli"},
]


USERS = [  # username, full name, role, password
    ("owner", "Demo Owner", "OWNER", os.environ.get("SEED_OWNER_PASSWORD", "owner-demo-123")),
    ("meena", "Meena (Manager)", "MANAGER", "manager-demo-123"),
    ("ravi", "Ravi (Staff)", "STAFF", "staff-demo-123"),
]

BUSINESS = {
    "name": "Sri Durga Gold Wholesale", "address": "14, NSC Bose Road, Sowcarpet", "city": "Chennai",
    "pincode": "600079", "gstin": "33AADFS4321K1Z9", "pan": "AADFS4321K", "phone": "9840098400",
    "email": "accounts@example.com", "bank_name": "State Bank of India", "bank_account": "00000012345678",
    "bank_ifsc": "SBIN0001234", "bank_branch": "Sowcarpet",
    "bill_terms": "Goods once sold are taken back only against this bill within 7 days. "
                  "Subject to Chennai jurisdiction.",
}

KARIGARS = [("Kumar Chain Works", "Coimbatore", "CH"), ("Lakshmi Casting", "Madurai", "PD"),
            ("Raja Stone Setting", "Chennai", "ST")]

TEMPLATES = [("Chain + Pendant", ["CH", "PD"]), ("Necklace + 2 drops", ["NK", "ST", "ST"]),
             ("Ring + stone top", ["RG", "ST"]), ("Earrings + drops", ["ER", "ST"])]


async def call(c, method, path, **kw):
    res = await c.request(method, path, **kw)
    if res.status_code >= 400:
        sys.exit(f"{method} {path} failed ({res.status_code}): {res.text}")
    return res.json()


async def sign_in(c):
    """First-time setup makes the owner; afterwards the owner signs in."""
    owner = USERS[0]
    if (await call(c, "GET", "/api/v1/auth/status"))["needs_setup"]:
        tok = await call(c, "POST", "/api/v1/auth/setup",
                         json={"username": owner[0], "full_name": owner[1], "password": owner[3]})
        print(f"Created the owner account: {owner[0]}")
    else:
        res = await c.post("/api/v1/auth/login", json={"username": owner[0], "password": owner[3]})
        if res.status_code != 200:
            sys.exit("Couldn't sign in as the owner. Set SEED_OWNER_PASSWORD to the owner's password.")
        tok = res.json()
    c.headers["Authorization"] = f"Bearer {tok['access_token']}"


async def setup_extras(c):
    """Staff accounts, business details and gold rates. Each part is skipped if already there.
    Runs before the bills, so they carry the business details."""
    names = {u["username"] for u in await call(c, "GET", "/api/v1/auth/users")}
    for username, full, role, pw in USERS[1:]:
        if username not in names:
            await call(c, "POST", "/api/v1/auth/users",
                       json={"username": username, "full_name": full, "role": role, "password": pw})
            print(f"Added {role.lower()} account: {username}")

    if not (await call(c, "GET", "/api/v1/business"))["is_set_up"]:
        await call(c, "PUT", "/api/v1/business", json=BUSINESS)
        print(f"Business details: {BUSINESS['name']}")

    today = date.today()
    for back, rate in enumerate([7480, 7465, 7450, 7420, 7410, 7395, 7380]):
        day = today - timedelta(days=back)
        if not (await call(c, "GET", "/api/v1/rates/today", params={"on": day.isoformat()}))["today"]:
            await call(c, "PUT", f"/api/v1/rates/{day.isoformat()}", json={"rate": rate})
    print(f"Gold rate set for the last 7 days (today Rs {7480}/g fine)")


async def stock_extras(c):
    """Lots, HUIDs and templates, once the stock exists."""
    today = date.today()
    cats = {x["code_prefix"]: x["id"] for x in await call(c, "GET", f"{INV}/categories")}
    if not await call(c, "GET", f"{INV}/karigars"):
        for i, (name, city, prefix) in enumerate(KARIGARS):
            k = await call(c, "POST", f"{INV}/karigars", json={"name": name, "city": city})
            lot = await call(c, "POST", f"{INV}/lots", json={
                "karigar_id": k["id"], "received_on": (today - timedelta(days=20 - i * 5)).isoformat(),
                "remarks": f"{name} delivery"})
            if prefix in cats:
                pieces = (await call(c, "GET", f"{INV}/pieces",
                                     params={"category_id": cats[prefix], "status": "IN_STOCK", "limit": 200}))["items"]
                for p in pieces:
                    await call(c, "PATCH", f"{INV}/pieces/{p['id']}", json={"lot_id": lot["id"]})
            print(f"{lot['lot_no']} from {name}")

        # HUIDs on the 22K pieces in stock (made up, but in the right shape).
        pieces = (await call(c, "GET", f"{INV}/pieces", params={"status": "IN_STOCK", "limit": 500}))["items"]
        n = 0
        for p in pieces:
            if p["purity"] == "22K" and not p["huid"]:
                huid = hashlib.sha1(p["item_code"].encode()).hexdigest()[:6].upper()
                await call(c, "PATCH", f"{INV}/pieces/{p['id']}", json={"huid": huid})
                n += 1
        print(f"HUID added to {n} pieces")

    if not await call(c, "GET", f"{COMBOS}/templates"):
        for name, prefixes in TEMPLATES:
            if all(p in cats for p in prefixes):
                await call(c, "POST", f"{COMBOS}/templates",
                           json={"name": name, "slots": [{"category_id": cats[p]} for p in prefixes]})
        print(f"{len(TEMPLATES)} combo templates")


async def main():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://seed") as c:
        await sign_in(c)
        await setup_extras(c)
        cats = {x["code_prefix"]: x for x in await call(c, "GET", f"{INV}/categories")}
        if "RG" in cats:
            print("Stock, combos and bills are already there; adding only what's missing.")
        else:
            await base(c, cats)
        await stock_extras(c)


async def base(c, cats):
    # Categories (Chain / Pendant may already exist from earlier testing) and designs.
    designs = {}
    for name, prefix, dnames in CATEGORIES:
        if prefix not in cats:
            cats[prefix] = await call(c, "POST", f"{INV}/categories", json={"name": name, "code_prefix": prefix})
        for i, dn in enumerate(dnames, 1):
            d = await call(c, "POST", f"{INV}/designs",
                           json={"category_id": cats[prefix]["id"], "name": dn, "design_no": f"{prefix}-D{i:02d}"})
            designs[(prefix, dn)] = d["id"]

    # Pieces. Keep the server-given Item Codes.
    code = {}
    for key, prefix, dn, name, purity, gross, stone, touch in PIECES:
        p = await call(c, "POST", f"{INV}/pieces", json={
            "category_id": cats[prefix]["id"], "design_id": designs[(prefix, dn)], "name": name,
            "purity": purity, "gross_weight": gross, "stone_weight": stone, "touch_percent": touch})
        code[key] = p["item_code"]

    # Give the earlier test piece CH0002 a touch so it can be billed straight away.
    old = await c.get(f"{INV}/pieces/by-code/CH0002")
    if old.status_code == 200 and old.json()["touch_percent"] is None:
        await call(c, "PATCH", f"{INV}/pieces/{old.json()['id']}", json={"touch_percent": 91.6})

    # Combos.
    async def combo(keys, name, remarks=None):
        return await call(c, "POST", COMBOS, json={"piece_codes": [code[k] for k in keys], "name": name, "remarks": remarks})

    c_rope = await combo(["rope1", "lak1"], "Rope chain + Lakshmi pendant")
    c_sing = await combo(["sing1", "heart1"], "Singapore chain + Heart pendant")
    await combo(["box1", "om1"], "Box chain + Om pendant")
    await combo(["sol1", "cz1"], "Solitaire ring with CZ top")
    await combo(["tem1", "ruby1", "emer1"], "Temple necklace with ruby and emerald drops", "Bridal set")
    await combo(["jhum1", "pearl1"], "Jhumka with pearl drops")
    c_curb = await combo(["curb1", "pea1"], "Curb chain + Peacock pendant")
    c_kun = await combo(["kun1", "ruby2"], "Kundan necklace + Ruby drop")

    # History: a swap, a link, an unlink and a dissolve.
    await call(c, "POST", f"{COMBOS}/{c_curb['id']}/swap",
               json={"out_code": code["pea1"], "in_code": code["pea2"], "note": "Shop asked for the smaller peacock"})
    await call(c, "POST", f"{COMBOS}/{c_curb['id']}/link", json={"piece_code": code["stud1"], "note": "Add matching studs"})
    await call(c, "POST", f"{COMBOS}/{c_curb['id']}/unlink", json={"piece_code": code["stud1"], "note": "Studs sold separately"})
    await call(c, "POST", f"{COMBOS}/{c_kun['id']}/dissolve", json={"note": "Set broken up for display"})

    # Shops.
    shop = {}
    for s in SHOPS:
        shop[s["name"]] = (await call(c, "POST", f"{BILLING}/shops", json=s))["id"]

    # Bills.
    today = date.today()

    async def bill(shop_name, days_ago, rate, lines, remarks=None):
        return await call(c, "POST", f"{BILLING}/bills", json={
            "shop_id": shop[shop_name], "bill_date": (today - timedelta(days=days_ago)).isoformat(),
            "gold_rate": rate, "gst_percent": 3, "lines": lines, "remarks": remarks})

    b1 = await bill("Sri Balaji Jewellers", 4, 7380, [
        {"code": c_rope["combo_code"], "charges": 650},  # combo as one line
        {"code": code["kada1"], "charges": 1200},
    ])
    b2 = await bill("Ganesh Gold House", 2, 7420, [  # combo split into its pieces
        {"code": code["sing1"], "charges": 400},
        {"code": code["heart1"], "charges": 350},
        {"code": code["jhum2"], "charges": 500},
    ], "Delivered by hand")
    b3 = await bill("Annapoorna Jewels", 1, 7450, [
        {"code": code["plain1"], "charges": 900},
        {"code": code["band1"], "charges": 250},
    ])
    b4 = await bill("Murugan Thangamaligai", 0, 7465, [
        {"code": code["mango1"], "charges": 1800},
        {"code": code["stud1"], "charges": 200},
    ])

    print("Seeded:")
    print(f"  {len(CATEGORIES)} categories, {len(designs)} designs, {len(PIECES)} pieces")
    print("  8 combos (2 sold, 1 dissolved, 1 with swap/link/unlink history)")
    print(f"  {len(SHOPS)} shops")
    for b in (b1, b2, b3, b4):
        print(f"  {b['bill_number']}  {b['shop_name']:<24} Rs {b['totals']['grand_total']:>12,.2f}")


if __name__ == "__main__":
    asyncio.run(main())
