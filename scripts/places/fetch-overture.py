"""
Bir ildeki yeme-içme mekânlarını Overture Maps Places'ten indirir (Meta, Foursquare, Microsoft,
AllThePlaces kaynaklarının birleşimi). OSM'de olmayan mekânları, sokak adresini ve telefonu buradan alırız.
Lisans: CDLA-Permissive-2.0 (+ Foursquare kayıtları Apache-2.0); uygulamada "Overture Maps" atfı gösterilir.

Veri S3'te GeoParquet; DuckDB yalnızca kutudaki satır gruplarını okur (~1 dk, ~50 MB).
Gereken: pip install duckdb

Çalıştırma: PLACES_CITY=ankara npm run places:fetch  (yalnız bu adım: python scripts/places/fetch-overture.py
[--city=ankara] [sürüm]). İl ve kutusu cities.json'dan (config.mjs ile aynı; varsayılan İstanbul).
Çıktı: scripts/.cache/overture/places.json (İstanbul), places-<il>.json (diğerleri)
"""

import json
import os
import sys
import urllib.request

import duckdb

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
OUT_DIR = os.path.join(ROOT, "scripts", ".cache", "overture")
CITIES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cities.json")

# Overture'ın ana kategorileri (basic_category); ayrıntılı tür build.mjs'te taxonomy.primary'den eşlenir
FOOD = [
    "restaurant", "cafe", "casual_eatery", "coffee_shop", "fast_food_restaurant", "bar",
    "food_truck_stand", "food_and_drink", "smoothie_juice_bar",
]


def latest_release():
    with urllib.request.urlopen("https://stac.overturemaps.org/catalog.json", timeout=30) as res:
        return json.load(res)["latest"]


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # Windows konsolu (cp1254) "→" basamıyor
    args = [a for a in sys.argv[1:] if not a.startswith("--city=")]
    city_arg = next((a[7:] for a in sys.argv[1:] if a.startswith("--city=")), None)
    key = (city_arg or os.environ.get("PLACES_CITY") or "istanbul").strip().lower()
    with open(CITIES_FILE, encoding="utf-8") as f:
        cities = json.load(f)
    if key not in cities:
        sys.exit(f"Bilinmeyen il {key!r}. cities.json'dakiler: {', '.join(cities)}")
    BBOX = cities[key]["bbox"]
    out_file = os.path.join(OUT_DIR, "places.json" if key == "istanbul" else f"places-{key}.json")

    release = args[0] if args else latest_release()
    print(f"{cities[key]['city']}: Overture sürümü {release}")
    os.makedirs(OUT_DIR, exist_ok=True)

    con = duckdb.connect()
    con.sql("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
    categories = ", ".join(f"'{c}'" for c in FOOD)
    rows = con.sql(f"""
        select
          id,
          names.primary as name,
          names.common['tr'] as name_tr,
          names.common['en'] as name_en,
          basic_category,
          taxonomy.primary as category,
          taxonomy.alternates as alternates,
          confidence,
          round(st_y(geometry), 6) as latitude,
          round(st_x(geometry), 6) as longitude,
          addresses[1].freeform as address,
          addresses[1].locality as locality,
          phones[1] as phone,
          websites[1] as website,
          brand.names.primary as brand,
          list_transform(sources, s -> s.dataset) as datasets
        from read_parquet('s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*', hive_partitioning = 1)
        where bbox.xmin between {BBOX['west']} and {BBOX['east']}
          and bbox.ymin between {BBOX['south']} and {BBOX['north']}
          and basic_category in ({categories})
          and coalesce(operating_status, 'open') = 'open'
    """).fetchall()
    columns = [
        "id", "name", "name_tr", "name_en", "basic_category", "category", "alternates", "confidence",
        "latitude", "longitude", "address", "locality", "phone", "website", "brand", "datasets",
    ]
    places = [dict(zip(columns, r)) for r in rows]
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({"release": release, "places": places}, f, ensure_ascii=False)
    print(f"{len(places)} mekân → {os.path.relpath(out_file, ROOT)}")


if __name__ == "__main__":
    main()
