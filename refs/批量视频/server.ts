import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API 路由
  
  // 获取设置
  app.get("/api/settings", (req, res) => {
    const settingsPath = path.join(process.cwd(), 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      res.json(settings);
    } else {
      res.json({
        imageApiKeys: [""],
        videoApiKeys: [""],
        storagePath: "",
        paths: {
          main: 'exports/main',
          storyboard: 'exports/storyboard',
          videoPreview: 'exports/video-preview'
        }
      });
    }
  });

  // 保存设置
  app.post("/api/settings", (req, res) => {
    const settings = req.body;
    const settingsPath = path.join(process.cwd(), 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    
    // 确保存储路径存在
    if (settings.paths) {
      const root = settings.storagePath || process.cwd();
      Object.values(settings.paths).forEach((p: any) => {
        if (p) {
          const fullPath = path.isAbsolute(p) ? p : path.join(root, p);
          if (!fs.existsSync(fullPath)) {
            try {
              fs.mkdirSync(fullPath, { recursive: true });
            } catch (e) {
              console.error(`无法创建目录: ${fullPath}`, e);
            }
          }
        }
      });
    }
    
    res.json({ success: true });
  });

  // 获取视频生成历史
  app.get("/api/video-history", (req, res) => {
    const historyPath = path.join(process.cwd(), 'video_history.json');
    if (fs.existsSync(historyPath)) {
      const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
      res.json(history);
    } else {
      res.json([]);
    }
  });

  // 更新/保存视频生成历史
  app.post("/api/video-history", (req, res) => {
    const newRecord = req.body;
    const historyPath = path.join(process.cwd(), 'video_history.json');
    let history = [];
    if (fs.existsSync(historyPath)) {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    }
    
    const index = history.findIndex((h: any) => h.id === newRecord.id);
    if (index !== -1) {
      history[index] = { ...history[index], ...newRecord };
    } else {
      history.push(newRecord);
    }
    
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
    res.json({ success: true });
  });

  // 保存文件到本地路径
  app.post("/api/save-asset", (req, res) => {
    const { dataUrl, filename, page } = req.body;
    const settingsPath = path.join(process.cwd(), 'settings.json');
    let root = process.cwd();
    let subPath = path.join('exports', page || 'main');
    
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (settings.storagePath) {
        root = settings.storagePath;
      }
      if (settings.paths && settings.paths[page]) {
        subPath = settings.paths[page];
      }
    }

    const storagePath = path.isAbsolute(subPath) ? subPath : path.join(root, subPath);

    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    const base64Data = dataUrl.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    const filePath = path.join(storagePath, filename);
    
    fs.writeFileSync(filePath, buffer);
    res.json({ success: true, path: filePath });
  });

  // Vite 中间件
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
  });
}

startServer();
