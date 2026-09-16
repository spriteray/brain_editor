# BrainEditor

Behavior tree editor for `engine::brain`.

## First Version Scope

- Load node definition XML files from `config/*.xml`
- Edit behavior tree XML files
- Validate child-count and parameter types
- Preview XML, validate behavior trees, and simulate debug execution order
- Package as a Windows/macOS zip for designers

## Development

Use Node.js 24.21.0 (npm 11+) for development. `.nvmrc` and `.node-version` pin the project runtime. Install the locked dependencies first, then run:

```powershell
npm ci
npm run dev
```

On macOS or Linux shells, use the same npm commands:

```bash
npm ci
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

## 子树与事件模式

选中可添加子节点的节点，点击“导入子树”插入另一份行为树 XML 的独立副本，也可从节点库创建“子树分组”。选中已有分支可点击“标记为子树”，也可“取消子树分组”恢复原分支。每个分组必须包含一个根节点，可继续编辑、折叠和嵌套。导入后不会自动同步源文件。

“保存树”保留 SubTree 分组，用于后续编辑；“导出运行 XML”先校验，再递归展开分组，供现有 C++ Loader 加载。代码生成器也会直接展开编辑文件中的 SubTree，不生成 SubTree 类或注册项。

事件模式提供 WaitEvent、EventGuard、ReactiveSelector。eventType 是 0 到 4294967295 的事件编号。调试面板可输入本帧事件编号，以检查等待、守护和分支选择。当前调试为单 Tick 模拟，不验证跨帧状态恢复、抢占时的 interrupt 或事件参数。

服务端需要使用新增节点定义重新生成注册代码。运行前调用 Context::prepare(tree->nodecount())，通过 Context::post(type, p1, p2, p3) 投递事件；Tree::update 会在帧末统一清理事件。同一事件在一帧内可被多个节点读取。编译生成树时，展开的子树由同一个 Builder 分配连续节点 ID。

加载阶段展开：`tools/brain_codegen/runtime/subtree_loader.patch` 提供现有 brain.cpp 和 brain.h 的补丁（解析辅助函数移入 cpp 匿名命名空间），在注册器创建节点、分配 ID 之前跳过 SubTree 包装并加载其根节点。应用后服务端可直接加载编辑 XML。运行加载器模板包含同样逻辑，使用时替换已有 Loader 实现，避免重复定义。

## Dependency maintenance

Direct dependencies are updated together for the Node.js 24 line. Use `npm ci` for repeatable installs, `npm run typecheck`, `npm test`, and `npm run build` to verify changes. Electron includes its own Node.js runtime independently of the development runtime. npm is the supported installer for this project; when using pnpm on exFAT drives, configure `node-linker=hoisted` because symbolic links are unavailable.

本次升级的依赖审计为 0 个已知漏洞。最新版 electron-builder 26 的间接依赖仍有 boolean、glob 7、inflight 和 rimraf 2 的废弃警告；这些警告不会被屏蔽。后续更新打包工具时继续检查。

Electron 44 的运行文件改为按需下载。项目的 postinstall 会调用 `npm run install:electron` 保持安装后可运行；如果使用 `--ignore-scripts` 安装，请手动运行该命令，再用 `npm run check:electron` 检查。
