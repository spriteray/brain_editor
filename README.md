# BrainEditor

Behavior tree editor for `engine::brain`.

## First Version Scope

- Load one node definition file: `config/brain_nodes.xml`
- Edit behavior tree XML files
- Validate child-count and parameter types
- Preview generated `engine::brain::Builder` C++ code
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

- `config/brain_nodes.xml`: the single node metadata source
- `examples/monster_attack.xml`: sample behavior tree
- `src/domain/xml.ts`: XML parser and serializer
- `src/domain/cpp.ts`: C++ Builder code generator
- `src/domain/validate.ts`: editor validation rules

## Runtime Model

Use generated C++ as the default runtime path. Use behavior tree XML for hot update or tuning. New C++ leaf node types still need a server code release and a corresponding entry in `brain_nodes.xml`.
