#!/usr/bin/env python3
"""
Generate engine::brain Builder C++ code from behavior tree XML files.

This script is intentionally self-contained so it can be copied into the C++
server project and adapted to that project's include paths and factory naming.
It does not generate node implementations or runtime node registration.
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


@dataclass(frozen=True)
class NodeDef:
    name: str
    cpp: str
    category: str
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
                )
            )
        params.sort(key=lambda item: item.order)
        nodes[name] = NodeDef(
            name=name,
            cpp=elem.attrib.get("cpp", name),
            category=elem.attrib["category"],
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


def node_args(elem: ET.Element, node_def: NodeDef) -> str:
    args = []
    for param in node_def.params:
        value = elem.attrib.get(param.name, param.default)
        args.append(format_arg(value, param.type))
    return ", ".join(args)


def emit_node(elem: ET.Element, nodes: dict[str, NodeDef], depth: int, lines: list[str]) -> None:
    name = node_type(elem)
    if name not in nodes:
        raise ValueError(f"Unknown node type: {name}")

    node_def = nodes[name]
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
        lines.append(f"{indent}.leaf<{node_def.cpp}>{call_args}")
    else:
        raise ValueError(f"Unsupported category {node_def.category} for node {name}")


def first_element_child(elem: ET.Element) -> ET.Element:
    children = list(elem)
    if len(children) != 1:
        raise ValueError("BehaviorTree must have exactly one root node.")
    return children[0]


def generate_behavior_cpp(behavior_xml: Path, nodes: dict[str, NodeDef], include: str) -> tuple[str, str, str]:
    tree_root = ET.parse(behavior_xml).getroot()
    tree_name = tree_root.attrib.get("name", behavior_xml.stem)
    symbol = sanitize_symbol(tree_name)
    root_node = first_element_child(tree_root)

    chain: list[str] = []
    emit_node(root_node, nodes, 1, chain)

    header_name = f"{symbol}.gen.h"
    cpp_name = f"{symbol}.gen.cpp"
    function_name = f"create_{symbol}_tree"

    header = "\n".join(
        [
            "#pragma once",
            "",
            '#include "engine/game/brain.h"',
            "",
            f"engine::brain::Tree * {function_name}();",
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
            "    builder" + "\n".join(chain) + ";",
            "",
            "    return builder.build();",
            "}",
            "",
        ]
    )
    return header_name, header, cpp_name, cpp


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
    parser.add_argument(
        "--include",
        default='// TODO: include your game behavior node headers here',
        help="Extra include line written to generated .cpp files.",
    )
    args = parser.parse_args()

    nodes = load_node_defs(args.config, args.nodes)
    args.out.mkdir(parents=True, exist_ok=True)

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
