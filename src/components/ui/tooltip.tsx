"use client"

import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

const TooltipProvider = ({
    delayDuration = 100,
    ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) => (
    <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
)

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
    React.ElementRef<typeof TooltipPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
    <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
            "z-50 rounded-md border bg-popover px-3 py-1.5 text-xs text-muted-foreground drop-shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 duration-150 group",
            className
        )}
        {...props}
    >
        {props.children}
        <TooltipPrimitive.Arrow asChild>
            <div className="z-50 h-2.5 w-2.5 rotate-45 border-r border-b border-border bg-popover group-data-[side=bottom]:rotate-[225deg] group-data-[side=left]:-rotate-45 group-data-[side=right]:rotate-[135deg] group-data-[side=top]:-mt-1 group-data-[side=bottom]:-mb-1 group-data-[side=left]:-mr-1 group-data-[side=right]:-ml-1" />
        </TooltipPrimitive.Arrow>
    </TooltipPrimitive.Content>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
