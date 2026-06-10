#!/usr/bin/env python3
"""
Generate engine::brain C++ code from behavior tree XML files.

This script is intentionally self-contained so it can be copied into the C++
server project and adapted to that project's include paths and factory naming.
It generates node registration from BrainNodeRegistry XML files and compile-time
Builder code from behavior tree XML files. Node implementations stay hand-written.
"""

from __future__ import annotations

import argparse
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ParamDef:
    name: str
    type: str
    default: str
    order: int
    values: list[str]


@dataclass(frozen=True)
class NodeDef:
    name: str
    cpp: str
    category: str
    construct: str
    params: list[ParamDef]


def parse_node_defs(path: Path) -> dict[str, NodeDef]:
    root = ET.parse(path).getroot()
    if root.tag != "BrainNodeRegistry":
        return {}
    nodes: dict[str, NodeDef] = {}
    for elem in root.findall("Node"):
        name = elem.attrib["name"]
        params = []
        for param in elem.findall("Param"):
            params.append(
                ParamDef(
                    name=param.attrib["name"],
                    type=param.attrib.get("type", "string"),
                    default=param.attrib.get("default", ""),
                    order=int(param.attrib.get("order", "0")),
                    values=[
                        item.strip()
                        for item in param.attrib.get("values", "").split(",")
                        if item.strip()
                    ],
                )
            )
        params.sort(key=lambda item: item.order)
        nodes[name] = NodeDef(
            name=name,
            cpp=elem.attrib.get("cpp", name),
            category=elem.attrib["category"],
            construct=elem.attrib.get("construct", "class"),
            params=params,
        )
    return nodes


def discover_node_files(config_dir: Path) -> list[Path]:
    if not config_dir.exists():
        raise FileNotFoundError(f"Config directory does not exist: {config_dir}")
    return sorted(path for path in config_dir.glob("*.xml") if path.is_file())


def load_node_defs(config_dir: Path, node_files: list[Path]) -> dict[str, NodeDef]:
    nodes: dict[str, NodeDef] = {}
    files = [*discover_node_files(config_dir), *node_files]
    if not files:
        raise ValueError(f"No XML files found in config directory: {config_dir}")

    for path in files:
        parsed = parse_node_defs(path)
        if not parsed:
            continue
        nodes.update(parsed)
        print(f"loaded node definitions: {path}")

    if not nodes:
        raise ValueError(f"No BrainNodeRegistry XML files found in: {config_dir}")
    return nodes


def sanitize_symbol(name: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    if not value:
        return "behavior_tree"
    if value[0].isdigit():
        value = f"_{value}"
    return value


def include_guard(filename: str) -> str:
    return "GENERATED_BRAIN_" + re.sub(r"[^a-zA-Z0-9]", "_", filename).upper()


def node_type(elem: ET.Element) -> str:
    if elem.tag == "Leaf":
        return elem.attrib["type"]
    return elem.tag


def quote(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def format_arg(value: str, type_name: str) -> str:
    if type_name == "string":
        return quote(value)
    return value


def xmlget_type(type_name: str) -> str:
    mapping = {
        "bool": "bool",
        "int": "int32_t",
        "float": "float",
        "string": "std::string",
    }
    return mapping.get(type_name, type_name)


def registry_arg_expr(param: ParamDef) -> str:
    if param.type == "enum":
        values = param.values
        if not values:
            raise ValueError(f"Enum param {param.name} must define values.")
        default_value = param.default or values[0]
        lines = [
            "([&]() {",
            f"                auto value = engine::xmlget<std::string>( root, \"{param.name}\" );",
        ]
        for value in values:
            lines.append(f"                if ( value == \"{value}\" ) return {value};")
        lines.append(f"                return {default_value};")
        lines.append("            })()")
        return "\n".join(lines)
    return f"engine::xmlget<{xmlget_type(param.type)}>( root, \"{param.name}\" )"


def node_args(elem: ET.Element, node_def: NodeDef) -> str:
    args = []
    for param in node_def.params:
        value = elem.attrib.get(param.name, param.default)
        args.append(format_arg(value, param.type))
    return ", ".join(args)


def validate_construct(node_def: NodeDef) -> None:
    if node_def.construct not in ("class", "static"):
        raise ValueError(f"Unsupported construct {node_def.construct} for node {node_def.name}")
    if node_def.construct == "static" and node_def.category != "Leaf":
        raise ValueError(f"Static construct is only supported for Leaf node: {node_def.name}")
    if node_def.construct == "static" and node_def.params:
        raise ValueError(f"Static Leaf node cannot define constructor params: {node_def.name}")


def emit_node(elem: ET.Element, nodes: dict[str, NodeDef], depth: int, lines: list[str]) -> None:
    name = node_type(elem)
    if name not in nodes:
        raise ValueError(f"Unknown node type: {name}")

    node_def = nodes[name]
    validate_construct(node_def)
    indent = "    " * depth
    args = node_args(elem, node_def)
    call_args = f"({args})" if args else "()"

    if node_def.category == "Composite":
        lines.append(f"{indent}.composite<{node_def.cpp}>{call_args}")
        for child in list(elem):
            emit_node(child, nodes, depth + 1, lines)
        lines.append(f"{indent}.end()")
    elif node_def.category == "Decorator":
        lines.append(f"{indent}.decorator<{node_def.cpp}>{call_args}")
        children = list(elem)
        if len(children) != 1:
            raise ValueError(f"Decorator node {name} must have exactly one child.")
        emit_node(children[0], nodes, depth + 1, lines)
        lines.append(f"{indent}.end()")
    elif node_def.category == "Leaf":
        if list(elem):
            raise ValueError(f"Leaf node {name} cannot have children.")
        if node_def.construct == "static":
            lines.append(f"{indent}.leaf<{node_def.cpp}>()")
        else:
            lines.append(f"{indent}.node<{node_def.cpp}>{call_args}")
    else:
        raise ValueError(f"Unsupported category {node_def.category} for node {name}")


def first_element_child(elem: ET.Element) -> ET.Element:
    children = list(elem)
    if len(children) != 1:
        raise ValueError("BehaviorTree must have exactly one root node.")
    return children[0]


def generate_behavior_cpp(behavior_xml: Path, nodes: dict[str, NodeDef], include: str) -> tuple[str, str, str]:
    tree_root = ET.parse(behavior_xml).getroot()
    symbol = sanitize_symbol(behavior_xml.stem)
    root_node = first_element_child(tree_root)

    chain: list[str] = []
    emit_node(root_node, nodes, 2, chain)
    if chain:
        chain[-1] += ";"

    header_name = f"{symbol}.h"
    cpp_name = f"{symbol}.cpp"
    function_name = f"create_{symbol}_tree"
    guard = include_guard(header_name)

    header = "\n".join(
        [
            f"#ifndef {guard}",
            f"#define {guard}",
            "",
            '#include "engine/game/brain.h"',
            "",
            f"engine::brain::Tree * {function_name}();",
            "",
            f"#endif // {guard}",
            "",
        ]
    )

    cpp = "\n".join(
        [
            f'#include "{header_name}"',
            include,
            "",
            f"engine::brain::Tree * {function_name}()",
            "{",
            "    using namespace engine::brain;",
            "",
            "    Builder builder;",
            "    builder",
            *chain,
            "",
            "    return builder.build();",
            "}",
            "",
        ]
    )
    return header_name, header, cpp_name, cpp


def generate_registry(nodes: dict[str, NodeDef], registry_type: str, include: str) -> tuple[str, str]:
    guard = include_guard("brain_nodes.h")
    function_name = "register_brain_nodes"
    header = "\n".join(
        [
            f"#ifndef {guard}",
            f"#define {guard}",
            "",
            '#include "engine/game/brain.h"',
            "",
            f"void {function_name}( {registry_type} & registry );",
            "",
            f"#endif // {guard}",
            "",
        ]
    )

    lines = [
        '#include "brain_nodes.h"',
        '#include "engine/game/brain.h"',
        '#include "engine/utils/xmldocument.h"',
        include,
        "",
        f"void {function_name}( {registry_type} & registry )",
        "{",
        "    using namespace engine::brain;",
        "",
    ]

    for node in sorted(nodes.values(), key=lambda item: item.name):
        validate_construct(node)
        args = [registry_arg_expr(param) for param in node.params]
        lines.extend(
            [
                f"    registry.reg( \"{node.name}\", [] ( engine::XmlNode * root ) -> Node * {{",
            ]
        )
        if node.construct == "static":
            lines.append(f"        return Leaf::create<{node.cpp}>();")
        elif args:
            joined_args = ",\n".join(f"            {arg}" for arg in args)
            lines.extend(
                [
                    f"        return new {node.cpp}(",
                    joined_args,
                    "        );",
                ]
            )
        else:
            lines.append(f"        return new {node.cpp}();")
        lines.extend(["    } );", ""])

    lines.append("}")
    lines.append("")
    return header, "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, default=Path("config"))
    parser.add_argument(
        "--nodes",
        type=Path,
        action="append",
        default=[],
        help="Extra node definition XML file. Config directory XML files are loaded first.",
    )
    parser.add_argument("--out", type=Path, default=Path("generated/behaviors"))
    parser.add_argument("--registry-out", type=Path, default=Path("generated"))
    parser.add_argument("--registry-type", default="engine::brain::Registry")
    parser.add_argument(
        "--include",
        default='// TODO: include your game behavior node headers here',
        help="Extra include line written to generated .cpp files.",
    )
    args = parser.parse_args()

    nodes = load_node_defs(args.config, args.nodes)
    args.out.mkdir(parents=True, exist_ok=True)
    args.registry_out.mkdir(parents=True, exist_ok=True)

    registry_header, registry_cpp = generate_registry(nodes, args.registry_type, args.include)
    (args.registry_out / "brain_nodes.h").write_text(registry_header, encoding="utf-8")
    (args.registry_out / "brain_nodes.cpp").write_text(registry_cpp, encoding="utf-8")
    print(f"generated {args.registry_out / 'brain_nodes.h'}")
    print(f"generated {args.registry_out / 'brain_nodes.cpp'}")

    behaviors_dir = args.config / "behaviors"
    behavior_files = sorted(behaviors_dir.glob("*.xml"))
    if not behavior_files:
        raise SystemExit(f"No behavior XML files found in {behaviors_dir}")

    for behavior_xml in behavior_files:
        header_name, header, cpp_name, cpp = generate_behavior_cpp(behavior_xml, nodes, args.include)
        (args.out / header_name).write_text(header, encoding="utf-8")
        (args.out / cpp_name).write_text(cpp, encoding="utf-8")
        print(f"generated {args.out / header_name}")
        print(f"generated {args.out / cpp_name}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
