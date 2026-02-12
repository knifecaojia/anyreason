"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Clock, MapPin, Sun, Video } from "lucide-react";

interface Storyboard {
  id: string;
  shot_code: string;
  shot_number: number;
  scene_number: number;
  description: string;
  duration_estimate?: number;
  location?: string;
  time_of_day?: string;
  active_assets: string[];
}

interface StoryboardTimelineProps {
  storyboards: Storyboard[];
  onSelect: (id: string) => void;
  selectedId?: string;
}

export function StoryboardTimeline({ storyboards, onSelect, selectedId }: StoryboardTimelineProps) {
  // Group storyboards by scene_number for visual grouping
  const groupedStoryboards = storyboards.reduce((acc, sb) => {
    const key = sb.scene_number;
    if (!acc[key]) acc[key] = [];
    acc[key].push(sb);
    return acc;
  }, {} as Record<number, Storyboard[]>);

  return (
    <ScrollArea className="h-full w-full bg-background border rounded-lg">
      <div className="p-4 space-y-6">
        {Object.entries(groupedStoryboards).map(([sceneNum, shots]) => (
          <div key={sceneNum} className="space-y-2">
            {/* Scene Header (Virtual Grouping) */}
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <span className="bg-muted px-2 py-1 rounded">Scene {sceneNum}</span>
              {shots[0].location && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {shots[0].location}
                </div>
              )}
              {shots[0].time_of_day && (
                <div className="flex items-center gap-1">
                  <Sun className="w-3 h-3" />
                  {shots[0].time_of_day}
                </div>
              )}
            </div>

            {/* Shots Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {shots.map((shot) => (
                <div
                  key={shot.id}
                  onClick={() => onSelect(shot.id)}
                  className={cn(
                    "relative group cursor-pointer border rounded-md p-3 space-y-3 transition-all hover:shadow-md",
                    selectedId === shot.id
                      ? "border-primary ring-1 ring-primary bg-primary/5"
                      : "bg-card hover:border-primary/50"
                  )}
                >
                  {/* Header */}
                  <div className="flex justify-between items-start">
                    <Badge variant="outline" className="font-mono text-xs">
                      {shot.shot_code.split("_").pop()} {/* Display SH01 */}
                    </Badge>
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Clock className="w-3 h-3 mr-1" />
                      {shot.duration_estimate || 0}s
                    </div>
                  </div>

                  {/* Content Preview */}
                  <p className="text-sm line-clamp-3 text-card-foreground/90">
                    {shot.description || "No description"}
                  </p>

                  {/* Footer Actions */}
                  <div className="flex justify-between items-center pt-2">
                    <div className="flex -space-x-2 overflow-hidden">
                      {/* Asset Avatars Placeholder */}
                      {shot.active_assets.slice(0, 3).map((_, i) => (
                        <div
                          key={i}
                          className="inline-block h-6 w-6 rounded-full ring-2 ring-background bg-muted"
                        />
                      ))}
                    </div>
                    <Button size="icon" variant="ghost" className="h-6 w-6">
                      <Video className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Separator className="my-4" />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
