"""Download reviewed public catalog pictures for the Excel inventory.

Pictures are examples of a catalog product, not proof of the exact item at home.
The source page is retained in src/data/catalog-photos.json.
"""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "public" / "medicines"
MANIFEST = ROOT / "src" / "data" / "catalog-photos.json"
CANDIDATES = ROOT / "scripts" / "photo-candidates.json"

# These were checked against the name and, where stated, the dose/form in Excel.
# Vague generic records use a catalog example of the same type of product.
APPROVED = {
    1, 3, 4, 5, 6, 7, 8, 10, 11, 12, 15, 16, 17, 18, 19, 20, 21, 22,
    24, 27, 28, 29, 31, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43,
    47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62,
    63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78,
    79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95,
}

# Exact product pages replace misleading image-search thumbnails.
EXACT_PAGES = {
    3: "https://www.eapteka.ru/goods/id61785/",
    6: "https://www.eapteka.ru/goods/id205920/",
    8: "https://www.eapteka.ru/goods/id230924/",
    10: "https://www.eapteka.ru/goods/id273924/",
    31: "https://www.eapteka.ru/goods/id203258/",
    37: "https://www.eapteka.ru/goods/id125459/",
    39: "https://www.eapteka.ru/goods/id222013/",
    93: "https://www.eapteka.ru/goods/id215355/",
    85: "https://www.eapteka.ru/goods/id106111/",
}
IMAGE_OVERRIDES = {
    15: ("https://www.naturmed.com.tr/products/star-med-100ml", "https://www.naturmed.com.tr/cdn/shop/files/starmed_kutu_tup_YENI.png?v=1738226826&width=3000", "Star-Med Masaj Kremi"),
    19: ("https://apteka.ru/product/moksonidin-alsi-02-mg-30-sht-tabletki-pokrytye-plenochnoj-obolochkoj-610804a1560fcb572945b87b/", "https://images.apteka.ru/original_7b903562-d547-40b6-bbc5-0a4c0b66b37b.png", "Моксонидин-Алси 0,2 мг"),
    34: ("https://ekb.uteka.ru/product/glirikum-glicin--vitaminy-gruppy-b-371147/", "https://media.uteka.ru/media/big/d/3c/d3c3ce90418a1d847c1f2e283e9781e1.jpg", "Глирикум таблетки"),
    36: ("https://kaspi.kz/shop/p/plastyr-traditsionnyi-4-500sm-1-sht-ne-steril-no-102363361/", "https://resources.cdn-kaspi.kz/img/m/p/h8b/h6b/64140800819230.jpg?format=gallery-medium", "Лейкопластырь традиционный"),
    49: ("https://www.evdeeczane.com/hunnap-karadut-surubu-50-ml", "https://witcdn.evdeeczane.com/hunnap-karadut-surubu-50-ml-bitkisel-urunler-surup-16157-67-B.jpg", "Hünnap Karadut Şurubu"),
    67: ("https://kaspi.kz/shop/p/plastyr-traditsionnyi-4-500sm-1-sht-ne-steril-no-102363361/", "https://resources.cdn-kaspi.kz/img/m/p/h8b/h6b/64140800819230.jpg?format=gallery-medium", "Мультипласт лейкопластырь"),
    81: ("https://www.theblackpearl.ru/product/krem-gel-dlja-umyvanija-dlja-suhoj-i-chuvstvitelnoj-kozhi", "https://blackpearl-storage-s3.storage.yandexcloud.net/2083/conversions/%D0%B3%D0%B5%D0%BB%D1%8C-%D0%B4%D0%BB%D1%8F-%D1%83%D0%BC%D1%8B%D0%B2%D0%B0%D0%BD%D0%B8%D1%8F-120-2-webp.webp", "Чёрный жемчуг крем-гель для умывания"),
    69: ("https://uteka.ru/product/superum-kompleks-pri-pohmele-s-yantarnoy-kislotoy-i-taurinom-396183/", "https://media.uteka.ru/media/big/b/23/b233983f325142c9fdea5093d11621e0.jpg", "Superum Комплекс при похмелье"),
    79: ("https://aromarin.ru/formanorm-koncentrat-pischevoi-kapsuli-na-osnove-rastitelnogo-sirya-60-kap-po-500-mg-DOCTOR-OIL", "https://aromarin.ru/image/cache/catalog/tovar/00003871-750x600.jpg", "Форманорм 500 мг капсулы"),
    82: ("https://volgograd.uteka.ru/product/loshadinoe-zdorove-balzam-gel-specialnyy-razgibatel-360238/", "https://media.uteka.ru/media/big/e/3a/e3ac32968abb6d398b670cd438123f25.jpg", "Лошадиное здоровье Разгибатель"),
}


def main() -> None:
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 (compatible; FamilyMedicineCabinet/1.0)"})
    DEST.mkdir(parents=True, exist_ok=True)
    candidates = json.loads(CANDIDATES.read_text(encoding="utf-8"))
    selected = {int(value) for value in sys.argv[1:]} if len(sys.argv) > 1 else APPROVED
    records = [entry for entry in json.loads(MANIFEST.read_text(encoding="utf-8")) if entry["source_id"] not in selected] if MANIFEST.exists() else []
    failures = []
    for entry in candidates:
        source_id = entry["id"]
        if source_id not in APPROVED or source_id not in selected:
            continue
        source = EXACT_PAGES.get(source_id, entry["source"])
        image_url = entry["image"]
        title = entry["title"]
        if source_id in IMAGE_OVERRIDES:
            source, image_url, title = IMAGE_OVERRIDES[source_id]
        try:
            if source_id in EXACT_PAGES:
                page = session.get(source, timeout=18)
                page.raise_for_status()
                soup = BeautifulSoup(page.content, "html.parser")
                image_tag = soup.find("meta", attrs={"property": "og:image"}) or soup.find("meta", attrs={"name": "og:image"})
                title_tag = soup.find("meta", attrs={"property": "og:image:alt"}) or soup.find("meta", attrs={"name": "og:image:alt"})
                if not image_tag or not image_tag.get("content"):
                    raise ValueError("product page has no image")
                image_url = image_tag["content"]
                title = title_tag.get("content", title) if title_tag else title
            if not image_url or not image_url.startswith("https://"):
                raise ValueError("missing HTTPS image")
            response = session.get(image_url, timeout=22, stream=True)
            response.raise_for_status()
            content = response.raw.read(8_000_001)
            if len(content) > 8_000_000:
                raise ValueError("image exceeds 8 MB")
            image = Image.open(io.BytesIO(content))
            image.load()
            if min(image.size) < 100:
                raise ValueError("image is too small")
            image = ImageOps.exif_transpose(image).convert("RGBA")
            image.thumbnail((640, 640), Image.Resampling.LANCZOS)
            canvas = Image.new("RGB", image.size, "white")
            canvas.paste(image, mask=image.getchannel("A"))
            path = DEST / f"{source_id:02d}.webp"
            canvas.save(path, "WEBP", quality=82, method=6)
            records.append({"source_id": source_id, "path": f"/medicines/{path.name}", "source": source, "title": title})
            print(f"{source_id:02d} OK {path.stat().st_size} bytes")
        except Exception as exc:  # One unavailable catalog image must not stop the rest.
            failures.append({"source_id": source_id, "error": str(exc)[:180]})
            print(f"{source_id:02d} FAIL {exc}")
    records.sort(key=lambda entry: entry["source_id"])
    MANIFEST.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {len(records)} images; failed {len(failures)}")
    if failures:
        (ROOT / "scripts" / "photo-download-errors.json").write_text(json.dumps(failures, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
