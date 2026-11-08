#!/usr/bin/env python3
"""
PartyWeya — reading a zone out of a venue's location text.

This is the matcher used by the October register backfill, extracted from the
import script so it can be ported to TypeScript. It is the reference
implementation: five specific bugs were fixed in it against the real 239 rows,
and each fix is marked below. Keep all five.

Reads partyweya_area_zone_map.csv (area, zone, division_or_district).

    python3 place_matcher.py "Plot 14, 20 Luthuli Rise Bugolobi, Kampala"
    -> areas: ['Bugolobi']   zone: BUGOLOBI
"""
import csv, re, sys, os

MAP = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "partyweya_area_zone_map.csv")


def key(s):
    """Normalise for comparison.

    FIX 1: road suffixes are NOT stripped. 'Entebbe Rd.' and 'Entebbe' are
    different places, as are 'Hoima Rd.' and 'Hoima'. Stripping the suffix
    collapses them and sends venues to the wrong zone.
    """
    return re.sub(r"[^a-z0-9]", "", str(s).lower().strip())


VOCAB = {}      # normalised key -> canonical display spelling
AREA2ZONE = {}  # normalised key -> zone name
with open(MAP, encoding="utf-8") as f:
    for row in csv.DictReader(f):
        k = key(row["area"])
        VOCAB[k] = row["area"]
        AREA2ZONE[k] = row["zone"]

# an area whose own name is a road
ROADISH = re.compile(r"\b(rd|road|hwy|highway|express|expressway|ave|avenue|street|st)\b\.?$", re.I)
ROAD_AREA = {k for k, v in VOCAB.items() if ROADISH.search(v)}

# 'Kampala-Masaka highway' — both halves name the road, neither is an area
ROAD_COMPOUND = re.compile(
    r"\b([A-Za-z']+)\s*-\s*([A-Za-z']+)\s+(?:rd|road|hwy|highway|express\w*)\b\.?", re.I)


def areas_from_location(loc):
    """Return the canonical area names named in a location string."""
    if not loc:
        return []

    # FIX 2: words inside an 'X-Y Road' compound name the road, not a place.
    in_road = set()
    for m in ROAD_COMPOUND.finditer(loc):
        in_road.add(key(m.group(1)))
        in_road.add(key(m.group(2)))

    toks = [t for t in re.split(r"[^A-Za-z0-9'\.]+", loc) if t]
    hits = []  # (start, end, display, is_road_name)

    for i in range(len(toks)):
        # FIX 3: longest match first, so 'Bandali Rise' is tried before
        # 'Bandali' — and matching is on whole TOKENS, never substrings, so
        # 'Bandali Rise' can never yield 'Banda'.
        for n in (3, 2, 1):
            if i + n > len(toks):
                continue
            k = key(" ".join(toks[i:i + n]))
            # FIX 4: a key shorter than 4 characters matches noise.
            if len(k) < 4 or k not in VOCAB:
                continue
            # no overlapping matches
            if any(s2 <= i and i + n <= e2 for s2, e2, _, _ in hits):
                continue
            hits.append((i, i + n, VOCAB[k], k in ROAD_AREA or k in in_road))
            break

    # FIX 5: a road name counts as an area only if nothing better matched.
    #
    # KNOWN WEAKNESS, left deliberately. The fallback is right for a road
    # named after two neighbourhoods it runs between — 'Kyanja - Komamboga
    # Rd.' does place a venue in Kyanja. It is wrong for an intercity road:
    # 'Kampala-Masaka highway' yields CBD, and that highway is 130km long.
    # Telling them apart needs a list of intercity roads, which is not worth
    # building. Treat a zone that came only from a road compound as a guess
    # the operator should see and be able to override — which is what the
    # "read X out of the address, change it if it's wrong" label is for.
    plain = [h for h in hits if not h[3]]
    chosen = plain if plain else hits

    out = []
    for _, _, disp, _ in sorted(chosen):
        if disp not in out:
            out.append(disp)   # canonical spelling, never the input's casing
    return out


def zone_for_areas(areas):
    """(zone, also_touches).

    FIRST ONE WINS. This is what produced every zone in the register, and it
    is not arbitrary: Venue.areas holds the SURROUNDINGS someone listed for a
    venue, and people name the nearest or most identifying one first. 43 area
    names legitimately appear under more than one zone for this reason —
    surroundings are not a lookup table.

    The rest are returned so the caller can note them, never to block.
    """
    zones = []
    for a in areas:
        z = AREA2ZONE.get(key(a))
        if z and z not in zones:
            zones.append(z)
    if not zones:
        return None, []
    return zones[0], zones[1:]


def zone_from_location(loc):
    return zone_for_areas(areas_from_location(loc))[0]


if __name__ == "__main__":
    CASES = [
        "Plot 14, 20 Luthuli Rise Bugolobi, Kampala",
        "Bandali Rise, Bugolobi",
        "Entebbe Rd., near the airport",
        "Kampala-Masaka highway, after Freedom City",
        "Mukono, behind Igar Petrol Station",
        "Behind Igar Petrol Station",
        "Kyanja - Komamboga Rd., next to New City Center Complex",
    ]
    for loc in (sys.argv[1:] or CASES):
        a = areas_from_location(loc)
        z, amb = zone_for_areas(a)
        print(f"{loc!r:<58} -> areas {a}  zone {z}" + (f"  ambiguous {amb}" if amb else ""))
