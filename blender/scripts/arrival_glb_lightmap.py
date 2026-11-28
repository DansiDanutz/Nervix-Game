"""Inject the baked lightmap atlas into the exported arrival GLB (pure Python, no Blender API).

Blender's glTF exporter has no lightmap slot, so after export this module:
  * appends ar_lightmap.jpg to the BIN chunk as image/texture (clamped, mipmapped);
  * for every material whose extras say lightmap=true: sets occlusionTexture {index, texCoord: 1}
    (standard glTF; a client without lightmap support still gets sensible AO from it) and adds
    extras.lightmap_texture / extras.lightmap_texcoord so the client can bind it as
    material.lightMap on uv1 (texel sRGB-decoded * extras.lightmap_scale = lighting);
  * checks that every primitive drawn with such a material carries TEXCOORD_1.
"""

import json
import struct

GLB_MAGIC, JSON_TYPE, BIN_TYPE = 0x46546C67, 0x4E4F534A, 0x004E4942
LINEAR, LINEAR_MIPMAP_LINEAR, CLAMP = 9729, 9987, 33071


def _read(path):
    with open(path, "rb") as fh:
        data = fh.read()
    magic, _version, _length = struct.unpack_from("<III", data, 0)
    assert magic == GLB_MAGIC, "not a GLB"
    off, doc, binary = 12, None, b""
    while off < len(data):
        clen, ctype = struct.unpack_from("<II", data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == JSON_TYPE:
            doc = json.loads(chunk.decode("utf-8"))
        elif ctype == BIN_TYPE:
            binary = chunk
        off += 8 + clen
    return doc, bytearray(binary)


def _write(path, doc, binary):
    js = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)
    binary = bytes(binary) + b"\0" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", GLB_MAGIC, 2, total))
        fh.write(struct.pack("<II", len(js), JSON_TYPE) + js)
        fh.write(struct.pack("<II", len(binary), BIN_TYPE) + binary)
    return total


def inject(glb_path, jpeg_path, scale):
    doc, binary = _read(glb_path)
    with open(jpeg_path, "rb") as fh:
        jpeg = fh.read()
    binary += b"\0" * ((4 - len(binary) % 4) % 4)
    views = doc.setdefault("bufferViews", [])
    views.append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(jpeg)})
    binary += jpeg
    doc["buffers"][0]["byteLength"] = len(binary)
    images = doc.setdefault("images", [])
    images.append({"bufferView": len(views) - 1, "mimeType": "image/jpeg", "name": "ar_lightmap"})
    samplers = doc.setdefault("samplers", [])
    samplers.append({"magFilter": LINEAR, "minFilter": LINEAR_MIPMAP_LINEAR, "wrapS": CLAMP, "wrapT": CLAMP})
    textures = doc.setdefault("textures", [])
    textures.append({"sampler": len(samplers) - 1, "source": len(images) - 1, "name": "ar_lightmap"})
    tex = len(textures) - 1
    lm_mats = set()
    for i, mat in enumerate(doc.get("materials", [])):
        ex = mat.get("extras", {})
        if not ex.get("lightmap"):
            continue
        lm_mats.add(i)
        mat["occlusionTexture"] = {"index": tex, "texCoord": 1}
        ex.update({"lightmap_texture": tex, "lightmap_texcoord": 1, "lightmap_scale": round(scale, 5),
                   "lightmap_intensity": round(scale, 5),   # name read by app/src/scene/bakedLighting.ts
                   "lightmap_encoding": "srgb"})
        mat["extras"] = ex
    missing = []
    prims = 0
    for mesh in doc.get("meshes", []):
        for prim in mesh["primitives"]:
            if prim.get("material") in lm_mats:
                prims += 1
                if "TEXCOORD_1" not in prim["attributes"]:
                    missing.append(mesh.get("name"))
    assert not missing, f"lightmapped primitives without TEXCOORD_1: {sorted(set(missing))[:10]}"
    size = _write(glb_path, doc, binary)
    return {"materials": len(lm_mats), "primitives": prims, "texture": tex, "bytes": size,
            "jpeg_bytes": len(jpeg)}
