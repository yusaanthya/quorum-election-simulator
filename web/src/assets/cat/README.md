# Cat model

This directory holds the cat model the app draws:

- `cat_v2.glb`: the shipped model, imported by `web/src/scene/cat.ts` as a Vite asset URL.
- `build_cat_v2.py`: its canonical Blender source. Rebuilding the GLB needs only this script
  and Blender 5.3; it imports no add-on and no other file in the repository.

The spike aids that helped shape the model (render helpers, the fur comparison page) live in
`../cat-spike/` and are not needed to rebuild the GLB.

## Rebuild

Run from the repository root with Blender 5.3 headless (`$BLENDER_EXE` is the Blender 5.3
executable; no add-on is needed), writing into a directory outside the repository:

```sh
out=$(mktemp -d)
"$BLENDER_EXE" -b --factory-startup --python-exit-code 1 -P web/src/assets/cat/build_cat_v2.py -- "$out/cat_v2.glb"
```

To override shape parameters (the keys of `P` in the script), pass the quoted JSON object
alone as the last argument:

```sh
out=$(mktemp -d)
"$BLENDER_EXE" -b --factory-startup --python-exit-code 1 -P web/src/assets/cat/build_cat_v2.py -- "$out/cat_v2.glb" '{"ear_h": 0.3}'
```

Each run writes the GLB at exactly the path given and `cat_v2.blend` beside it (creating the
directory if needed), and prints a `@@REPORT@@` line with the model's measurements.
`--python-exit-code 1` makes Blender exit non-zero whenever the script fails.

Output belongs outside the repository. The script does not check this; it is a usage rule.

The `cat_v2.blend` written beside the output GLB is a by-product and is never committed. A
rebuilt GLB is verification output: replacing the shipped `cat_v2.glb` is a separate copy,
made only under the regeneration rule below.

## Refusals

Before writing any file or directory, the script refuses, with a message starting
`build_cat_v2.py: refused:` and a non-zero exit:

- no output path after `--`;
- an output path that does not end in `.glb`, compared case-sensitively (`OUT.GLB` and
  `cat_v2.blend` are refused);
- a second argument that does not start with `{` or is not a JSON object (for example
  `ear_h=0.3`);
- any further argument, including a second JSON object;
- a JSON key that is not a key of `P`;
- the shipped GLB as output: an output path that, made absolute with symbolic links
  resolved, is `cat_v2.glb` in this directory;
- a `.blend` collision: an output path that resolves to a file named `cat_v2.blend`, or to
  the `cat_v2.blend` the script would write;
- a companion `cat_v2.blend` (beside the output path) that is a symbolic link, whatever its
  target, or that resolves to the shipped GLB.

## Regeneration contract

A regenerated GLB must keep:

- objects `Body` and `Tail`; `Eye_L`, `Eye_R`, `Whiskers_L` and `Whiskers_R` children of
  `Body`;
- material `M_EyeRing` on the eye rings and `M_Fur` on body and tail;
- the `Body` origin at its bottom centre;
- the `Tail` origin where the tail leaves the body;
- the front along -Y in Blender (+Z in three.js).

Derived from the loader code (`web/src/scene/cat.ts`), not from the design, the loader also
relies on this structure:

- `Body` has an identity transform: the code treats `Body` space as the cat's space for its
  landmarks;
- `Body` and `Tail` each carry `M_Fur` only, so each loads as a single mesh whose geometry the
  code reads directly;
- `Tail` is a direct child of `Body`, and its position is read as its origin in body space;
- the eye and whisker positions are read the same way;
- on each eye object, the ring is a direct child mesh whose material is named `M_EyeRing` (the
  glTF loader splits a multi-material eye into child meshes).

The `Col` / `COLOR_0` vertex colour is not part of the contract and is not used.

A regenerated GLB counts as the same cat only if it keeps this contract and the owner agrees
it looks the same. Any change to the cat's shape goes to the owner.
