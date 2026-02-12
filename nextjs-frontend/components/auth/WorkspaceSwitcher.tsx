"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Workspace {
  id: string;
  name: string;
}

export function WorkspaceSwitcher() {
  const workspaces: Workspace[] = [
    { id: "1", name: "Personal" },
    { id: "2", name: "Acme Corp" },
  ];

  return (
    <Select defaultValue="1">
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select workspace" />
      </SelectTrigger>
      <SelectContent>
        {workspaces.map((ws) => (
          <SelectItem key={ws.id} value={ws.id}>
            {ws.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
