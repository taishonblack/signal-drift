import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import MobileNav from "@/components/MobileNav";
import MakoBackground from "@/components/MakoBackground";

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  // "B" keyboard shortcut for sidebar toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "b" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
        document.querySelector<HTMLButtonElement>("[data-sidebar='trigger']")?.click();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <MakoBackground />
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="hidden md:flex items-center h-12 px-4 border-b border-border/20">
            <SidebarTrigger data-sidebar="trigger" className="text-muted-foreground hover:text-foreground" />
          </header>
          <MobileNav />
          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;
