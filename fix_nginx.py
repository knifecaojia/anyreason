#!/usr/bin/env python3
import re

# Read the file
with open('/root/anyreason/docker-deploy/nginx/default.conf', 'r') as f:
    content = f.read()

# Define old and new blocks
old_block = '''    # 通用 API 路由
    location /api/ {
        rewrite ^/api/(?!v1/)(.*)$ /api/v1/$1 break;
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Authorization $final_auth_header;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }'''

new_block = '''    # 后端 API 路由 /api/v1/* 直接代理到后端
    location /api/v1/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Authorization $final_auth_header;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    # Next.js API 路由 /api/* (但不是 /api/v1/*) 转发到前端
    location /api/ {
        proxy_pass http://frontend:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }'''

# Replace
if old_block in content:
    content = content.replace(old_block, new_block)
    with open('/root/anyreason/docker-deploy/nginx/default.conf', 'w') as f:
        f.write(content)
    print('SUCCESS: Nginx configuration updated')
else:
    print('ERROR: Could not find the block to replace')
