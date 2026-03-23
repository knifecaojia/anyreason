# 对象存储提供商运维指南

## 概述

后端通过统一存储抽象层支持 MinIO 和腾讯云 COS 两个对象存储后端，通过环境变量 `OBJECT_STORAGE_PROVIDER` 在运行时切换，业务代码无需变更。

## Provider 选择

| Provider | `OBJECT_STORAGE_PROVIDER` | 适用场景 |
|----------|---------------------------|----------|
| MinIO（默认） | `minio` 或不设置 | 本地开发 |
| 腾讯云 COS | `cos` | 生产部署 |

## 切换到 COS

### 前置条件

1. 腾讯云账号已开通 COS 服务
2. 存储桶已创建（控制台手动创建，后端不会自动创建）
3. 获取 SecretId / SecretKey（建议使用子账号密钥，遵循最小权限原则）

### 配置项

```env
OBJECT_STORAGE_PROVIDER=cos
COS_SECRET_ID=<your-secret-id>
COS_SECRET_KEY=<your-secret-key>
COS_REGION=<region>          # 如 ap-shanghai
COS_BUCKET=<bucket-appid>    # 如 my-app-125xxxxxxx
COS_DOMAIN=<public-url>      # 可选，如 https://my-app-125xxxxxxx.cos.ap-shanghai.myqcloud.com
```

- `COS_DOMAIN` 省略时，后端自动拼接 `{bucket}.cos.{region}.myqcloud.com`。
- 配置不完整时，后端启动阶段会抛出 `StorageConfigError`，不会静默失败。

### 切换步骤

1. 设置上述环境变量
2. 重启后端服务
3. 验证：上传一个文件，确认可以在腾讯云控制台看到该对象

## 回退到 MinIO

```env
OBJECT_STORAGE_PROVIDER=minio
```

重启服务即可。新对象写入 MinIO，已写入 COS 的旧对象不会自动迁回。

## 数据边界

- **切换前**：已有对象在原 provider 中，不受影响
- **切换后**：新对象写入新 provider，旧对象仍在原 provider
- **跨 provider 访问**：不支持。MinIO 实例无法读取 COS 对象，反之亦然
- **URL 互不兼容**：`download_by_url` 仅匹配当前 provider 的 URL 模式

## 运维清单

| 项目 | MinIO | COS |
|------|-------|-----|
| 存储桶创建 | 后端自动创建 | **手动在控制台创建** |
| 凭证管理 | `.env` 本地配置 | `.env` 或密钥管理服务，**不可入库** |
| 公开访问 | `http://host:port/bucket/key` | `https://bucket.cos.region.myqcloud.com/key` |
| Bucket 格式 | 任意名称 | `{name}-{appid}` |

## Phase 1 不在范围内的能力

- DB 字段重命名（`minio_bucket`、`minio_key` 等保留）
- 历史数据自动迁移
- 双写 / 跨 provider 同步
- CDN 集成、生命周期策略、多地域复制
- COS 桶自动创建

## 故障排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 启动报 `StorageConfigError` | COS 配置缺失或格式错误 | 检查 `COS_SECRET_ID`、`COS_REGION`、`COS_BUCKET` 是否设置 |
| 上传 403 | SecretId/SecretKey 权限不足或已失效 | 检查密钥权限，确认对目标桶有读写权限 |
| 上传 404 (NoSuchBucket) | 桶不存在或名称/APPID 错误 | 在腾讯云控制台确认桶存在且 `COS_BUCKET` 值完全匹配 |
| 旧文件无法访问 | 对象在另一个 provider 中 | 检查对象实际存储位置，必要时手动迁移 |
