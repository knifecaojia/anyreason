"use client";

import React, { useMemo } from 'react';
import { MediaParamSchema, MediaParamProperty } from '@/lib/aistudio/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { cn } from "@/lib/utils";

interface MediaGenerationFormProps {
  schema: MediaParamSchema;
  value: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
  className?: string;
}

export function MediaGenerationForm({ schema, value, onChange, className }: MediaGenerationFormProps) {
  
  const sortedKeys = useMemo(() => {
    const keys = Object.keys(schema.properties);
    if (schema["ui:order"]) {
      return schema["ui:order"].filter(k => keys.includes(k));
    }
    // Fallback: use ui:order in property if available, or default order
    return keys.sort((a, b) => {
      const orderA = schema.properties[a]["ui:order"] ?? 999;
      const orderB = schema.properties[b]["ui:order"] ?? 999;
      return orderA - orderB;
    });
  }, [schema]);

  const handleChange = (key: string, newValue: any) => {
    onChange({
      ...value,
      [key]: newValue
    });
  };

  return (
    <div className={cn("space-y-4", className)}>
      {sortedKeys.map(key => {
        const prop = schema.properties[key];
        return (
          <div key={key} className="space-y-2">
            <FieldRenderer 
              fieldKey={key} 
              property={prop} 
              value={value[key]} 
              onChange={(v) => handleChange(key, v)} 
              required={schema.required?.includes(key)}
            />
          </div>
        );
      })}
    </div>
  );
}

interface FieldRendererProps {
  fieldKey: string;
  property: MediaParamProperty;
  value: any;
  onChange: (value: any) => void;
  required?: boolean;
}

function FieldRenderer({ fieldKey, property, value, onChange, required }: FieldRendererProps) {
  const label = property.title || fieldKey;
  const description = property.description;
  
  // Default value handling if value is undefined
  // Note: Parent should ideally initialize default values
  const currentValue = value === undefined ? property.default : value;

  const renderInput = () => {
    // 1. Enum -> Select
    if (property.enum) {
      return (
        <Select 
          value={String(currentValue ?? property.enum[0])} 
          onValueChange={(val) => {
            // Convert back to number if needed
            if (property.type === 'integer' || property.type === 'number') {
              onChange(Number(val));
            } else {
              onChange(val);
            }
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {property.enum.map((opt) => (
              <SelectItem key={String(opt)} value={String(opt)}>
                {String(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // 2. Boolean -> Switch (Simulated with Checkbox or Select)
    if (property.type === 'boolean') {
      // Use a simple checkbox style or toggle
      return (
        <div className="flex items-center space-x-2">
            <input 
                type="checkbox" 
                id={`field-${fieldKey}`}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                checked={!!currentValue}
                onChange={(e) => onChange(e.target.checked)}
            />
            <Label htmlFor={`field-${fieldKey}`} className="font-normal cursor-pointer">
                {currentValue ? "Enabled" : "Disabled"}
            </Label>
        </div>
      );
    }

    // 3. Slider
    if (property["ui:widget"] === 'slider' || (property.minimum !== undefined && property.maximum !== undefined)) {
      return (
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={property.minimum}
            max={property.maximum}
            step={property.type === 'integer' ? 1 : 0.1}
            value={Number(currentValue || property.minimum || 0)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-sm w-12 text-right">{currentValue}</span>
        </div>
      );
    }

    // 4. Textarea
    if (property["ui:widget"] === 'textarea') {
      return (
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={currentValue || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={String(property.default || '')}
        />
      );
    }

    // 5. Default Input
    return (
      <Input
        type={property.type === 'integer' || property.type === 'number' ? 'number' : 'text'}
        value={currentValue || ''}
        onChange={(e) => {
            const val = e.target.value;
            if (property.type === 'integer') {
                onChange(parseInt(val) || 0);
            } else if (property.type === 'number') {
                onChange(parseFloat(val) || 0);
            } else {
                onChange(val);
            }
        }}
        placeholder={String(property.default || '')}
      />
    );
  };

  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <Label htmlFor={`field-${fieldKey}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {label} {required && <span className="text-destructive">*</span>}
        </Label>
      </div>
      {renderInput()}
      {description && <p className="text-[0.8rem] text-muted-foreground mt-1.5">{description}</p>}
    </div>
  );
}
