"use client";

import { useState } from "react";
import { Folder, File, Upload, Trash2, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface FileNode {
  id: string;
  name: string;
  is_folder: boolean;
  size_bytes?: number;
  updated_at: string;
}

interface AssetBrowserProps {
  workspaceId?: string;
  projectId?: string;
  onSelect?: (node: FileNode) => void;
}

export function AssetBrowser({ workspaceId, projectId, onSelect }: AssetBrowserProps) {
  void workspaceId;
  void projectId;
  const [currentPath, setCurrentPath] = useState<{ id: string; name: string }[]>([]);
  const [nodes] = useState<FileNode[]>([
    { id: "1", name: "Characters", is_folder: true, updated_at: "2024-03-20" },
    { id: "2", name: "Scenes", is_folder: true, updated_at: "2024-03-20" },
    { id: "3", name: "hero_v1.png", is_folder: false, size_bytes: 1024 * 500, updated_at: "2024-03-21" },
  ]);

  const handleNodeClick = (node: FileNode) => {
    if (node.is_folder) {
      setCurrentPath([...currentPath, { id: node.id, name: node.name }]);
      // TODO: Fetch children
    } else {
      onSelect?.(node);
    }
  };

  const handleUpload = () => {
    // TODO: Implement upload
    console.log("Upload clicked");
  };

  const handleCreateFolder = () => {
    // TODO: Implement create folder
    console.log("Create folder clicked");
  };

  return (
    <div className="flex flex-col h-full border rounded-lg bg-background">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCurrentPath([])}
            className={cn(currentPath.length === 0 && "font-bold text-foreground")}
          >
            Root
          </Button>
          {currentPath.map((crumb, i) => (
            <div key={crumb.id} className="flex items-center">
              <span>/</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPath(currentPath.slice(0, i + 1))}
                className={cn(i === currentPath.length - 1 && "font-bold text-foreground")}
              >
                {crumb.name}
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleCreateFolder}>
            <FolderPlus className="w-4 h-4 mr-2" />
            New Folder
          </Button>
          <Button size="sm" onClick={handleUpload}>
            <Upload className="w-4 h-4 mr-2" />
            Upload
          </Button>
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="w-[100px]">Size</TableHead>
              <TableHead className="w-[150px]">Modified</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Empty folder
                </TableCell>
              </TableRow>
            ) : (
              nodes.map((node) => (
                <TableRow
                  key={node.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleNodeClick(node)}
                >
                  <TableCell>
                    {node.is_folder ? (
                      <Folder className="w-5 h-5 text-blue-500 fill-blue-500/20" />
                    ) : (
                      <File className="w-5 h-5 text-gray-500" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{node.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {node.is_folder ? "-" : formatBytes(node.size_bytes || 0)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{node.updated_at}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
