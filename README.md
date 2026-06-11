# BrainEditor

Behavior tree editor for `engine::brain`.

## First Version Scope

- Load node definition XML files from `config/*.xml`
- Edit behavior tree XML files
- Validate child-count and parameter types
- Preview XML, validate behavior trees, and simulate debug execution order
- Package as a Windows/macOS zip for designers

## Development

Install Node.js 20+ first, then run:

```powershell
npm install
npm run dev
```

On macOS or Linux shells, use the same npm commands:

```bash
npm install
npm run dev
```

Build a package for the current platform:

```powershell
npm run dist
```

The package is written to `release/`.

## Files

- `config/*.xml`: node metadata files. Files with `BrainNodeRegistry` root are merged.
- `config/trees/*.xml`: behavior tree XML files
- `src/domain/xml.ts`: XML parser and serializer
- `src/domain/validate.ts`: editor validation rules
- `tools/brain_codegen/brain_codegen.py`: optional Python3 codegen script to copy into the C++ project
- `tools/brain_codegen/runtime/brain_loader.h/.cpp`: optional rapidxml runtime tree loader template
- `templates/brain_node_includes.h`: project-side aggregate include template for behavior node headers

## Runtime Model

The editor only edits XML. In the C++ project, copy/adapt `tools/brain_codegen/brain_codegen.py` to generate:

- `nodes.hpp/.cpp`: node registration code from `config/*.xml`
- `trees/*.hpp/.cpp`: compile-time behavior tree Builder code from `config/trees/*.xml`

Runtime hot update can load the same XML files with `tools/brain_codegen/runtime/brain_loader.h/.cpp`.
Node implementations remain hand-written in C++, while node registration and tree construction are generated or loaded from XML.
Leaf nodes support two construction modes in node definition XML:

- `construct="class"`: generated registry uses `new NodeType(...)`; compile-time tree code uses `node<NodeType>(...)`
- `construct="static"`: generated registry uses `Leaf::create<NodeType>()`; compile-time tree code uses `leaf<NodeType>()`

Generated `.cpp` files include `brain_node_includes.h` by default. Keep project behavior node headers in that aggregate file, or override it with `--include`.

Example:

```powershell
python tools/brain_codegen/brain_codegen.py `
  --config config `
  --out generated
```

macOS/Linux:

```bash
python3 tools/brain_codegen/brain_codegen.py \
  --config config \
  --out generated
```
