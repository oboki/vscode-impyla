-- Advanced Jinja2 Template with Custom Macros
-- This file demonstrates using custom Python macros

SELECT 
  date,
  category,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM sales_data
WHERE 
  -- Using custom macro: get data from last 30 days
  date >= '{{ days_ago(30) }}'
  AND date <= '{{ today() }}'
  
  -- Using custom macro: filter by categories
  AND category IN ({{ format_list(['Electronics', 'Clothing', 'Food']) }})
  
GROUP BY date, category
ORDER BY date DESC, total_amount DESC
LIMIT 100;
