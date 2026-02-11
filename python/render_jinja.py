#!/usr/bin/env python3
"""
Render Jinja2 templates with custom plugin support
"""

import json
import sys
import os
import glob
import importlib.util
from typing import Dict, List, Any


def load_plugins(plugin_paths: List[str], base_dir: str) -> Dict[str, Any]:
    """Load custom plugins from specified paths"""
    context = {}
    loaded_plugins = []

    for plugin_path in plugin_paths:
        # Make path absolute relative to base_dir
        if not os.path.isabs(plugin_path):
            plugin_path = os.path.join(base_dir, plugin_path)

        if not os.path.exists(plugin_path):
            continue

        # Handle both files and directories
        if os.path.isfile(plugin_path):
            plugin_files = [plugin_path]
        else:
            # Glob for .py files, skip __init__.py
            plugin_files = [
                f
                for f in glob.glob(os.path.join(plugin_path, "*.py"))
                if not f.endswith("__init__.py")
            ]

        # Import each plugin file
        for plugin_file in plugin_files:
            try:
                module_name = os.path.splitext(os.path.basename(plugin_file))[0]

                # Load module dynamically
                spec = importlib.util.spec_from_file_location(module_name, plugin_file)
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(module)

                    # Extract public members (not starting with _)
                    for name in dir(module):
                        if not name.startswith("_"):
                            obj = getattr(module, name)
                            # Only include functions and simple values, not modules
                            if (
                                callable(obj)
                                or not hasattr(obj, "__module__")
                                or obj.__module__ == module_name
                            ):
                                context[name] = obj

                    loaded_plugins.append(os.path.basename(plugin_file))
            except Exception as e:
                # Log error but don't fail
                print(
                    f"Warning: Failed to load plugin {plugin_file}: {e}",
                    file=sys.stderr,
                )

    return context, loaded_plugins


def render_template(config: Dict[str, Any]) -> Dict[str, Any]:
    """Render a Jinja2 template with plugins"""
    try:
        from jinja2 import (
            Template,
            TemplateSyntaxError,
            UndefinedError,
            StrictUndefined,
        )
    except ImportError as e:
        return {
            "success": False,
            "error": f"Failed to import jinja2: {str(e)}. Please install: pip install jinja2",
            "error_type": "ImportError",
        }

    try:
        template_str = config["template"]
        variables = config.get("variables", {})
        plugin_paths = config.get("plugin_paths", [])
        base_dir = config.get("base_dir", os.getcwd())

        # Load plugins
        plugin_context, loaded_plugins = load_plugins(plugin_paths, base_dir)

        # Merge plugin context with variables
        context = {**plugin_context, **variables}

        # Create template with StrictUndefined to catch undefined variables
        template = Template(template_str, undefined=StrictUndefined)

        # Render template
        rendered = template.render(**context)

        return {"success": True, "rendered": rendered, "loaded_plugins": loaded_plugins}

    except TemplateSyntaxError as e:
        return {
            "success": False,
            "error": str(e),
            "error_type": "TemplateSyntaxError",
            "line": e.lineno,
        }

    except UndefinedError as e:
        return {"success": False, "error": str(e), "error_type": "UndefinedError"}

    except Exception as e:
        return {"success": False, "error": str(e), "error_type": type(e).__name__}


def main():
    """Main entry point"""
    try:
        # Read input from stdin
        input_data = sys.stdin.read()
        config = json.loads(input_data)

        # Render template
        result = render_template(config)

        # Write result to stdout
        print(json.dumps(result))
        sys.exit(0)

    except json.JSONDecodeError as e:
        error_result = {
            "success": False,
            "error": f"Invalid JSON input: {str(e)}",
            "error_type": "JSONDecodeError",
        }
        print(json.dumps(error_result))
        sys.exit(1)

    except Exception as e:
        error_result = {
            "success": False,
            "error": f"Unexpected error: {str(e)}",
            "error_type": type(e).__name__,
        }
        print(json.dumps(error_result))
        sys.exit(1)


if __name__ == "__main__":
    main()
