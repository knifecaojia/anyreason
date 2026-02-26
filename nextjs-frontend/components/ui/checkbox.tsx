import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <div className="relative inline-flex items-center">
    <input
      type="checkbox"
      className={cn(
        "peer h-4 w-4 shrink-0 appearance-none rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 checked:bg-primary checked:text-primary-foreground",
        className
      )}
      ref={ref}
      {...props}
    />
    <Check className="pointer-events-none absolute top-0 left-0 h-4 w-4 hidden peer-checked:block text-primary-foreground p-0.5" strokeWidth={3} />
  </div>
))
Checkbox.displayName = "Checkbox"

export { Checkbox }
