# Head neuroanatomy 3D — data pipeline

Builds optimized group GLBs and `../assets/structures.json` from open meshes.

```bash
cd head-neuroanatomy-3d/tools
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm install
.venv/bin/python build.py
```

Raw downloads stay in gitignored `_cache/`. Only `../assets/` is committed.

| Step | Script | Output |
|---|---|---|
| audit | `audit.py` | `_cache/audit_report.json` |
| fetch | `fetch.py` | `_cache/{allen,pitt,aan,graphcolouring,bodyparts3d}/` |
| inspect | `inspect_sources.py` | `_cache/inspect/inspect_report.json` |
| register | `register.py` | `../assets/registration.json`, `_cache/qa/*.png` |
| derive | `derive.py` | `_cache/intermediate/*.ply` |
| optimize | `optimize.py` | `../assets/*.glb`, `../assets/structures.json` |

Master space is MNI152 mm RAS+. three.js `(x, z, -y)` is baked into every GLB.

Group GLBs are standard (uncompressed) glTF so three.js r128 can load them without a meshopt decoder. Named nodes are `meshNode` strings.

Harvard AAN v2 NIfTIs are CC0, but Dryad file downloads returned 401/429 here, so `aras.glb` uses labelled schematic ellipsoids at published MNI centres. Inner ear / olfactory epithelium are procedural schematics (BodyParts3D has no labyrinth meshes).

`fetch.py --with-bp3d-zip` also pulls the 62 MB BodyParts3D PART-OF OBJ archive after the sensory audit.
