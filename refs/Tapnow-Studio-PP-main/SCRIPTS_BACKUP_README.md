# Scripts 备份说明

## 目标
- 对 `scripts/` 目录做独立备份。
- 当脚本有变动时自动生成新的备份 zip；无变动时跳过，避免重复包。

## 使用方式
在仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/backup_scripts.ps1 -Tag release_3_8_7
```

可选参数：
- `-Force`：即使脚本内容未变化，也强制生成新备份包。

## 产物位置
- 备份 zip：`backups/scripts_backup_<tag>_<timestamp>.zip`
- 备份清单：`backups/scripts_backup_<tag>_<timestamp>.manifest.json`

## 最近一次备份
- zip：`backups/scripts_backup_release_3_8_7_20260211-223225.zip`
- manifest：`backups/scripts_backup_release_3_8_7_20260211-223225.manifest.json`

## 备注
- `manifest` 内包含每个脚本文件的 `sha256` 与 `tree_sha256`，用于判断是否发生变化。
