-- Jinja2 Template Example
-- This file demonstrates Jinja2 templating with variables

SELECT 
  *
FROM {{ table_name }}
WHERE 
  created_date >= '{{ start_date }}'
  AND created_date <= '{{ end_date }}'
  AND status = '{{ status }}'
LIMIT {{ limit }};
