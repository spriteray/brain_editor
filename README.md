# BrainEditor

Behavior tree editor for `engine::brain`.

## First Version Scope

- Load node definition XML files from `config/*.xml`
- Edit behavior tree XML files
- Validate child-count and parameter types
- Preview XML, validate behavior trees, and simulate debug execution order
- Package as a Windows zip for designers

## Development

Install Node.js 20+ first, then run:

```powershell
npm install
npm run dev
```

Build a green Windows package:

```powershell
npm run dist
```

The package is written to `release/`.

## Files

- `config/*.xml`: node metadata files. Files with `BrainNodeRegistry` root are merged.
- `config/behaviors/*.xml`: behavior tree XML files
- `src/domain/xml.ts`: XML parser and serializer
- `src/domain/validate.ts`: editor validation rules
- `tools/brain_codegen/brain_codegen.py`: optional Python3 codegen script to copy into the C++ project
- `tools/brain_codegen/runtime/brain_loader.h/.cpp`: optional rapidxml runtime tree loader template

## Runtime Model

The editor only edits XML. In the C++ project, copy/adapt `tools/brain_codegen/brain_codegen.py` to generate:

- `brain_nodes.h/.cpp`: node registration code from `config/*.xml`
- `behaviors/*.h/.cpp`: compile-time behavior tree Builder code from `config/behaviors/*.xml`

Runtime hot update can load the same XML files with `tools/brain_codegen/runtime/brain_loader.h/.cpp`.
Node implementations remain hand-written in C++, while node registration and tree construction are generated or loaded from XML.
Leaf nodes support two construction modes in node definition XML:

- `construct="class"`: generated registry uses `new NodeType(...)`; compile-time tree code uses `node<NodeType>(...)`
- `construct="static"`: generated registry uses `Leaf::create<NodeType>()`; compile-time tree code uses `leaf<NodeType>()`

Example:

```powershell
python tools/brain_codegen/brain_codegen.py `
  --config config `
  --registry-out generated `
  --out generated/behaviors
```
