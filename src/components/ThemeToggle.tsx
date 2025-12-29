"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);

    // Avoid hydration mismatch
    React.useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <Button
                variant="outline"
                size="icon"
                className="border-none bg-secondary text-secondary-foreground rounded-full"
                disabled
            >
                <div className="h-4 w-4" />
            </Button>
        );
    }

    return (
        <Button
            variant="outline"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="group border-none bg-secondary text-secondary-foreground hover:bg-secondary-foreground/10 transition-all duration-200 rounded-full"
            aria-label="Toggle theme"
        >
            {theme === "dark" ? (
                <Sun className="h-4 w-4 transition-transform" />
            ) : (
                <Moon className="h-4 w-4 transition-transform" />
            )}
        </Button>
    );
}
