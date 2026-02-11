"""
Example Jinja2 macro functions for Impyla
"""

from datetime import datetime, timedelta


def days_ago(n):
    """
    Get date N days ago in YYYY-MM-DD format
    
    Usage in SQL:
        WHERE date >= '{{ days_ago(7) }}'
    """
    return (datetime.now() - timedelta(days=n)).strftime('%Y-%m-%d')


def today():
    """
    Get today's date in YYYY-MM-DD format
    
    Usage in SQL:
        WHERE date = '{{ today() }}'
    """
    return datetime.now().strftime('%Y-%m-%d')


def first_of_month():
    """
    Get the first day of current month
    
    Usage in SQL:
        WHERE date >= '{{ first_of_month() }}'
    """
    now = datetime.now()
    return datetime(now.year, now.month, 1).strftime('%Y-%m-%d')


def format_list(items, quote=True):
    """
    Format a list for SQL IN clause
    
    Usage in SQL:
        WHERE category IN ({{ format_list(['A', 'B', 'C']) }})
    """
    if quote:
        return ', '.join(f"'{item}'" for item in items)
    else:
        return ', '.join(str(item) for item in items)
