import sys
import json
import time
from impala.dbapi import connect
from impala.error import Error as ImpalaError

def execute_impala_query():
    try:
        # Read JSON from stdin
        input_data = json.loads(sys.stdin.read())
        sql_query = input_data.get('sql', '')
        config = input_data.get('config', {})

        connection_config = config.get('connection', {})
        ext_config = config.get('extension', {})

        host = connection_config.get('host')
        port = connection_config.get('port', 21050)
        database = connection_config.get('database', 'default')
        auth_mechanism = connection_config.get('auth_mechanism', 'PLAIN')
        user = connection_config.get('user')
        password = connection_config.get('password')
        timeout = connection_config.get('timeout', 300)
        use_ssl = connection_config.get('use_ssl', False)
        max_rows = ext_config.get('max_rows', 10000)

        if not host:
            raise ValueError("Impala host is not configured in .impyla.yml")

        conn = None
        cursor = None
        start_time = time.time()
        try:
            conn = connect(
                host=host,
                port=port,
                database=database,
                auth_mechanism=auth_mechanism,
                user=user,
                password=password,
                timeout=timeout,
                use_ssl=use_ssl
            )
            cursor = conn.cursor()
            cursor.execute(sql_query)

            columns = [col[0] for col in cursor.description] if cursor.description else []
            data = []
            row_count = 0
            for row in cursor:
                if row_count >= max_rows:
                    sys.stderr.write(f"Warning: Maximum row limit ({max_rows}) reached. Truncating results.")
                    break
                data.append(list(row))
                row_count += 1

            execution_time = int((time.time() - start_time) * 1000) # milliseconds

            result = {
                'success': True,
                'data': data,
                'columns': columns,
                'rowCount': row_count,
                'executionTime': execution_time,
                'error': None
            }
            json.dump(result, sys.stdout)

        except ModuleNotFoundError as mne:
            json.dump({'success': False, 'error': f"MISSING_MODULE: {mne.name}"}, sys.stdout)
            sys.stderr.write(f"ModuleNotFoundError: {mne}\n")
            sys.exit(1)
        except ImpalaError as ie:
            json.dump({'success': False, 'error': f"Impala Error: {ie}"}, sys.stdout)
            sys.stderr.write(f"Impala Error: {ie}")
            sys.exit(1)
        except Exception as e:
            json.dump({'success': False, 'error': f"Query execution failed: {e}"}, sys.stdout)
            sys.stderr.write(f"Query execution failed: {e}")
            sys.exit(1)
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()

    except Exception as e:
        json.dump({'success': False, 'error': str(e)}, sys.stdout)
        sys.stderr.write(f"Error in execute_query.py: {e}")
        sys.exit(1)

if __name__ == '__main__':
    execute_impala_query()
