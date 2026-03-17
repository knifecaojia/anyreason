import re

with open('/root/anyreason/nextjs-frontend/components/tasks/TaskProvider.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace getWsUrl function - using a simpler pattern
pattern = r'(function getWsUrl\(ticket: string\) \{[\s\S]*?)(const loc = window\.location;)'
replacement = r'''function getWsUrl(ticket: string) {
  if (typeof window === "undefined") return "";

  // 始终基于当前页面 origin 构建 WebSocket URL
  // 这样可以避免构建时环境变量导致的 Mixed Content 问题
  \2'''

new_content = re.sub(pattern, replacement, content)

# Remove the apiBase block
apiBase_pattern = r'const apiBase = process\.env\.NEXT_PUBLIC_API_BASE_URL;[\s\S]*?^[\s]*\}[\s]*\}[\s]*$'
new_content = re.sub(apiBase_pattern, '', new_content, flags=re.MULTILINE)

# Clean up extra newlines
new_content = re.sub(r'\n{4,}', '\n\n', new_content)

with open('/root/anyreason/nextjs-frontend/components/tasks/TaskProvider.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Fixed getWsUrl function')
