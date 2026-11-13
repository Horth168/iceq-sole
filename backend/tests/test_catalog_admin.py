from pathlib import Path

from app.config import settings
from tests.conftest import png_bytes


def test_public_listing_filters_and_sort(client, catalog):
    r = client.get("/api/products")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    card = body["items"][0]
    assert card["effective_price"] == 80 and card["discount_percent"] == 20
    assert card["sizes"] == ["42", "43"]
    assert client.get("/api/products", params={"brand": "nope"}).json()["total"] == 0
    assert client.get("/api/products", params={"size": "42", "color": "black"}).json()["total"] == 1
    assert client.get("/api/products", params={"min_price": 90}).json()["total"] == 0
    assert client.get("/api/products", params={"q": "runner", "sort": "price_desc"}).json()["total"] == 1
    assert client.get("/api/products/filters").json()["price"] == {"min": 80.0, "max": 80.0}
    detail = client.get("/api/products/test-runner").json()
    assert len(detail["variants"]) == 4
    assert client.get("/api/products/missing").status_code == 404


def test_product_crud_with_variants(client, admin_headers, catalog):
    white, black = catalog["colors"]
    s42, s43 = catalog["sizes"]
    payload = {
        "name": "Air Test 1", "model": "AT1", "description": "Demo", "gender": "men", "price": 120, "sale_price": 99,
        "brand_id": catalog["brand"].id, "category_id": catalog["category"].id, "is_featured": True,
        "variants": [{"color_id": white.id, "size_id": s42.id, "stock": 5},
                     {"color_id": white.id, "size_id": s43.id, "stock": 0}],
    }
    r = client.post("/api/admin/products", json=payload, headers=admin_headers)
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["slug"] == "air-test-1" and p["total_stock"] == 5
    # stock movement was logged
    mv = client.get("/api/admin/inventory/movements", params={"product_id": p["id"]}, headers=admin_headers).json()
    assert mv["total"] == 1 and mv["items"][0]["reason"] == "initial"

    # edit: change stock and remove a variant
    v42 = next(v for v in p["variants"] if v["size"] == "42")
    payload["variants"] = [{"id": v42["id"], "color_id": white.id, "size_id": s42.id, "stock": 7}]
    payload["price"] = 130
    r = client.put(f"/api/admin/products/{p['id']}", json=payload, headers=admin_headers)
    assert r.status_code == 200, r.text
    assert len(r.json()["variants"]) == 1 and r.json()["variants"][0]["stock"] == 7
    assert client.get(f"/api/products/{p['slug']}").json()["price"] == 130

    # validation: sale price must be lower than price
    bad = dict(payload, sale_price=200)
    assert client.put(f"/api/admin/products/{p['id']}", json=bad, headers=admin_headers).status_code == 422

    # delete (no orders) removes it from storefront
    assert client.delete(f"/api/admin/products/{p['id']}", headers=admin_headers).json()["deleted"]
    assert client.get(f"/api/products/{p['slug']}").status_code == 404


def test_image_upload_reorder_replace_delete(client, admin_headers, catalog):
    pid = catalog["product"].id
    files = [("files", ("a.png", png_bytes(), "image/png")), ("files", ("b.png", png_bytes(color=(10, 10, 10)), "image/png"))]
    r = client.post(f"/api/admin/products/{pid}/images", files=files, headers=admin_headers)
    assert r.status_code == 201, r.text
    imgs = r.json()
    assert len(imgs) == 2 and imgs[0]["is_primary"]
    assert imgs[0]["srcset"].count("w,") >= 1  # responsive renditions (480w, 960w, 1200w)
    root = Path(settings.LOCAL_UPLOAD_DIR)
    first_key = imgs[0]["url"].split("/uploads/")[1]
    assert (root / first_key).exists()
    # image still served after "refresh" (static route)
    assert client.get(f"/uploads/{first_key}").status_code == 200

    # reorder -> second becomes primary
    r = client.put(f"/api/admin/products/{pid}/images-order", json={"image_ids": [imgs[1]["id"], imgs[0]["id"]]},
                   headers=admin_headers)
    assert r.json()[0]["id"] == imgs[1]["id"] and r.json()[0]["is_primary"]

    # replace file: old object deleted, new one exists
    r = client.put(f"/api/admin/products/{pid}/images/{imgs[0]['id']}/file",
                   files={"file": ("c.png", png_bytes(800, 800, (255, 0, 0)), "image/png")}, headers=admin_headers)
    assert r.status_code == 200
    assert not (root / first_key).exists()
    new_key = r.json()["url"].split("/uploads/")[1]
    assert (root / new_key).exists()

    # delete
    assert client.delete(f"/api/admin/products/{pid}/images/{imgs[0]['id']}", headers=admin_headers).status_code == 204
    assert not (root / new_key).exists()


def test_upload_rejects_non_images_and_oversize(client, admin_headers, catalog):
    pid = catalog["product"].id
    r = client.post(f"/api/admin/products/{pid}/images", files=[("files", ("x.png", b"<svg onload=alert(1)>", "image/png"))],
                    headers=admin_headers)
    assert r.status_code == 415
    big = b"0" * (settings.MAX_UPLOAD_MB * 1024 * 1024 + 10)
    r = client.post(f"/api/admin/products/{pid}/images", files=[("files", ("big.jpg", big, "image/jpeg"))], headers=admin_headers)
    assert r.status_code == 413


def test_taxonomy_crud(client, admin_headers, catalog):
    r = client.post("/api/admin/brands", json={"name": "New Brand"}, headers=admin_headers)
    assert r.status_code == 201 and r.json()["slug"] == "new-brand"
    assert client.post("/api/admin/brands", json={"name": "New Brand"}, headers=admin_headers).status_code == 409
    # cannot delete a brand that has products
    assert client.delete(f"/api/admin/brands/{catalog['brand'].id}", headers=admin_headers).status_code == 409
    assert client.delete(f"/api/admin/brands/{r.json()['id']}", headers=admin_headers).status_code == 204
    assert client.post("/api/admin/colors", json={"name": "Volt", "hex": "#CEFF00"}, headers=admin_headers).status_code == 201
    assert client.post("/api/admin/colors", json={"name": "Bad", "hex": "red"}, headers=admin_headers).status_code == 422
    assert client.post("/api/admin/sizes", json={"label": "44.5"}, headers=admin_headers).status_code == 201
