import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0a0704] disabled:opacity-50 disabled:pointer-events-none",
          {
            "bg-amber-500 text-zinc-950 hover:bg-amber-400 focus:ring-amber-500":
              variant === "primary",
            "bg-zinc-800 text-white hover:bg-zinc-700 focus:ring-zinc-500":
              variant === "secondary",
            "border-2 border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-zinc-950 focus:ring-amber-500":
              variant === "outline",
          },
          {
            "px-3 py-1.5 text-sm": size === "sm",
            "px-5 py-2.5 text-base": size === "md",
            "px-8 py-3 text-lg": size === "lg",
          },
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
