import sys
import json
from jinja2 import Template, Environment, FileSystemLoader, select_autoescape

def render_jinja_template():
    try:
        # Read JSON from stdin
        input_data = json.loads(sys.stdin.read())
        template_string = input_data.get('template', '')
        variables = input_data.get('variables', {})
        plugin_paths = input_data.get('plugin_paths', []) # Not yet used in JinjaService, but good to have

        # Set up Jinja2 environment (basic for now, can be extended with plugin_paths)
        env = Environment(
            loader=FileSystemLoader(plugin_paths) if plugin_paths else None,
            autoescape=select_autoescape(['html', 'xml'])
        )

        template = env.from_string(template_string)
        rendered_template = template.render(variables)

        # Output JSON to stdout
        json.dump({'success': True, 'rendered': rendered_template}, sys.stdout)

    except ModuleNotFoundError as mne:
        json.dump({'success': False, 'error': f"MISSING_MODULE: {mne.name}"}, sys.stdout)
        sys.stderr.write(f"ModuleNotFoundError: {mne}\n")
        sys.exit(1)
    except Exception as e:
        json.dump({'success': False, 'error': str(e)}, sys.stdout)
        sys.stderr.write(f"Error in render_jinja.py: {e}")
        sys.exit(1)

if __name__ == '__main__':
    render_jinja_template()
