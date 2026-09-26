"""
İstanbul'daki yeme-içme mekânlarını Overture Maps Places'ten indirir (Meta, Foursquare, Microsoft,
AllThePlaces kaynaklarının birleşimi). OSM'de olmayan mekânları, sokak adresini ve telefonu buradan alırız.
Lisans: CDLA-Permissive-2.0 (+ Foursquare kayıtları Apache-2.0); uygulamada "Overture Maps" atfı gösterilir.

Veri S3'te GeoParquet; DuckDB yalnızca kutudaki satır gruplarını okur (~1 dk, ~50 MB).
Gereken: pip install duckdb

Çalıştırma: npm run places:fetch  (yalnız bu adım: python scripts/places/fetch-overture.py)
Çıktı: scripts/.cache/overture/places.json
"""

import json
import os
import sys
import urllib.request

import duckdb

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
OUT_DIR = os.path.join(ROOT, "scripts", ".cache", "overture")
# config.mjs'teki BBOX ile aynı
BBOX = {"south": 40.8, "west": 27.95, "north": 41.6, "east": 29.95}

# Overture'ın ana kategorileri (basic_category); ayrıntılı tür build.mjs'te taxonomy.primary'den eşlenir
FOOD = [
    "restaurant", "cafe", "casual_eatery", "coffee_shop", "fast_food_restaurant", "bar",
    "food_truck_stand", "food_and_drink", "smoothie_juice_bar",
]


def latest_release():
    with urllib.request.urlopen("https://stac.overturemaps.org/catalog.json", timeout=30) as res:
        return json.load(res)["latest"]


def main():
    release = sys.argv[1] if len(sys.argv) > 1 else latest_release()
    print(f"Overture sürümü: {release}")
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
    with open(os.path.join(OUT_DIR, "places.json"), "w", encoding="utf-8") as f:
        json.dump({"release": release, "places": places}, f, ensure_ascii=False)
    print(f"{len(places)} mekân → scripts/.cache/overture/places.json")


if __name__ == "__main__":
    main()
