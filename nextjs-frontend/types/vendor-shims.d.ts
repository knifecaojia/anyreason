declare module "@google/genai" {
  export type GenerateContentResponse = {
    text?: string;
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: {
            data: string;
          };
        }>;
      };
    }>;
  };

  export class GoogleGenAI {
    constructor(options: { apiKey?: string });
    models: {
      generateContent(args: unknown): Promise<GenerateContentResponse>;
    };
  }
}

declare module "@xyflow/react" {
  import * as React from "react";

  export type XYPosition = { x: number; y: number };

  export type Node<TData = unknown, TType extends string = string> = {
    id: string;
    type?: TType;
    position: XYPosition;
    data: TData;
    selected?: boolean;
    width?: number;
    height?: number;
  };

  export type Edge = {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    animated?: boolean;
    style?: React.CSSProperties;
  };

  export type Connection = {
    source?: string | null;
    target?: string | null;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  };

  export type NodeProps<TData = unknown> = {
    id: string;
    data: TData;
    selected: boolean;
  };

  export const Position: {
    Left: "left";
    Right: "right";
    Top: "top";
    Bottom: "bottom";
  };

  export function addEdge<TEdge extends Edge>(
    connection: Connection & Record<string, unknown>,
    edges: TEdge[],
  ): TEdge[];

  export const Background: React.ComponentType<Record<string, unknown>>;
  export const Controls: React.ComponentType<Record<string, unknown>>;
  export const Handle: React.ComponentType<Record<string, unknown>>;
  export const ReactFlowProvider: React.ComponentType<{ children: React.ReactNode }>;

  export function ReactFlow(props: Record<string, unknown>): React.ReactElement;

  export function useNodesState<TNode extends Node>(
    initialNodes: TNode[],
  ): [TNode[], React.Dispatch<React.SetStateAction<TNode[]>>, (changes: unknown) => void];

  export function useEdgesState<TEdge extends Edge>(
    initialEdges: TEdge[],
  ): [TEdge[], React.Dispatch<React.SetStateAction<TEdge[]>>, (changes: unknown) => void];

  export function useOnSelectionChange(args: {
    onChange: (payload: { nodes: Node[]; edges: Edge[] }) => void;
  }): void;

  export function useReactFlow(): {
    fitView: () => void;
    screenToFlowPosition: (pos: XYPosition) => XYPosition;
  };
}
