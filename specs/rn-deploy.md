我需要你把当前项目部署到服务器上，通过docker 运行

目前服务器的docker 容器情况

root@racknerd-4e16e0e:/etc/nginx/sites-enabled# docker ps
CONTAINER ID   IMAGE                                       COMMAND                  CREATED       STATUS                 PORTS                                                                          NAMES
8d8b741eb0f6   nginx:latest                                "sh -c 'cp /docker-e…"   3 weeks ago   Up 3 weeks             0.0.0.0:80->80/tcp, [::]:80->80/tcp, 0.0.0.0:443->443/tcp, [::]:443->443/tcp   docker-nginx-1
937f39d12b66   langgenius/dify-api:1.11.4                  "/bin/bash /entrypoi…"   3 weeks ago   Up 3 weeks             5001/tcp                                                                       docker-worker_beat-1
68c5b8a2d2c0   langgenius/dify-api:1.11.4                  "/bin/bash /entrypoi…"   3 weeks ago   Up 3 weeks             5001/tcp                                                                       docker-api-1
56e9151da6c0   langgenius/dify-api:1.11.4                  "/bin/bash /entrypoi…"   3 weeks ago   Up 3 weeks             5001/tcp                                                                       docker-worker-1
f5b4d882eaa8   langgenius/dify-plugin-daemon:0.5.2-local   "/bin/bash -c /app/e…"   3 weeks ago   Up 3 weeks             0.0.0.0:5003->5003/tcp, [::]:5003->5003/tcp                                    docker-plugin_daemon-1
946e743305ff   postgres:15-alpine                          "docker-entrypoint.s…"   3 weeks ago   Up 3 weeks (healthy)   5432/tcp                                                                       docker-db_postgres-1
8b784acd96e8   redis:6-alpine                              "docker-entrypoint.s…"   3 weeks ago   Up 3 weeks (healthy)   6379/tcp                                                                       docker-redis-1
3afcd1f5fa5c   langgenius/dify-web:1.11.4                  "/bin/sh ./entrypoin…"   3 weeks ago   Up 3 weeks             3000/tcp                                                                       docker-web-1
4f6f879715e9   semitechnologies/weaviate:1.27.0            "/bin/weaviate --hos…"   3 weeks ago   Up 3 weeks                                                                                            docker-weaviate-1
39f5622d2df1   langgenius/dify-sandbox:0.2.12              "/main"                  3 weeks ago   Up 3 weeks (healthy)                                                                                  docker-sandbox-1
f97c14ca8e73   ubuntu/squid:latest


服务器ip  172.245.56.55  域名： ai.znxview.com 使用ssh 私钥连接

请你根据上述的需求，设计部署方案，等我同意在部署，注意不要和服务器上的现有业务冲突
