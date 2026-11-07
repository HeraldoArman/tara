"use client";

import { Button } from "@tara/ui/components/button";
import { Input } from "@tara/ui/components/input";
import { Textarea } from "@tara/ui/components/textarea";
import { cn } from "@tara/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { createContext, useContext, useId } from "react";

const InputGroupControlId = createContext<string | undefined>(undefined);

function InputGroup({
  className,
  controlId,
  ...props
}: React.ComponentProps<"fieldset"> & { controlId?: string }) {
  const generatedId = useId();
  return (
    <InputGroupControlId value={controlId ?? generatedId}>
      <fieldset
        className={cn(
          "group/input-group relative flex h-8 w-full min-w-0 items-center rounded-none border border-input bg-background shadow-xs outline-none transition-[color,box-shadow] has-[>textarea]:h-auto dark:bg-input/30",
          "has-[>[data-align=inline-end]]:[&>input]:pr-2 has-[>[data-align=inline-start]]:[&>input]:pl-2",
          "has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col has-[>[data-align=block-start]]:[&>input]:pb-3",
          "has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-end]]:[&>input]:pt-3",
          "has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-1 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50",
          "has-[[data-slot][aria-invalid=true]]:border-destructive has-[[data-slot][aria-invalid=true]]:ring-1 has-[[data-slot][aria-invalid=true]]:ring-destructive/20 dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40",
          className
        )}
        data-slot="input-group"
        {...props}
      />
    </InputGroupControlId>
  );
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text select-none items-center justify-center gap-2 py-1.5 font-medium text-muted-foreground text-xs group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-none [&>svg:not([class*='size-'])]:size-4",
  {
    defaultVariants: {
      align: "inline-start",
    },
    variants: {
      align: {
        "block-end":
          "order-last w-full justify-start px-2.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2",
        "block-start":
          "order-first w-full justify-start px-2.5 pt-2 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2",
        "inline-end":
          "order-last pr-2 has-[>button]:mr-[-0.3rem] has-[>kbd]:mr-[-0.15rem]",
        "inline-start":
          "order-first pl-2 has-[>button]:ml-[-0.3rem] has-[>kbd]:ml-[-0.15rem]",
      },
    },
  }
);

function InputGroupAddon({
  className,
  align = "inline-start",
  htmlFor,
  children,
  ...props
}: React.ComponentProps<"label"> &
  VariantProps<typeof inputGroupAddonVariants>) {
  const controlId = useContext(InputGroupControlId);
  return (
    <label
      className={cn(inputGroupAddonVariants({ align }), className)}
      data-align={align}
      data-slot="input-group-addon"
      htmlFor={htmlFor ?? controlId}
      {...props}
    >
      {children}
    </label>
  );
}

const inputGroupButtonVariants = cva(
  "flex items-center gap-2 text-xs shadow-none",
  {
    defaultVariants: {
      size: "xs",
    },
    variants: {
      size: {
        "icon-sm": "size-7 rounded-none p-0 has-[>svg]:p-0",
        "icon-xs": "size-6 rounded-none p-0 has-[>svg]:p-0",
        sm: "h-7 gap-1 rounded-none px-2",
        xs: "h-6 gap-1 rounded-none px-1.5 [&>svg:not([class*='size-'])]:size-3.5",
      },
    },
  }
);

function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size" | "type"> &
  VariantProps<typeof inputGroupButtonVariants> & {
    type?: "button" | "submit" | "reset";
  }) {
  return (
    <Button
      className={cn(inputGroupButtonVariants({ size }), className)}
      data-size={size}
      type={type}
      variant={variant}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-muted-foreground text-xs [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none",
        className
      )}
      {...props}
    />
  );
}

function InputGroupInput({
  className,
  id,
  ...props
}: React.ComponentProps<"input">) {
  const controlId = useContext(InputGroupControlId);
  return (
    <Input
      className={cn(
        "flex-1 rounded-none border-0 bg-transparent shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent",
        className
      )}
      data-slot="input-group-control"
      id={id ?? controlId}
      {...props}
    />
  );
}

function InputGroupTextarea({
  className,
  id,
  ...props
}: React.ComponentProps<"textarea">) {
  const controlId = useContext(InputGroupControlId);
  return (
    <Textarea
      className={cn(
        "flex-1 resize-none rounded-none border-0 bg-transparent py-2 shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent",
        className
      )}
      data-slot="input-group-control"
      id={id ?? controlId}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
};
